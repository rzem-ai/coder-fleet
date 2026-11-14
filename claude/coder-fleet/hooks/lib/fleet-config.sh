# fleet-config.sh - read and validate a project's .claude/coder-fleet.json.
#
# Sourced, never run. A project disables fleet agents by listing them
# under `disabledAgents` in .claude/coder-fleet.json. This file is the one
# reading of that list, shared by enforce-disabled-agents.sh and
# scripts/fleet-agents.sh, and review-round.js reads it the same way, so the
# rules below are stated once:
#
#   - The file that counts is the one in the repository's main checkout, read
#     live, uncommitted edits included (fleet_config_root). A linked worktree's
#     copy never counts, so a branch under review cannot disable its own
#     checks, and a toggle needs no commit.
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
#     " coder-fleet:Researcher" and "researcher" are one entry. After that it must
#     look like an agent name: a lower-case letter or digit, then letters,
#     digits, hyphens or underscores.
#   - lead, coder and reviewer are the core of the fleet and cannot be disabled.
#   - A file that breaks any rule is invalid, and an invalid file honours
#     nothing: every agent stays enabled, and the caller reports the reason. A
#     core entry therefore never takes effect, and neither does anything listed
#     beside it, because a half-read config is a guess about what was meant.
#   - `phase` is "build" or "harden", exactly, and says how hard
#     review-round works an item. It is judged apart from disabledAgents: no
#     file, or no key, is build by default; any other value is build,
#     reported with a reason, and voids nothing in the list, as a bad list
#     voids no valid phase. A read that failed - no main checkout, an
#     unreadable file, a parser that could not run, or a file that
#     does not parse to a JSON object - is harden (phase state unread),
#     because it says nothing about what the human chose and must not remove
#     an unparseable file is still invalid, so its
#     disabledAgents is void as well.
#   - `baseBranch`, `push` and `release` are judged the same way, each apart
#     from every other key, and are unset when the key is absent:
#       baseBranch  a local branch's name, the trunk. Invalid when it is not a
#                   string, not a branch name (git check-ref-format), starts
#                   with '-', or names no branch in the main checkout.
#       push        "all", also what unset means, or "base-only".
#       release     "off", "tag" or "github". Unset is its own value, so a
#                   caller can tell it from "off".
#     push and release each guard a remote, so an invalid value or a failed
#     read resolves as the strict one: push base-only, release off. A failed
#     read leaves baseBranch unknown (state unread).
#
# Nothing is cached. Every call to fleet_config_read reads the file, so an edit
# takes effect on the next call with no restart.
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
#                                FLEET_CONFIG_REASON (why invalid or unreadable),
#                                FLEET_CONFIG_DISABLED (space-separated
#                                normalised names, empty unless ok), and
#                                FLEET_CONFIG_PHASE (build | harden),
#                                FLEET_CONFIG_PHASE_STATE (default | ok |
#                                invalid | unread) and FLEET_CONFIG_PHASE_REASON
#                                (why invalid or unread), and for each of
#                                BASE, PUSH and RELEASE the triple
#                                FLEET_CONFIG_<KEY>, FLEET_CONFIG_<KEY>_STATE
#                                (unset | ok | invalid | unread) and
#                                FLEET_CONFIG_<KEY>_REASON. Returns 0.
#   fleet_trunk <root>           the trunk: reads the file, then sets
#                                FLEET_TRUNK and FLEET_TRUNK_FROM (setting |
#                                remote | fallback). baseBranch when set; else
#                                the branch the remote's HEAD names, the remote
#                                being origin or the only one; else main.
#                                Returns 1 with FLEET_TRUNK empty and the
#                                reason in FLEET_TRUNK_REASON when baseBranch
#                                is invalid or the file could not be read,
#                                rather than guess at a trunk the human did not
#                                name. scripts/fleet-trunk.sh prints it.
#   fleet_config_normalise <name>
#   fleet_roster <plugin root>   prints the fleet's agents, space-separated and
#                                sorted: one per body under <plugin root>/agents.
#                                Prints nothing when there is no body. The one roster
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
$base"
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
# Hardened, because the answer decides which agents run and the phase:
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
#     caller then reads no file: everything is enabled and the phase is harden.
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

# A read that failed is no evidence of what the human chose, so it never
# removes a break lane or a fix round: the phase is harden, and the reason, the
# read's own with this added, says so. review-round.js gives the same reason.
_fleet_phase_unread() {
  FLEET_CONFIG_PHASE=harden
  FLEET_CONFIG_PHASE_STATE=unread
  FLEET_CONFIG_PHASE_REASON="$FLEET_CONFIG_REASON, so the phase is taken as harden"
  _fleet_settings_unread "$FLEET_CONFIG_REASON"
}

