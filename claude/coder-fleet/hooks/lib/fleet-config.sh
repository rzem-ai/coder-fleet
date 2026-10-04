# fleet-config.sh - read and validate a project's .claude/coder-fleet.json.
#
# Sourced, never run. CF-111: a project disables fleet agents by listing them
# under `disabledAgents` in .claude/coder-fleet.json. This file is the one
# reading of that list, shared by enforce-disabled-agents.sh and
# scripts/fleet-agents.sh, and review-round.js reads it the same way, so the
# rules below are stated once:
#
#   - The file that counts is the one in the repository's main checkout, read
#     live, uncommitted edits included (fleet_config_root). A linked worktree's
#     copy never counts, so a branch under review cannot disable its own
#     refuter, and a toggle needs no commit.
#   - No file, or no `disabledAgents` key: nothing is disabled. Today's fleet.
#   - The file must be a JSON object, and `disabledAgents`, when present, a list
#     of strings. Other top-level keys are ignored.
#   - The file is exactly one strict JSON value, as JSON.parse reads it: no
#     byte order mark, no NaN or Infinity, no 01, 1., .5 or +1, no raw control
#     character inside a string, nothing after the value but JSON whitespace,
#     and brackets nested no deeper than 64 levels.
#   - A name must be printable ASCII; any other byte (a non-ASCII letter or
#     space, a tab, a newline) makes it invalid. It is then trimmed of spaces,
#     lower-cased and has any `coder-fleet:` prefix dropped, in that order, so
#     " coder-fleet:Refuter" and "refuter" are one entry. After that it must
#     look like an agent name: a lower-case letter or digit, then letters,
#     digits, hyphens or underscores.
#   - lead, coder and reviewer are the core of the fleet and cannot be disabled.
#   - A file that breaks any rule is invalid, and an invalid file honours
#     nothing: every agent stays enabled, and the caller reports the reason. A
#     core entry therefore never takes effect, and neither does anything listed
#     beside it, because a half-read config is a guess about what was meant.
#
# Nothing is cached. Every call to fleet_config_read reads the file, so an edit
# takes effect on the next call with no restart (CF-111 criterion 7).
#
# Written for bash 3.2. Parsing needs python3 (lib/fleet-config.py); without it,
# or when it is on PATH but cannot run, the state is "invalid", nothing is
# honoured, and the reason says which.
#
#   fleet_config_root <dir>      the main worktree of the repository <dir> is in,
#                                even from a linked worktree; prints nothing and
#                                returns 1 when there is none it can trust.
#                                No <dir>: CLAUDE_PROJECT_DIR, then $PWD
#   fleet_config_read <root>     sets FLEET_CONFIG_PATH, FLEET_CONFIG_STATE
#                                (absent | ok | invalid | unreadable |
#                                unresolved: <root> empty, nothing read),
#                                FLEET_CONFIG_REASON (why invalid or unreadable)
#                                and FLEET_CONFIG_DISABLED (space-separated
#                                normalised names, empty unless ok). Returns 0.
#   fleet_config_normalise <name>
#   fleet_roster <plugin root>   prints the fleet's agents, space-separated and
#                                sorted: one per body under <plugin root>/agents,
#                                a -fable variant folded into its base. Prints
#                                nothing when there is no body. The one roster
#                                scripts/fleet-agents.sh and --check both use
#   fleet_agent_disabled <type>  0 when the last read disables <type>, bare or
#                                coder-fleet:-prefixed; 1 otherwise, including
#                                for another plugin's agent of the same name

