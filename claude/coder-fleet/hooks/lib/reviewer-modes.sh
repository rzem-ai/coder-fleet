# reviewer-modes.sh - which modes a reviewer's brief gives it.
#
# Sourced, never run, by agent-clock.sh and enforce-agent-scope.sh. The
# reviewer runs in up to three modes, and the lead's brief names them on one
# line, `Modes: review, break` for example: review always, break for mutation
# testing, use for driving the running product. Two hooks need the answer -
# the clock caps a break-mode run and no other, and the scope hook gives break
# and use mode the outside-the-project write rule they need - and a hook cannot
# ask the model which modes it was given.
#
# The answer comes from the brief itself. No hook event carries the spawn
# prompt: SubagentStart sends agent_id and agent_type, and every event's
# transcript_path is the session's own transcript, never the subagent's. But
# the runtime writes the subagent's transcript beside it, at
# <session transcript without .jsonl>/subagents/agent-<agent_id>.jsonl, or one
# directory further down for a workflow lane
# (subagents/workflows/wf_<run>/agent-<agent_id>.jsonl), and its first user
# message is the spawn prompt (read off 2.1.322's bundle and a live transcript,
# 2026-11-11). The reviewer's body reads the same line, so the hooks and the
# agent cannot disagree about the modes unless the file cannot be read.
#
# Rules, stated once:
#   - Only the first user message counts. A SendMessage resume appends user
#     messages to the same file, and none of them can add or drop a mode.
#   - The first line in it that starts `Modes:` (leading spaces allowed, any
#     case) is the mode line; the words on it are matched whole, any case. A
#     brief with no such line is review only. The word "break" anywhere else is
#     prose, not a mode.
#   - A brief that cannot be found or read, an agent id that is not plain
#     [A-Za-z0-9_-], or a missing jq is review only, and the caller is told so
#     by a non-zero return. Review only is the narrowest scope and the uncapped
#     clock, which is the body's own default too.
#
#   reviewer_modes <session transcript_path> <agent_id>
#       prints "review", "review break", "review use" or "review break use";
#       returns 0 when the brief was read, 1 when it was not (and prints
#       "review").
#
# Written for bash 3.2.

reviewer_brief_path() {
  local tp="$1" id="$2" base found
  case "$id" in ''|*[!A-Za-z0-9_-]*) return 1 ;; esac
  [ -n "$tp" ] || return 1
  # An event that already names the subagent's own file.
  case "$tp" in
    */agent-"$id".jsonl) [ -f "$tp" ] && { printf '%s' "$tp"; return 0; } ;;
  esac
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

reviewer_modes() {
  local path words
  command -v jq >/dev/null 2>&1 || { printf 'review'; return 1; }
  path="$(reviewer_brief_path "$1" "$2")" || { printf 'review'; return 1; }
  # first() stops reading at the first user message, so a long transcript
  # costs one line. No user message yet is "cannot tell", not "no modes".
  words="$(jq -n -r '
      (first(inputs | select(type == "object" and .type == "user")) // null)
      | if . == null then error("no brief yet") else . end
      | .message.content
      | if type == "string" then .
        elif type == "array" then ([.[] | select(type == "object" and .type == "text") | .text | strings] | join("\n"))
        else "" end
      | [splits("\r?\n") | select(test("^[ \t]*[Mm][Oo][Dd][Ee][Ss]:"))] | (first // "")
      | sub("^[ \t]*[Mm][Oo][Dd][Ee][Ss]:"; "") | ascii_downcase
      | [scan("[a-z]+")] as $w
      | [("break", "use") as $m | select(any($w[]; . == $m)) | " " + $m] | join("")
    ' < "$path" 2>/dev/null)" || { printf 'review'; return 1; }
  printf 'review%s' "$words"
}