# Nothing is known of baseBranch, push and release: push and release take
# their strict values. fleet-config.py gives the same for an unparsed file.
_fleet_settings_unread() {
  FLEET_CONFIG_BASE=""
  FLEET_CONFIG_BASE_STATE=unread
  FLEET_CONFIG_BASE_REASON="$1, so baseBranch is unknown"
  FLEET_CONFIG_PUSH=base-only
  FLEET_CONFIG_PUSH_STATE=unread
  FLEET_CONFIG_PUSH_REASON="$1, so push is taken as base-only"
  FLEET_CONFIG_RELEASE=off
  FLEET_CONFIG_RELEASE_STATE=unread
  FLEET_CONFIG_RELEASE_REASON="$1, so release is taken as off"
}

fleet_config_read() {
  local root="$1" out state payload rc phase phase_state
  FLEET_CONFIG_PATH="$root/$FLEET_CONFIG_REL"
  FLEET_CONFIG_STATE=absent
  FLEET_CONFIG_REASON=""
  FLEET_CONFIG_DISABLED=""
  FLEET_CONFIG_PHASE=build
  FLEET_CONFIG_PHASE_STATE=default
  FLEET_CONFIG_PHASE_REASON=""
  FLEET_CONFIG_BASE=""
  FLEET_CONFIG_BASE_STATE=unset
  FLEET_CONFIG_BASE_REASON=""
  FLEET_CONFIG_PUSH=all
  FLEET_CONFIG_PUSH_STATE=unset
  FLEET_CONFIG_PUSH_REASON=""
  FLEET_CONFIG_RELEASE=unset
  FLEET_CONFIG_RELEASE_STATE=unset
  FLEET_CONFIG_RELEASE_REASON=""
  # No main checkout was found (fleet_config_root printed nothing): read no
  # file at all, not even one relative to the cwd.
  if [ -z "$root" ]; then
    FLEET_CONFIG_PATH=""
    FLEET_CONFIG_STATE=unresolved
    FLEET_CONFIG_REASON="no main checkout could be found through git, so no $FLEET_CONFIG_REL is read and every agent is enabled"
    _fleet_phase_unread
    return 0
  fi
  [ -e "$FLEET_CONFIG_PATH" ] || return 0
  if [ ! -r "$FLEET_CONFIG_PATH" ] || [ -d "$FLEET_CONFIG_PATH" ]; then
    FLEET_CONFIG_STATE=unreadable
    FLEET_CONFIG_REASON="$FLEET_CONFIG_REL exists but cannot be read"
    _fleet_phase_unread
    return 0
  fi
  # No python3, no reading: the file is invalid, so nothing in it is honoured
  # and every agent stays on, and the reason says what is missing.
  if ! command -v python3 >/dev/null 2>&1; then
    FLEET_CONFIG_STATE=invalid
    FLEET_CONFIG_REASON="python3 is not installed, so $FLEET_CONFIG_REL cannot be parsed"
    _fleet_phase_unread
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
  # Lines 3 to 5 are the phase, its state and its reason. Anything but the
  # values fleet-config.py prints leaves the default in place. harden|unread
  # is a file that does not parse to a JSON object.
  phase="$(printf '%s\n' "$out" | sed -n 3p)"
  phase_state="$(printf '%s\n' "$out" | sed -n 4p)"
  case "$phase|$phase_state" in
    build\|ok|harden\|ok|build\|invalid|harden\|unread)
      FLEET_CONFIG_PHASE="$phase"
      FLEET_CONFIG_PHASE_STATE="$phase_state"
      case "$phase_state" in
        invalid|unread) FLEET_CONFIG_PHASE_REASON="$(printf '%s\n' "$out" | sed -n 5p)" ;;
      esac
      ;;
  esac
  _fleet_settings_from "$out" "$root"
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
      # fleet-config.py prints a state for every file, so this is the parser
      # failing, not the file: nothing was read, and the phase is harden.
      _fleet_phase_unread
      ;;
  esac
  return 0
}