FLEET_CONFIG_REL=".claude/coder-fleet.json"
FLEET_CORE_AGENTS="lead coder reviewer"
FLEET_CONFIG_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fleet_roster() {
  local body base roster=""
  for body in "$1"/agents/*.md; do
    [ -f "$body" ] || continue
    base="$(basename "$body" .md)"
    roster="$roster
${base%-fable}"
  done
  printf '%s\n' "$roster" | sed '/^$/d' | LC_ALL=C sort -u | tr '\n' ' ' | sed 's/ $//'
}

fleet_config_normalise() {
  local n
  n="$(printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  printf '%s' "${n#coder-fleet:}"
}

# The main worktree is the first entry `git worktree list --porcelain` prints,
# whichever worktree of the repository asks. Not --show-toplevel, which names
# the linked worktree a branch under review lives in, and not the parent of
# --git-common-dir, which is wrong for a repository cloned with
# --separate-git-dir. When the main worktree's directory has gone, its path is
# still returned: the file is then absent and nothing is disabled, rather than
# the asking worktree's copy being read instead.
#
# Hardened, because the answer decides whether a refuter runs:
#   - git runs with every variable that can redirect discovery unset (GIT_DIR,
#     GIT_COMMON_DIR, GIT_WORK_TREE, GIT_CEILING_DIRECTORIES and the
#     GIT_CONFIG_* overrides that could set core.worktree), so the caller's
#     environment cannot point it at another repository.
#   - A worktree's .git file is writable by whoever works in it, so the main
#     checkout it leads to is believed only when that checkout's own
#     git worktree list names the starting worktree. That catches a .git file
#     edited to point at a repository that never registered the worktree. It
#     does not catch a forged one: a repository made for the purpose, which
#     registers the worktree itself (git worktree add, or a hand-made entry
#     with a back-pointer), passes, because the check asks that repository.
#     The defence there is where resolution starts: the spawn hook starts from
#     CLAUDE_PROJECT_DIR, which a cd cannot move, and only falls back to the
#     event's cwd when that variable is unset or not a directory.
#   - Anything that fails or is ambiguous - no git, no repository, a bare main,
#     a worktree its main does not list - prints nothing and returns 1. The
#     caller then reads no file: everything is enabled, the refuter included.
#     There is no fallback to the copy in the cwd.
_fleet_git() {
  env -u GIT_DIR -u GIT_COMMON_DIR -u GIT_WORK_TREE -u GIT_CEILING_DIRECTORIES \
    -u GIT_CONFIG_PARAMETERS -u GIT_CONFIG_COUNT -u GIT_CONFIG -u GIT_CONFIG_GLOBAL -u GIT_CONFIG_SYSTEM \
    -u GIT_DISCOVERY_ACROSS_FILESYSTEM -u GIT_NAMESPACE -u GIT_INDEX_FILE -u GIT_OBJECT_DIRECTORY \
    git "$@"
}

_fleet_real() { (cd "$1" 2>/dev/null && pwd -P); }

fleet_config_root() {
  local dir="${1:-${CLAUDE_PROJECT_DIR:-$PWD}}" start main list first_bare start_real
  [ -n "$dir" ] && [ -d "$dir" ] || return 1
  command -v git >/dev/null 2>&1 || return 1
  start="$(_fleet_git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" || return 1
  [ -n "$start" ] || return 1
  list="$(_fleet_git -C "$start" worktree list --porcelain 2>/dev/null)" || return 1
  main="$(printf '%s\n' "$list" | sed -n '1s/^worktree //p')"
  [ -n "$main" ] || return 1
  # A bare main has no checkout to hold the file.
  first_bare="$(printf '%s\n' "$list" | awk 'NR > 1 && /^$/ { exit } /^bare$/ { print "bare" }')"
  [ -z "$first_bare" ] || return 1
  start_real="$(_fleet_real "$start")"
  [ -n "$start_real" ] || return 1
  # The main checkout's own list must name the starting worktree. Asked of the
  # main checkout, not of the starting one, so a .git file that claims a
  # repository is checked against what that repository says.
  # A main checkout whose directory has gone cannot be asked; its path is
  # returned, the file there is absent, and nothing is disabled.
  if [ -d "$main" ]; then
    local mainlist line listed=1
    mainlist="$(_fleet_git -C "$main" worktree list --porcelain 2>/dev/null)" || return 1
    [ "$(_fleet_real "$(printf '%s\n' "$mainlist" | sed -n '1s/^worktree //p')")" = "$(_fleet_real "$main")" ] || return 1
    while IFS= read -r line; do
      case "$line" in
        "worktree "*) [ "$(_fleet_real "${line#worktree }")" = "$start_real" ] && { listed=0; break; } ;;
      esac
    done <<EOF
$mainlist
EOF
    [ "$listed" -eq 0 ] || return 1
  fi
  printf '%s' "$main"
}

fleet_config_read() {
  local root="$1" out state payload rc
  FLEET_CONFIG_PATH="$root/$FLEET_CONFIG_REL"
  FLEET_CONFIG_STATE=absent
  FLEET_CONFIG_REASON=""
  FLEET_CONFIG_DISABLED=""
  # No main checkout was found (fleet_config_root printed nothing): read no
  # file at all, not even one relative to the cwd.
  if [ -z "$root" ]; then
    FLEET_CONFIG_PATH=""
    FLEET_CONFIG_STATE=unresolved
    FLEET_CONFIG_REASON="no main checkout could be found through git, so no $FLEET_CONFIG_REL is read and every agent is enabled"
    return 0
  fi
  [ -e "$FLEET_CONFIG_PATH" ] || return 0
  if [ ! -r "$FLEET_CONFIG_PATH" ] || [ -d "$FLEET_CONFIG_PATH" ]; then
    FLEET_CONFIG_STATE=unreadable
    FLEET_CONFIG_REASON="$FLEET_CONFIG_REL exists but cannot be read"
    return 0
  fi
  # No python3, no reading: the file is invalid, so nothing in it is honoured
  # and the refuter stays on, and the reason says what is missing.
  if ! command -v python3 >/dev/null 2>&1; then
    FLEET_CONFIG_STATE=invalid
    FLEET_CONFIG_REASON="python3 is not installed, so $FLEET_CONFIG_REL cannot be parsed"
    return 0
  fi
  # Two lines out: the state, then the reason or the names. The parser is
  # python3's json module, in lib/fleet-config.py, which is as strict as the
  # JSON.parse review-round.js reads the same file with; the two must agree on
  # every input, reasons included (workflow-logic.mjs holds the fixtures).
  # Every name is checked against the agent-name shape there, and every
  # reason quotes a name as ASCII-only JSON, so nothing that reaches the shell
  # can carry a newline. -I: no PYTHON* variable, user site or script
  # directory can put another json module in its place.
  # fleet-config.py prints a state for every file and exits 0, so a non-zero
  # exit means python3 itself failed - the macOS developer-tools stub is on
  # PATH and exits 1 with no output - and the reason says so rather than
  # blaming the file.
  rc=0
  out="$(python3 -I "$FLEET_CONFIG_LIB_DIR/fleet-config.py" "$FLEET_CONFIG_PATH" "$FLEET_CORE_AGENTS" 2>/dev/null)" || { rc=$?; out=""; }
  state="$(printf '%s\n' "$out" | sed -n 1p)"
  payload="$(printf '%s\n' "$out" | sed -n 2p)"
  case "$state" in
    ok)
      FLEET_CONFIG_STATE=ok
      FLEET_CONFIG_DISABLED="$payload"
      ;;
    invalid)
      FLEET_CONFIG_STATE=invalid
      FLEET_CONFIG_REASON="$payload"
      ;;
    *)
      FLEET_CONFIG_STATE=invalid
      if [ "$rc" -ne 0 ]; then
        FLEET_CONFIG_REASON="python3 could not run (exit $rc), so $FLEET_CONFIG_REL cannot be parsed"
      else
        FLEET_CONFIG_REASON="the file is empty or not valid JSON"
      fi
      ;;
  esac
  return 0
}

fleet_agent_disabled() {
  local raw name
  [ "${FLEET_CONFIG_STATE:-}" = ok ] || return 1
  raw="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
  # Only the bare type or this plugin's prefix. "other-plugin:refuter" is not
  # the fleet's refuter.
  case "$raw" in
    *:*) case "$raw" in coder-fleet:*) ;; *) return 1 ;; esac ;;
  esac
  name="$(fleet_config_normalise "$raw")"
  [ -n "$name" ] || return 1
  case " $FLEET_CONFIG_DISABLED " in
    *" $name "*) return 0 ;;
  esac
  return 1
}
