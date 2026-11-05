# shellcheck shell=bash
# Shared helpers for the board hooks. Sourced, never executed.
#
# Everything here is written for bash 3.2, because that is what /bin/bash is on
# macOS: no associative arrays, no ${var,,}, no mapfile, no globstar.
#
# The board is this repository's GitHub issues, grouped into columns by status
# labels and reached through the `gh` CLI. A status move is one `gh issue edit`
# of labels, a comment is one `gh issue comment`, and a failure is an exit code
# with its own stderr. Everything below is the envelope around those calls - the
# soft failure contract, the state files that bind a session to an issue, and
# the archive a cut comment points at.

# Nothing here is secret, but a traced hook floods the transcript with
# a hundred lines nobody asked for. Keep it off.
set +x

CODER_FLEET_STATE_DIR="${CODER_FLEET_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/coder-fleet}"

# The columns. Fixed, not configurable: each but To Do and Done is one label
# (board_column_label), To Do is an open issue with none of them, and Done is a
# closed issue. Assigned outright rather than defaulted, so a value exported in
# the environment cannot rename a column.
BOARD_COL_TODO="To Do"
BOARD_COL_NEXT="Next"
BOARD_COL_IN_PROGRESS="In Progress"
BOARD_COL_BLOCKED="Blocked"
BOARD_COL_BLOCKED_HUMAN="Blocked by human"
BOARD_COL_DONE="Done"

# How much of a comment reaches the issue. The cap is for the reader: an issue
# comment is a summary, and the whole text of a long run belongs in the archive
# a cut comment points at.
BOARD_COMMENT_MAX_CHARS="${BOARD_COMMENT_MAX_CHARS:-8000}"

# Which run a comment belongs to. A hook sets these before it calls board_write
# or board_comment, and the only thing that reads them is the archive a cut
# comment points at, so a hook that sets none of them still works and just gets
# an archive labelled "not recorded". Nothing here is secret and nothing here is
# ever a secret.
BOARD_RUN_SESSION="${BOARD_RUN_SESSION:-}"
BOARD_RUN_AGENT="${BOARD_RUN_AGENT:-}"
BOARD_RUN_AGENT_ID="${BOARD_RUN_AGENT_ID:-}"
BOARD_RUN_STATUS="${BOARD_RUN_STATUS:-}"

BOARD_LOG_FILE="${BOARD_LOG_FILE:-$CODER_FLEET_STATE_DIR/log/hooks.log}"

board_log() {
  # $1 hook name, rest message. stderr for the transcript, file for later.
  local hook="$1"; shift
  local line
  line="$(date -u '+%Y-%m-%dT%H:%M:%SZ') [$hook] $*"
  printf '%s\n' "$line" >&2
  if mkdir -p "$(dirname "$BOARD_LOG_FILE")" 2>/dev/null; then
    printf '%s\n' "$line" >> "$BOARD_LOG_FILE" 2>/dev/null || true
  fi
}

# A board write must never break the session. Callers use this for anything
# that is only about the board.
board_soft_fail() {
  board_log "$1" "board write skipped: $2"
  return 1
}

board_disabled() {
  if [ "${CODER_FLEET_BOARD:-on}" = "off" ]; then return 0; fi
  if [ -f "$CODER_FLEET_STATE_DIR/disabled" ]; then return 0; fi
  return 1
}