# Lines 6 to 14 of fleet-config.py's output: baseBranch, push and release, a
# value, a state and a reason each. Output that is not what fleet-config.py
# prints is a failed read. A baseBranch whose shape passed is then asked of
# git: a branch name, and a branch in the main checkout <root>.
_fleet_settings_from() {
  local out="$1" root="$2" base base_state push push_state release release_state
  base="$(printf '%s\n' "$out" | sed -n 6p)"
  base_state="$(printf '%s\n' "$out" | sed -n 7p)"
  push="$(printf '%s\n' "$out" | sed -n 9p)"
  push_state="$(printf '%s\n' "$out" | sed -n 10p)"
  release="$(printf '%s\n' "$out" | sed -n 12p)"
  release_state="$(printf '%s\n' "$out" | sed -n 13p)"
  case "$base_state|$push|$push_state|$release|$release_state" in
    unset\|*|ok\|*|invalid\|*|unread\|*) ;;
    *) _fleet_settings_unread "$FLEET_CONFIG_REL could not be read"; return 0 ;;
  esac
  case "$push|$push_state" in
    all\|unset|all\|ok|base-only\|ok|base-only\|invalid|base-only\|unread) ;;
    *) _fleet_settings_unread "$FLEET_CONFIG_REL could not be read"; return 0 ;;
  esac
  case "$release|$release_state" in
    unset\|unset|off\|ok|tag\|ok|github\|ok|off\|invalid|off\|unread) ;;
    *) _fleet_settings_unread "$FLEET_CONFIG_REL could not be read"; return 0 ;;
  esac
  FLEET_CONFIG_BASE="$base"
  FLEET_CONFIG_BASE_STATE="$base_state"
  FLEET_CONFIG_BASE_REASON="$(printf '%s\n' "$out" | sed -n 8p)"
  FLEET_CONFIG_PUSH="$push"
  FLEET_CONFIG_PUSH_STATE="$push_state"
  FLEET_CONFIG_PUSH_REASON="$(printf '%s\n' "$out" | sed -n 11p)"
  FLEET_CONFIG_RELEASE="$release"
  FLEET_CONFIG_RELEASE_STATE="$release_state"
  FLEET_CONFIG_RELEASE_REASON="$(printf '%s\n' "$out" | sed -n 14p)"
  [ "$base_state" = ok ] || return 0
  local quoted="\"$base\""
  case "$base" in
    -*) ;;
    *)
      if _fleet_git check-ref-format "refs/heads/$base" >/dev/null 2>&1; then
        _fleet_git -C "$root" show-ref --verify -q "refs/heads/$base" 2>/dev/null && return 0
        FLEET_CONFIG_BASE=""
        FLEET_CONFIG_BASE_STATE=invalid
        FLEET_CONFIG_BASE_REASON="baseBranch is $quoted, which names no local branch in $root"
        return 0
      fi
      ;;
  esac
  FLEET_CONFIG_BASE=""
  FLEET_CONFIG_BASE_STATE=invalid
  FLEET_CONFIG_BASE_REASON="baseBranch is $quoted, which is not a branch name"
}

fleet_trunk() {
  local root="$1" remotes remote="" head
  FLEET_TRUNK=""
  FLEET_TRUNK_FROM=""
  FLEET_TRUNK_REASON=""
  fleet_config_read "$root"
  case "$FLEET_CONFIG_BASE_STATE" in
    ok)
      FLEET_TRUNK="$FLEET_CONFIG_BASE"
      FLEET_TRUNK_FROM=setting
      return 0
      ;;
    unset) ;;
    *)
      FLEET_TRUNK_REASON="$FLEET_CONFIG_BASE_REASON"
      return 1
      ;;
  esac
  # The remote is origin, or the only remote when there is one under another
  # name, as hooks/main-fast-forward.sh picks it.
  remotes="$(_fleet_git -C "$root" remote 2>/dev/null)" || remotes=""
  if printf '%s\n' "$remotes" | grep -qx origin; then
    remote=origin
  elif [ -n "$remotes" ] && [ "$(printf '%s\n' "$remotes" | wc -l | tr -d ' ')" = 1 ]; then
    remote="$remotes"
  fi
  if [ -n "$remote" ]; then
    head="$(_fleet_git -C "$root" symbolic-ref -q "refs/remotes/$remote/HEAD" 2>/dev/null)" || head=""
    head="${head#refs/remotes/$remote/}"
    if [ -n "$head" ]; then
      FLEET_TRUNK="$head"
      FLEET_TRUNK_FROM=remote
      return 0
    fi
  fi
  FLEET_TRUNK=main
  FLEET_TRUNK_FROM=fallback
  return 0
}

fleet_agent_disabled() {
  local raw name
  [ "${FLEET_CONFIG_STATE:-}" = ok ] || return 1
  raw="$(printf '%s' "$1" | tr 'A-Z' 'a-z')"
  # Only the bare type or this plugin's prefix. "other-plugin:researcher" is not
  # the fleet's researcher.
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
