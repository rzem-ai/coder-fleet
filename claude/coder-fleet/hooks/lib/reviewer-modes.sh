# reviewer-modes.sh - which modes a reviewer's brief gives it.
#
# Sourced, never run, by agent-clock.sh and enforce-agent-scope.sh. The
# reviewer runs in up to three modes, and the lead's brief names them in its
# header, `Modes: review, break` for example: review always, break for mutation
# testing, use for driving the running product. Two hooks need the answer -
# the clock caps a break-mode run and no other, and the scope hook gives break
# and use mode the outside-the-project write rule they need - and a hook cannot
# ask the model which modes it was given.
#
# Where the answer comes from. No hook event carries the spawn prompt:
# SubagentStart sends agent_id and agent_type, and every event's
# transcript_path is the session's own transcript, never the subagent's. But
# the runtime writes the subagent's transcript beside it, at
# <session transcript without .jsonl>/subagents/agent-<agent_id>.jsonl, or
# deeper for a workflow lane (subagents/workflows/wf_<run>/agent-<agent_id>.jsonl),
# and its first user message is the spawn prompt (read off 2.1.322's bundle and
# a live transcript, 2026-11-11). A PreToolUse hook on the Agent tool sees the
# prompt as structured input but not the agent id the spawn will get, so it has
# nothing to key a record by, and a workflow's agent() spawn was never shown to
# pass through it; that route was rejected for those two reasons.
#
# The signal, stated once:
#   - Only the spawn prompt counts: the first user message. A SendMessage
#     resume appends user messages, and none of them is read.
#   - Only its header counts: the prompt's first five lines. A `Modes:` line
#     further down - quoted from a file, a diff, a handoff - is never read.
#   - A header line is one of those five that looks like a mode line in any
#     case or spacing (`modes :`, `  MODES:`). Its format is closed: exactly
#     `Modes: ` at column 0 and then one or more of review, break and use,
#     lower case, separated by a comma and at most one space, nothing else on
#     the line but trailing whitespace. A header line in any other form, or
#     two of them, is malformed, so a near miss is never read as no header.
#   - No header line: review only, read cleanly. That is the body's default.
#   - Malformed header, no brief found, no user message yet, an agent id that
#     is not plain [A-Za-z0-9_-], or no jq: the brief is unread, and the caller
#     fails closed its own way - the clock caps the run, the scope hook gives
#     review mode's narrow rule.
#   - Sticky: the first time the brief reads cleanly, the answer is recorded
#     in <state>/modes/<agent_id>, created exclusively (noclobber) with mode
#     0600 in a 0700 directory, and every later call by either hook uses the
#     record and never rereads the brief. So a run cannot gain or lose break
#     mode mid-run. An unread brief records nothing, because SubagentStart
#     can fire before the runtime has written the prompt, and recording
#     "unread" then would cap every review run for good. A record that cannot
#     be written changes nothing: the answer read is still used.
#
#   reviewer_modes <session transcript_path> <agent_id>
#       prints "review", "review break", "review use" or "review break use";
#       returns 0 when the answer is recorded or was read cleanly, 1 when the
#       brief is unread (and prints "review").
#
# Written for bash 3.2.

REVIEWER_MODES_STATE_DIR="${CODER_FLEET_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/coder-fleet}/modes"
REVIEWER_MODES_HEADER_LINES=5

reviewer_brief_path() {
  local tp="$1" id="$2" base found
  case "$id" in ''|*[!A-Za-z0-9_-]*) return 1 ;; esac
  [ -n "$tp" ] || return 1
  base="${tp%.jsonl}/subagents"
  [ -d "$base" ] || return 1
  if [ -f "$base/agent-$id.jsonl" ]; then
    printf '%s' "$base/agent-$id.jsonl"
    return 0
  fi
  found="$(find "$base" -maxdepth 4 -type f -name "agent-$id.jsonl" 2>/dev/null | head -n 1)"
  [ -n "$found" ] || return 1
  printf '%s' "$found"
}

# Reads the brief. Prints the modes, or returns 1 when the brief is unread.
reviewer_modes_read() {
  local path words
  command -v jq >/dev/null 2>&1 || return 1
  path="$(reviewer_brief_path "$1" "$2")" || return 1
  # first() stops reading at the first user message, so a long transcript
  # costs one line. No user message yet is unread, not "no modes". A
  # malformed header is an error, so unread too.
  words="$(jq -n -r --argjson n "$REVIEWER_MODES_HEADER_LINES" '
      (first(inputs | select(type == "object" and .type == "user")) // null)
      | if . == null then error("no brief yet") else . end
      | .message.content
      | if type == "string" then .
        elif type == "array" then ([.[] | select(type == "object" and .type == "text") | .text | strings] | join("\n"))
        else error("no text") end
      | [splits("\n")][0:$n] | map(sub("\r$"; "")) | map(select(test("^[ \t]*modes[ \t]*:"; "i")))
      | if length == 0 then ""
        elif length > 1 then error("two headers")
        else .[0] | sub("[ \t]+$"; "")
          | if test("^Modes: (review|break|use)(, ?(review|break|use))*$") | not then error("malformed")
            else [scan("review|break|use")] as $w
              | [("break", "use") as $m | select(any($w[]; . == $m)) | " " + $m] | join("")
            end
        end
    ' < "$path" 2>/dev/null)" || return 1
  printf 'review%s' "$words"
}

reviewer_modes() {
  local id="$2" rec out
  case "$id" in ''|*[!A-Za-z0-9_-]*) printf 'review'; return 1 ;; esac
  rec="$REVIEWER_MODES_STATE_DIR/$id"
  if [ -f "$rec" ]; then
    out="$(head -n 1 "$rec" 2>/dev/null)" || out=""
    case "$out" in
      review|"review break"|"review use"|"review break use") printf '%s' "$out"; return 0 ;;
    esac
    # A record this lib never writes is no answer; fail closed.
    printf 'review'
    return 1
  fi
  out="$(reviewer_modes_read "$1" "$id")" || { printf 'review'; return 1; }
  ( umask 077; mkdir -p "$REVIEWER_MODES_STATE_DIR" && chmod 700 "$REVIEWER_MODES_STATE_DIR" \
      && set -C && printf '%s\n' "$out" > "$rec" ) 2>/dev/null || true
  # Another call may have recorded first; its answer stands.
  if [ -f "$rec" ]; then
    local first
    first="$(head -n 1 "$rec" 2>/dev/null)" || first=""
    case "$first" in
      review|"review break"|"review use"|"review break use") out="$first" ;;
    esac
  fi
  printf '%s' "$out"
}