require_tools() {
  local hook="$1" missing=""
  command -v jq >/dev/null 2>&1 || missing="$missing jq"
  if [ -n "$missing" ]; then
    board_log "$hook" "missing required tool(s):$missing. Install them (macOS: brew install jq) or the board hooks cannot run. Session continues."
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------- state files
#
# The state directory is how a later hook finds the board item a subagent was
# spawned against. See README, "Which board item".

state_session_dir() {
  # $1 session_id
  local sid="${1:-unknown-session}"
  sid="$(printf '%s' "$sid" | tr -c 'A-Za-z0-9._-' '_')"
  printf '%s/sessions/%s' "$CODER_FLEET_STATE_DIR" "$sid"
}

state_bind_agent() {
  # $1 session_id, $2 agent_id, $3 page_id (may be empty: an unbound agent),
  # $4 agent_type, $5 optional: the stale focus an unbound start refused,
  # recorded so the stop can say why it reached no card. Returns 0
  # when it wrote the record, 3 when the agent already had one, 1 on failure.
  #
  # The record is written once, at the agent's first start, and never again. A
  # resume with SendMessage re-fires SubagentStart for the same agent id, and
  # the item the agent started on is the one its stop has to reach, whatever
  # the focus says by then. set -C in a subshell is O_EXCL, as agent-clock.sh
  # does it, so two racing starts cannot both write.
  local dir; dir="$(state_session_dir "$1")"
  local aid; aid="$(printf '%s' "${2:-unknown-agent}" | tr -c 'A-Za-z0-9._-' '_')"
  local file="$dir/agents/$aid"
  local old_umask; old_umask="$(umask)"
  umask 077
  mkdir -p "$dir/agents" 2>/dev/null || { umask "$old_umask"; return 1; }
  if [ -e "$file" ]; then umask "$old_umask"; return 3; fi
  if ! ( set -C
         {
           printf 'page_id=%s\n' "$3"
           printf 'agent_type=%s\n' "$4"
           if [ -n "${5:-}" ]; then printf 'stale_focus=%s\n' "$5"; fi
           printf 'bound_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
         } > "$file" ) 2>/dev/null; then
    umask "$old_umask"
    [ -e "$file" ] && return 3
    return 1
  fi
  # No session-level pointer is written: SubagentStart binds an unfocused
  # start to nothing, so nothing would read one.
  umask "$old_umask"
  return 0
}

# state_agent_bound SID AID: true when this agent has a record in this session,
# even an unbound one. A start that finds one is a resume.
state_agent_bound() {
  local dir; dir="$(state_session_dir "$1")"
  local aid; aid="$(printf '%s' "${2:-unknown-agent}" | tr -c 'A-Za-z0-9._-' '_')"
  [ -f "$dir/agents/$aid" ]
}

state_agent_page_id() {
  # $1 session_id, $2 agent_id
  local dir; dir="$(state_session_dir "$1")"
  local aid; aid="$(printf '%s' "${2:-unknown-agent}" | tr -c 'A-Za-z0-9._-' '_')"
  [ -f "$dir/agents/$aid" ] || return 1
  local v
  v="$(sed -n 's/^page_id=//p' "$dir/agents/$aid" | head -1)"
  [ -n "$v" ] || return 1
  printf '%s\n' "$v"
}

# state_agent_stale_focus SID AID -> the Done item an unbound start found in
# the focus and refused, or returns 1 when the record names none.
state_agent_stale_focus() {
  local dir; dir="$(state_session_dir "$1")"
  local aid; aid="$(printf '%s' "${2:-unknown-agent}" | tr -c 'A-Za-z0-9._-' '_')"
  [ -f "$dir/agents/$aid" ] || return 1
  local v
  v="$(sed -n 's/^stale_focus=//p' "$dir/agents/$aid" | head -1)"
  [ -n "$v" ] || return 1
  printf '%s\n' "$v"
}

# state_mark_stopped SID AID: record that SubagentStop fired for this agent, as
# agents/<agent_id>.stopped beside its record. The Agent tool's
# PostToolUse reads it: a completed run with no marker ended without the event,
# as a maxTurns cut-off does. Written whether or not the agent is bound, and
# before anything else the stop hook does, so a stop that happened is always
# recorded. No agent id, nothing to key it by, so nothing is written. Returns 0
# when the marker exists afterwards, 1 otherwise; callers ignore the result.
state_mark_stopped() {
  [ -n "${2:-}" ] || return 1
  local dir; dir="$(state_session_dir "$1")"
  local aid; aid="$(printf '%s' "$2" | tr -c 'A-Za-z0-9._-' '_')"
  ( umask 077; mkdir -p "$dir/agents" && date -u '+%Y-%m-%dT%H:%M:%SZ' > "$dir/agents/$aid.stopped" ) 2>/dev/null || return 1
}

# state_agent_stopped SID AID: true when SubagentStop has left its marker.
state_agent_stopped() {
  [ -n "${2:-}" ] || return 1
  local dir; dir="$(state_session_dir "$1")"
  local aid; aid="$(printf '%s' "$2" | tr -c 'A-Za-z0-9._-' '_')"
  [ -f "$dir/agents/$aid.stopped" ]
}

# ------------------------------------------------------------- workflow runs
#
# A workflow run's item. SubagentStart carries no run id, so a lane
# binds from the focus as it is when that lane starts, and a refocus mid-run
# rebinds the run's later lanes. The run id reaches SubagentStop only, in
# agent_transcript_path, so the stop decides the run's item: the start binding
# of the run's earliest-started agent, recorded once under runs/<run_id> and
# read by every later stop of the same run.

# run_id_from_transcript PATH -> the wf_<run> segment of a workflow lane's
# transcript path (.../subagents/workflows/wf_<run>/agent-<id>.jsonl), or
# returns 1 for a direct spawn, whose path has no such segment.
run_id_from_transcript() {
  local re='/workflows/(wf_[^/]+)/[^/]+$'
  [[ ${1:-} =~ $re ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

# state_run_page_id SID RUN -> the run's recorded item, which is empty for a
# run whose earliest agent bound nothing. Returns 1 when no record exists, so
# "recorded as no item" and "not recorded yet" stay two answers.
state_run_page_id() {
  local dir; dir="$(state_session_dir "$1")"
  local rid; rid="$(printf '%s' "${2:-}" | tr -c 'A-Za-z0-9._-' '_')"
  [ -n "$rid" ] && [ -f "$dir/runs/$rid" ] || return 1
  sed -n 's/^page_id=//p' "$dir/runs/$rid" | head -1
  return 0
}

# state_record_run SID RUN PAGE_ID AGENT_ID -> 0 when this call wrote the
# record, 3 when one already stood, 1 on failure. The record is complete
# before it has its name: written to a private file, then hard-linked into
# place, and link(2) fails when the name exists. So two stops racing to record
# one run cannot both write, and neither can read a half-written record.
state_record_run() {
  local dir; dir="$(state_session_dir "$1")"
  local rid; rid="$(printf '%s' "${2:-}" | tr -c 'A-Za-z0-9._-' '_')"
  [ -n "$rid" ] || return 1
  local file="$dir/runs/$rid" tmp="$dir/runs/.$rid.$$"
  local old_umask; old_umask="$(umask)"
  umask 077
  mkdir -p "$dir/runs" 2>/dev/null || { umask "$old_umask"; return 1; }
  # No check for an existing record first: ln is the check, and the only one,
  # so a second record for one run is refused by the same call that would race.
  if ! {
         printf 'page_id=%s\n' "$3"
         printf 'agent_id=%s\n' "$4"
         printf 'recorded_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
       } > "$tmp" 2>/dev/null; then
    rm -f "$tmp"; umask "$old_umask"; return 1
  fi
  umask "$old_umask"
  if ln "$tmp" "$file" 2>/dev/null; then rm -f "$tmp"; return 0; fi
  rm -f "$tmp"
  [ -e "$file" ] && return 3
  return 1
}

# state_earliest_started SID AID... -> the id, of those given, whose start
# record was written first, or returns 1 when none of them has one. The order
# is the record's modification time: SubagentStart writes it once, at the
# agent's first start, and nothing rewrites it. bound_at inside it counts in
# whole seconds, too coarse for lanes a workflow launches together. Ids that
# tie on the timestamp come out in reverse name order, because -r reverses the
# tie-break along with the time sort; that order is the same for every stop
# that asks, so two racing stops still agree.
state_earliest_started() {
  local dir; dir="$(state_session_dir "$1")"; shift
  local aid files="" first
  for aid in "$@"; do
    aid="$(printf '%s' "$aid" | tr -c 'A-Za-z0-9._-' '_')"
    [ -n "$aid" ] && [ -f "$dir/agents/$aid" ] || continue
    case " $files " in *" $aid "*) continue ;; esac
    files="$files $aid"
  done
  [ -n "$files" ] || return 1
  # Ids are sanitised to [A-Za-z0-9._-] above, so the word split and the
  # parse of ls are safe; ls is the portable way to sort by a sub-second mtime.
  # shellcheck disable=SC2086,SC2012
  first="$(cd "$dir/agents" 2>/dev/null && ls -1tr -- $files 2>/dev/null | sed -n 1p)" || return 1
  [ -n "$first" ] || return 1
  printf '%s\n' "$first"
}

# run_lane_ids TRANSCRIPT -> the agent id of every lane with a transcript in
# the same run directory, one per line: agent-<id>.jsonl names the lane.
run_lane_ids() {
  local run_dir f id
  run_dir="$(dirname "${1:-}")"
  [ -d "$run_dir" ] || return 0
  for f in "$run_dir"/agent-*.jsonl; do
    [ -e "$f" ] || continue
    id="${f##*/agent-}"; id="${id%.jsonl}"
    [ -n "$id" ] && printf '%s\n' "$id"
  done
  return 0
}

# ---------------------------------------------------------------- run archives
#
# Where the overflow of a cut comment goes. A comment too long for a card is cut,
# and the note on the end of it names a file written here, so the one message
# telling the human there is more to read points at something real, on exactly
# the runs with the most to say.
#
# The archive goes in the state directory and never in the hook's cwd. The coder
# runs with isolation: worktree, so its cwd is a git worktree under
# .claude/worktrees/ that goes away with the session - an archive written there
# would vanish with the thing it exists to outlive.
#
# Layout, one file per cut comment:
#
#   archives/<session_id>/<UTC timestamp>-<agent, or the hook if there is none>.md
#
# Session first, because a session id is what a person has in hand when they come
# back to a run; agent and timestamp in the name, because that is what tells two
# cut comments in one session apart without opening either. Nothing prunes them.

board_archive_dir() {
  local sid
  sid="$(printf '%s' "${BOARD_RUN_SESSION:-}" | tr -c 'A-Za-z0-9._-' '_')"
  [ -n "$sid" ] || sid="unknown-session"
  printf '%s/archives/%s' "$CODER_FLEET_STATE_DIR" "$sid"
}

# board_archive_comment HOOK ITEM_REF TEXT
# Writes the full comment text with a header saying which run it came from, and
# echoes the path it wrote. Returns 1, having logged why, if anything failed:
# an archive that could not be written is not a reason to lose the card comment
# as well, so the caller carries on and posts the cut text.
board_archive_comment() {
  local hook="$1" page="$2" text="$3"
  local dir file stamp name n old_umask

  dir="$(board_archive_dir)"
  stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  name="$(printf '%s' "${BOARD_RUN_AGENT:-}" | tr -c 'A-Za-z0-9._-' '_')"
  [ -n "$name" ] || name="$hook"
  file="$dir/$stamp-$name.md"
  n=2
  while [ -e "$file" ] && [ "$n" -lt 100 ]; do
    file="$dir/$stamp-$name-$n.md"
    n=$((n + 1))
  done

  # Same discipline as the session state files: 0700 on the directory, 0600 on
  # the file. Nothing in here is secret, and nothing in here is anyone else's
  # business either.
  old_umask="$(umask)"
  umask 077
  if ! mkdir -p "$dir" 2>/dev/null; then
    umask "$old_umask"
    board_log "$hook" "could not create the archive directory $dir; the full text of this comment is saved nowhere"
    return 1
  fi
  {
    printf '# Issue comment archive\n\n'
    printf -- '- Written: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf -- '- Hook: %s\n' "$hook"
    printf -- '- Agent: %s%s\n' "${BOARD_RUN_AGENT:-not recorded}" "${BOARD_RUN_AGENT_ID:+ ($BOARD_RUN_AGENT_ID)}"
    printf -- '- Status: %s\n' "${BOARD_RUN_STATUS:-not recorded}"
    printf -- '- Session: %s\n' "${BOARD_RUN_SESSION:-not recorded}"
    printf -- '- Issue: %s\n' "${page:-not resolved}"
    printf '\n'
    printf 'The comment on the issue was cut to fit. This is the whole of it.\n\n'
    printf '## Full comment text\n\n'
    printf '%s\n' "$text"
  } > "$file" 2>/dev/null || {
    umask "$old_umask"
    board_log "$hook" "could not write the archive $file; the full text of this comment is saved nowhere"
    return 1
  }
  umask "$old_umask"
  printf '%s\n' "$file"
  return 0
}

# ------------------------------------------------------------- item ref parsing

# A ref is a GitHub issue in this repository: `#12`, `12`, or the issue's URL
# (`https://github.com/<owner>/<repo>/issues/12`). It normalises to `#12`.
# Nothing else is a ref: no other repository's issue, no pull request URL.
normalise_page_id() {
  local raw n
  raw="$(printf '%s' "$1" | tr -d '\r' | sed -e 's/[?].*$//' -e 's/[[:space:]]*$//' -e 's/^[[:space:]]*//')"
  [ -n "$raw" ] || return 1
  case "$raw" in
    http://*/issues/*|https://*/issues/*)
      n="$(printf '%s' "$raw" | sed -E 's#^.*/issues/([0-9]+)(/.*|\#.*)?$#\1#')"
      ;;
    *)
      n="$(printf '%s' "$raw" | grep -Eo '^#?[0-9]+$' | tr -d '#' || true)"
      ;;
  esac
  case "$n" in ''|*[!0-9]*) return 1 ;; esac
  # A leading zero is not an issue number GitHub hands out; 012 is refused
  # rather than guessed at.
  case "$n" in 0*) return 1 ;; esac
  printf '#%s\n' "$n"
}

# The bare number of a normalised ref, for the gh calls.
issue_number() {
  printf '%s' "${1#\#}"
}

# The spawn-prompt convention. One line anywhere in the instructions:
#   Issue: #12
# or the issue's URL. Leading "- " and any case are tolerated; nothing else is.
page_id_from_instructions() {
  local text="$1" line
  line="$(printf '%s' "$text" | tr -d '\r' \
    | grep -Ei -m1 '^[[:space:]]*(-[[:space:]]+)?issue:[[:space:]]*[^[:space:]]+' || true)"
  [ -n "$line" ] || return 1
  line="$(printf '%s' "$line" | sed -E 's/^[[:space:]]*(-[[:space:]]+)?[Ii][Ss][Ss][Uu][Ee]:[[:space:]]*//' \
    | awk '{print $1}')"
  normalise_page_id "$line"
}

# The task-title convention, for TaskCompleted: a marker anywhere in the title.
#   Wire up refresh rotation [issue:#12]
page_id_from_task_title() {
  local text="$1" id
  id="$(printf '%s' "$text" | grep -Eio '\[issue:[^]]+\]' | head -1 || true)"
  [ -n "$id" ] || return 1
  id="$(printf '%s' "$id" | sed -E 's/^\[[Ii][Ss][Ss][Uu][Ee]:[[:space:]]*//; s/[[:space:]]*\]$//')"
  normalise_page_id "$id"
}

# ------------------------------------------------------------------ gh
#
# The board is this repository's GitHub issues, reached through the `gh` CLI
# and its own authentication. gh finds the repository from the git remote of
# its working directory, so the one thing this library owes it is the right
# working directory - BOARD_CWD, the cwd each hook reads from its input. GH_REPO
# in the environment overrides the remote, as gh documents. Outside a
# repository, or with gh missing or signed out, the call fails, the hook logs
# why, and nothing moves.

BOARD_GH="${BOARD_GH:-gh}"
BOARD_CLI_TIMEOUT="${BOARD_CLI_TIMEOUT:-20}"
BOARD_CWD="${BOARD_CWD:-}"

board_cli() {
  # $1 hook name, rest arguments to gh. stdout is gh's; a failure is logged
  # with the start of gh's stderr, and BOARD_CLI_ERR holds the whole of it for
  # a caller that needs to tell one failure from another.
  local hook="$1"; shift
  local err rc
  local what="$1 ${2:-}"
  BOARD_CLI_ERR=""
  if ! command -v "$BOARD_GH" >/dev/null 2>&1; then
    board_log "$hook" "gh is not installed, so the board (this repository's GitHub issues) cannot be reached. Install the GitHub CLI and run gh auth login."
    return 127
  fi
  err="$(mktemp "${TMPDIR:-/tmp}/board-err.XXXXXX")" || return 1
  # timeout(1) is GNU. Homebrew's coreutils installs it as gtimeout, and a
  # machine with neither still runs the command - unbounded, but running.
  # `|| rc=$?` keeps the call in a condition context, where errexit stands down.
  rc=0
  (
    if [ -n "$BOARD_CWD" ]; then cd "$BOARD_CWD" 2>/dev/null || exit 96; fi
    # gh prompts and pages on a terminal; a hook has neither.
    export GH_PROMPT_DISABLED=1 GH_PAGER=cat NO_COLOR=1
    if command -v timeout >/dev/null 2>&1; then
      exec timeout "$BOARD_CLI_TIMEOUT" "$BOARD_GH" "$@"
    elif command -v gtimeout >/dev/null 2>&1; then
      exec gtimeout "$BOARD_CLI_TIMEOUT" "$BOARD_GH" "$@"
    else
      exec "$BOARD_GH" "$@"
    fi
  ) 2>"$err" || rc=$?
  BOARD_CLI_ERR="$(head -c 2000 "$err")"
  if [ "$rc" -eq 96 ]; then
    board_log "$hook" "gh $what: cwd $BOARD_CWD does not exist"
  elif [ "$rc" -ne 0 ] && [ "${BOARD_CLI_QUIET:-}" != "1" ]; then
    board_log "$hook" "gh $what failed (exit $rc): $(head -c 300 "$err" | tr '\n' ' ')"
  fi
  rm -f "$err"
  return "$rc"
}

# board_issue_json HOOK REF FIELDS -> gh's JSON for the issue, or returns 1.
board_issue_json() {
  local hook="$1" ref="$2" fields="$3"
  board_cli "$hook" issue view "$(issue_number "$ref")" --json "$fields"
}

# board_resolve HOOK REF -> prints the canonical `#N`, or nothing
#
# Three outcomes, not two. The call failing is board_cli's to log; a call that
# succeeded and still yielded no number is a response this library could not
# read, and saying so is the difference between "that issue does not exist" and
# "gh answered in a shape we do not understand".
board_resolve() {
  local hook="$1" id="$2" ref out n rc=0
  ref="$(normalise_page_id "$id")" || { board_log "$hook" "$id is not an issue ref"; return 1; }
  out="$(board_issue_json "$hook" "$ref" number)" || rc=$?
  [ "$rc" -eq 0 ] || return "$rc"
  n="$(printf '%s' "$out" | jq -r '.number // empty' 2>/dev/null)"
  if [ -z "$n" ]; then
    board_log "$hook" "issue $ref: unparseable response"
    return 1
  fi
  printf '#%s\n' "$n"
}

# --------------------------------------------------------------- the focus
#
# The focus is one line in <git common dir>/coder-fleet/focus: the main
# checkout's .git, shared by every linked worktree of it and never committed.
# scripts/focus.sh writes it, for the lead and for /work; these read and clear it.

# board_focus_file -> the focus file's path for BOARD_CWD, or returns 1 outside
# a repository.
board_focus_file() {
  local dir common
  dir="${BOARD_CWD:-$PWD}"
  common="$(cd "$dir" 2>/dev/null && git rev-parse --git-common-dir 2>/dev/null)" || return 1
  [ -n "$common" ] || return 1
  case "$common" in
    /*) ;;
    *) common="$(cd "$dir" && cd "$common" 2>/dev/null && pwd -P)" || return 1 ;;
  esac
  printf '%s/coder-fleet/focus\n' "$common"
}

# board_focus_id HOOK -> prints the focused issue ref, or nothing
# Returns 0 with a ref, 1 when the read succeeded and nothing is focused, and
# 2 when the focus was not read: the board is off, or there is no repository
# here. Only 1 is evidence that nothing is focused. A line that is not an
# issue ref is logged and read as nothing focused.
board_focus_id() {
  local hook="$1" file line ref
  board_disabled && return 2
  file="$(board_focus_file)" || { board_log "$hook" "no git repository at ${BOARD_CWD:-$PWD}, so there is no focus to read"; return 2; }
  [ -f "$file" ] || return 1
  line="$(head -n 1 "$file" 2>/dev/null | tr -d '\r')" || return 2
  [ -n "$line" ] || return 1
  if ! ref="$(normalise_page_id "$line")"; then
    board_log "$hook" "the focus file $file holds \"$(printf '%s' "$line" | cut -c1-80)\", which is not an issue ref; reading it as nothing focused"
    return 1
  fi
  printf '%s\n' "$ref"
}

# board_focus_clear HOOK -> forgets the checkout's focus. A write, so gated on
# board_would_send: a dry run or a disabled board removes nothing and returns 1.
board_focus_clear() {
  local hook="$1" file
  board_would_send || return 1
  file="$(board_focus_file)" || return 1
  rm -f "$file" 2>/dev/null || { board_log "$hook" "could not remove $file"; return 1; }
}

# -------------------------------------------------------------- the issue body
#
# Three sections of the body carry checklists, each a level-2 heading followed
# by GitHub task-list items (`- [ ] text`, `- [x] text`):
#
#   ## Actions for human     at the top; the hooks add to it, the lead ticks
#   ## Acceptance criteria   the card gate reads it
#   ## Definition of Done    the card gate reads it
#
# Headings match ignoring case and trailing space. An item's number is its
# position in its section, from 1. The jq below does the parsing, so the rules
# live in one place.

BOARD_JQ_SECTION='
  def lines: split("\n") | map(sub("\r$"; ""));
  def heading($name): test("^##[ \t]+" + $name + "[ \t]*$"; "i");
  def section($name):
    lines as $l
    | ([range(0; $l | length) | select($l[.] | heading($name))] | first) as $start
    | if $start == null then null
      else [ $l[($start + 1):][] ] as $rest
      | ([range(0; $rest | length) | select($rest[.] | test("^##[ \t]"))] | first) as $end
      | ($rest[0:($end // ($rest | length))])
        | map(select(test("^[-*][ \t]+\\[[ xX]\\][ \t]")))
        | to_entries
        | map({index: (.key + 1),
               checked: (.value | test("^[-*][ \t]+\\[[xX]\\]")),
               text: (.value | sub("^[-*][ \t]+\\[[ xX]\\][ \t]+"; ""))})
      end;
'

# board_status_of_json JSON -> the column an issue's state and labels put it in.
# Closed is Done whatever its labels say. Of several status labels on an open
# issue, the one nearest the human wins: blocked by human, blocked, in
# progress, next. None is To Do.
BOARD_JQ_STATUS='
  def status:
    if (.state // "" | ascii_upcase) == "CLOSED" then "Done"
    else ((.labels // []) | map(.name | ascii_downcase)) as $n
      | if ($n | index("status:blocked-by-human")) then "Blocked by human"
        elif ($n | index("status:blocked")) then "Blocked"
        elif ($n | index("status:in-progress")) then "In Progress"
        elif ($n | index("status:next")) then "Next"
        else "To Do" end
    end;
'

# board_item_read HOOK REF
# One `gh issue view` for the two things SubagentStart decides on: sets
# BOARD_ITEM_STATUS to the issue's column and BOARD_ITEM_OPEN_ACTIONS to the
# number of unticked items under Actions for human. Called directly, never in
# $(...), so the two globals survive. Returns 1, having set both empty, when gh
# is not going to be called at all (disabled or a dry run), or when the call
# failed or answered in a shape this library cannot read.
board_item_read() {
  local hook="$1" id="$2" out line tab
  tab="$(printf '\t')"
  BOARD_ITEM_STATUS=""
  BOARD_ITEM_OPEN_ACTIONS=""
  board_would_send || return 1
  out="$(board_issue_json "$hook" "$id" state,labels,body)" || return 1
  line="$(printf '%s' "$out" | jq -r "$BOARD_JQ_STATUS $BOARD_JQ_SECTION"' [status, (((.body // "") | section("actions for human")) // [] | map(select(.checked | not)) | length)] | @tsv' 2>/dev/null)" || line=""
  BOARD_ITEM_STATUS="${line%%"$tab"*}"
  if [ -z "$BOARD_ITEM_STATUS" ]; then
    board_log "$hook" "issue $id: no state in the response"
    return 1
  fi
  BOARD_ITEM_OPEN_ACTIONS="${line##*"$tab"}"
  case "$BOARD_ITEM_OPEN_ACTIONS" in ''|*[!0-9]*) BOARD_ITEM_OPEN_ACTIONS=0 ;; esac
  return 0
}

# board_item_checklist HOOK REF
# One `gh issue view` for TaskCompleted's card gate. Sets BOARD_ITEM_AC_COUNT
# to the number of acceptance criteria, BOARD_ITEM_OPEN_COUNT to the number of
# unticked criteria and Definition of Done items together, and
# BOARD_ITEM_OPEN_AC and BOARD_ITEM_OPEN_DOD to one "- <n>. <text>" line per
# unticked item in each section. A body with no Definition of Done section has
# none to tick; a body with no Acceptance criteria section has none, which the
# gate refuses.
#
# Unlike board_item_read it reads on a dry run too, because the read decides
# the exit code and a dry run has to exit as a live one would. Returns 1,
# having logged why and set all four empty, when the issue cannot be read.
board_item_checklist() {
  local hook="$1" id="$2" out line tab
  tab="$(printf '\t')"
  BOARD_ITEM_AC_COUNT=""
  BOARD_ITEM_OPEN_COUNT=""
  BOARD_ITEM_OPEN_AC=""
  BOARD_ITEM_OPEN_DOD=""
  if ! out="$(board_issue_json "$hook" "$id" body)"; then
    board_log "$hook" "issue $id: the view failed, so its criteria and Definition of Done could not be read"
    return 1
  fi
  local jq_open='map(select(.checked | not) | "- \(.index). \(.text | gsub("[\r\n]+"; " "))") | join("\n")'
  if ! line="$(printf '%s' "$out" | jq -r "$BOARD_JQ_SECTION"'
      (.body // "") as $b
      | ($b | section("acceptance criteria") // []) as $ac
      | ($b | section("definition of done") // []) as $dod
      | [($ac | length), ([$ac[], $dod[] | select(.checked | not)] | length),
         ($ac | '"$jq_open"' | @base64), ($dod | '"$jq_open"' | @base64)] | @tsv' 2>/dev/null)" || [ -z "$line" ]; then
    board_log "$hook" "issue $id: its criteria and Definition of Done could not be counted"
    return 1
  fi
  local ac_count open_count open_ac open_dod rest
  ac_count="${line%%"$tab"*}"; rest="${line#*"$tab"}"
  open_count="${rest%%"$tab"*}"; rest="${rest#*"$tab"}"
  open_ac="${rest%%"$tab"*}"; open_dod="${rest#*"$tab"}"
  case "$ac_count" in ''|*[!0-9]*) board_log "$hook" "issue $id: its criteria could not be counted"; return 1 ;; esac
  case "$open_count" in ''|*[!0-9]*) board_log "$hook" "issue $id: its criteria could not be counted"; return 1 ;; esac
  BOARD_ITEM_AC_COUNT="$ac_count"
  BOARD_ITEM_OPEN_COUNT="$open_count"
  BOARD_ITEM_OPEN_AC="$(printf '%s' "$open_ac" | jq -Rr '@base64d' 2>/dev/null || printf '')"
  BOARD_ITEM_OPEN_DOD="$(printf '%s' "$open_dod" | jq -Rr '@base64d' 2>/dev/null || printf '')"
  return 0
}

# board_status_same A B: true when two column names are the same ignoring case
# and spaces.
board_status_same() {
  local a b
  a="$(printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -d ' ')"
  b="$(printf '%s' "$2" | tr 'A-Z' 'a-z' | tr -d ' ')"
  [ -n "$a" ] && [ "$a" = "$b" ]
}

# board_column_label COLUMN -> the status label that is the column, nothing for
# To Do, or returns 1 for Done and for a name that is no column: the hooks never
# close an issue, a merged pull request does.
board_column_label() {
  if board_status_same "$1" "$BOARD_COL_NEXT"; then printf 'status:next\n'; return 0; fi
  if board_status_same "$1" "$BOARD_COL_IN_PROGRESS"; then printf 'status:in-progress\n'; return 0; fi
  if board_status_same "$1" "$BOARD_COL_BLOCKED"; then printf 'status:blocked\n'; return 0; fi
  if board_status_same "$1" "$BOARD_COL_BLOCKED_HUMAN"; then printf 'status:blocked-by-human\n'; return 0; fi
  if board_status_same "$1" "$BOARD_COL_TODO"; then return 0; fi
  return 1
}

BOARD_STATUS_LABELS="status:next status:in-progress status:blocked status:blocked-by-human"

# board_ensure_label HOOK LABEL: creates a status label the repository lacks.
# --force makes it idempotent, and two hooks racing to create one both succeed.
board_ensure_label() {
  local hook="$1" label="$2" colour desc
  case "$label" in
    status:next) colour=0E8A16; desc="The human's ordered queue: the fleet takes these first, oldest first" ;;
    status:in-progress) colour=1D76DB; desc="An agent has picked it up" ;;
    status:blocked) colour=E99695; desc="Waiting on something that is not the human" ;;
    status:blocked-by-human) colour=B60205; desc="Waiting on the human. The human queue" ;;
    *) return 1 ;;
  esac
  board_cli "$hook" label create "$label" --color "$colour" --description "$desc" --force >/dev/null
}

# board_set_status HOOK REF COLUMN
# Reads the issue's labels, then one `gh issue edit` that adds the column's
# label and removes every other status label the issue carries. Nothing to
# change, no edit. A label the repository lacks is created once and the edit
# retried, so a repository nobody ran /init on still gets its columns.
board_set_status() {
  local hook="$1" id="$2" col="$3" label n l have out
  if ! label="$(board_column_label "$col")"; then
    board_log "$hook" "\"$col\" is not a column a hook writes; $id not moved"
    return 1
  fi
  n="$(issue_number "$id")"
  out="$(board_issue_json "$hook" "$id" labels)" || return 1
  have=" $(printf '%s' "$out" | jq -r '[(.labels // [])[].name | ascii_downcase] | join(" ")' 2>/dev/null) "
  set --
  case "$have" in *" $label "*) ;; *) [ -n "$label" ] && set -- --add-label "$label" ;; esac
  for l in $BOARD_STATUS_LABELS; do
    [ "$l" = "$label" ] && continue
    case "$have" in *" $l "*) set -- "$@" --remove-label "$l" ;; esac
  done
  if [ $# -eq 0 ]; then
    board_log "$hook" "$id is already in $col"
    return 0
  fi
  if ! BOARD_CLI_QUIET=1 board_cli "$hook" issue edit "$n" "$@" >/dev/null; then
    case "$BOARD_CLI_ERR" in
      *"not found"*)
        if [ -n "$label" ] && board_ensure_label "$hook" "$label" \
          && board_cli "$hook" issue edit "$n" "$@" >/dev/null; then
          board_log "$hook" "created the $label label"
        else
          board_log "$hook" "could not move $id to $col: $(printf '%s' "$BOARD_CLI_ERR" | head -c 300 | tr '\n' ' ')"
          return 1
        fi
        ;;
      *)
        board_log "$hook" "could not move $id to $col: $(printf '%s' "$BOARD_CLI_ERR" | head -c 300 | tr '\n' ' ')"
        return 1
        ;;
    esac
  fi
  board_log "$hook" "$id -> $col"
}

# board_comment_raw HOOK REF TEXT
# board_comment guards this already, but this is the other public entry point
# and a caller reaching it directly must not be able to post a comment that
# says nothing. Both doors, one rule. The body goes on stdin, so no length of
# comment meets an argument limit.
board_comment_raw() {
  local hook="$1" id="$2" text="$3"
  if [ -z "$(printf '%s' "$text" | tr -d '[:space:]')" ]; then
    board_log "$hook" "no comment text; nothing posted on $id"
    return 1
  fi
  printf '%s\n' "$text" | board_cli "$hook" issue comment "$(issue_number "$id")" --body-file - >/dev/null || return 1
  board_log "$hook" "commented on $id"
}

# ------------------------------------------------------------- the comment cap
#
# The cap is for the reader: an issue comment is a summary, and GitHub refuses
# a body over 65536 characters. A comment that has to be cut is archived whole
# first, by board_archive_comment above, so the trailer on the cut text names
# the file with the rest. Cutting happens inside jq, which counts Unicode
# codepoints, so a multi-byte character is never split.
BOARD_COMMENT_HARD_MAX=60000

# board_cap_comment HOOK ITEM_REF TEXT
# Prints the text that should actually go on the issue: the text itself when it
# is under the cap, and the cut text plus its trailer when it is not.
board_cap_comment() {
  local hook="$1" page="$2" text="$3"
  local len max out over note archive

  max="${BOARD_COMMENT_MAX_CHARS:-8000}"
  case "$max" in
    ''|*[!0-9]*|0) board_log "$hook" "BOARD_COMMENT_MAX_CHARS is not a positive integer; using 8000"; max=8000 ;;
  esac
  if [ "$max" -gt "$BOARD_COMMENT_HARD_MAX" ]; then
    board_log "$hook" "BOARD_COMMENT_MAX_CHARS is $max, above the hard ceiling; using $BOARD_COMMENT_HARD_MAX"
    max="$BOARD_COMMENT_HARD_MAX"
  fi

  len="$(printf '%s' "$text" | jq -Rs 'length' 2>/dev/null || printf '')"
  case "$len" in ''|*[!0-9]*) len=0 ;; esac

  out="$text"
  if [ "$len" -gt "$max" ]; then
    over=$((len - max))
    if archive="$(board_archive_comment "$hook" "$page" "$text")"; then
      note="[Cut to fit an issue comment. The other $over characters, and this text in full, are in $archive]"
      board_log "$hook" "comment for $page is $len characters; cutting to $max and archiving the full text at $archive"
    else
      note="[Cut to fit an issue comment. $over more characters were dropped and could not be archived; see the hook log.]"
      board_log "$hook" "comment for $page is $len characters; cutting to $max with no archive, so $over characters are lost"
    fi
    out="$(printf '%s' "$text" | jq -Rs --argjson max "$max" --arg note "$note" -r \
      '.[0:$max] + "\n\n" + $note' 2>/dev/null)"
    if [ -z "$out" ]; then
      board_log "$hook" "could not cut the comment for $page; posting it uncut"
      out="$text"
    fi
  fi

  printf '%s\n' "$out"
}

# Whether a write is about to reach gh. Disabled and dry runs never resolve, so
# no write calls gh - which is also what keeps the eval suites offline. Two
# reads ignore it on a dry run: board_focus_id, which reads a local file, and
# board_item_checklist, the one TaskCompleted makes for an [issue:#N] task,
# because its answer decides the exit code. A disabled board calls nothing.
board_would_send() {
  board_disabled && return 1
  [ -n "${BOARD_DRY_RUN:-}" ] && return 1
  return 0
}

# board_add_actions HOOK REF TEXT...
# Appends one action per TEXT to the issue's Actions for human section, making
# the section at the top of the body when there is none, in one body edit of
# its own after the move. An ask that does not end in "?" is flagged
# "[not a question] ", so a likely false blocker shows at once. The body is read
# and written whole, so a human editing the issue in the same second can lose
# that edit; the window is one hook's run.
board_add_actions() {
  local hook="$1" id="$2" n out body tmp
  shift 2
  n=$#
  [ "$n" -gt 0 ] || return 0
  if ! out="$(board_issue_json "$hook" "$id" body)"; then
    board_log "$hook" "the $n action(s) for the human did not reach $id: its body could not be read"
    return 1
  fi
  tmp="$(mktemp "${TMPDIR:-/tmp}/board-body.XXXXXX")" || return 1
  if ! printf '%s' "$out" | jq -r --args "$BOARD_JQ_SECTION"'
      def flag: if test("\\?[ \t]*$") then . else "[not a question] " + . end;
      def item($i; $t): "- [ ] \($i). " + ($t | gsub("[\r\n]+"; " ") | flag);
      ((.body // "") | lines) as $l
      | ([range(0; $l | length) | select($l[.] | heading("actions for human"))] | first) as $start
      | if $start == null then
          (["## Actions for human"] + [range(0; $ARGS.positional | length) as $i | item($i + 1; $ARGS.positional[$i])] + [""] + $l) | join("\n")
        else
          ([ $l[($start + 1):][] ]) as $rest
          | ([range(0; $rest | length) | select($rest[.] | test("^##[ \t]"))] | first // ($rest | length)) as $end
          | ([ $rest[0:$end][] | select(test("^[-*][ \t]+\\[[ xX]\\][ \t]")) ] | length) as $have
          | ([range(0; $end) | select($rest[.] | test("^[-*][ \t]+\\[[ xX]\\][ \t]"))] | last) as $lastItem
          | (if $lastItem == null then $start + 1 else $start + 1 + $lastItem + 1 end) as $at
          | ($l[0:$at] + [range(0; $ARGS.positional | length) as $i | item($have + $i + 1; $ARGS.positional[$i])] + $l[$at:]) | join("\n")
        end' "$@" > "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    board_log "$hook" "the $n action(s) for the human did not reach $id: its body could not be rewritten"
    return 1
  fi
  if ! board_cli "$hook" issue edit "$(issue_number "$id")" --body-file "$tmp" >/dev/null; then
    rm -f "$tmp"
    board_log "$hook" "the $n action(s) for the human did not reach $id"
    return 1
  fi
  rm -f "$tmp"
  board_log "$hook" "added $n action(s) for the human to $id"
}

# board_write HOOK ITEM_REF COLUMN [COMMENT [ACTION...]]
# The one entry point the hooks use. Always returns 0: a board write must not
# decide whether a session continues. Each ACTION is added to the issue's
# Actions for human after the move and before the comment. It is added even
# when the move failed, so the human still finds the question at the top of
# the issue.
board_write() {
  local hook="$1" page="$2" col="$3" comment="${4:-}"
  if [ $# -gt 4 ]; then shift 4; else set --; fi
  if [ -z "$page" ]; then
    board_log "$hook" "no issue resolved, nothing to move to \"$col\" (see README, Which issue)"
    return 0
  fi
  require_tools "$hook" || return 0
  if board_would_send; then
    local resolved
    resolved="$(board_resolve "$hook" "$page")" || resolved=""
    if [ -z "$resolved" ]; then board_log "$hook" "issue $page not found; nothing moved"; return 0; fi
    board_set_status "$hook" "$resolved" "$col" || true
    board_add_actions "$hook" "$resolved" "$@" || true
    if [ -n "$comment" ]; then board_comment_raw "$hook" "$resolved" "$(board_cap_comment "$hook" "$page" "$comment")" || true; fi
  else
    board_log "$hook" "dry run: would move $page to $col${comment:+ with a comment}"
    local t
    for t in "$@"; do
      board_log "$hook" "dry run: would add an action for the human to $page: $t"
    done
  fi
  return 0
}

# board_comment HOOK ITEM_REF TEXT
# Say something on an issue without moving it. Same envelope and same promise
# as board_write: every failure is logged and swallowed, and it always returns
# 0, because nothing about the board decides whether a session continues.
board_comment() {
  local hook="$1" page="$2" text="$3"
  if [ -z "$page" ]; then
    board_log "$hook" "no issue resolved, nothing to comment on (see README, Which issue)"
    return 0
  fi
  if [ -z "$(printf '%s' "$text" | tr -d '[:space:]')" ]; then
    board_log "$hook" "no comment text; nothing posted on $page"
    return 0
  fi
  require_tools "$hook" || return 0
  if board_would_send; then
    local resolved
    resolved="$(board_resolve "$hook" "$page")" || resolved=""
    if [ -z "$resolved" ]; then board_log "$hook" "issue $page not found; nothing posted"; return 0; fi
    board_comment_raw "$hook" "$resolved" "$(board_cap_comment "$hook" "$page" "$text")" || true
  else
    board_log "$hook" "dry run: would comment on $page"
  fi
  return 0
}
