#!/usr/bin/env bash
# PostToolUse on the Agent tool: keep the card honest when a subagent run ended
# without SubagentStop (CF-64).
#
# SubagentStop does not fire when maxTurns cuts a run off - measured on Claude
# Code 2.1.284, 0 of 3 cut-offs fired it and 2 of 2 normal finishes did - so the
# stop hook never saw the run, no handoff was checked, and the card sat silent
# in In Progress. The Agent tool still returns, and this hook reads that return.
#
# board-subagent-stop.sh writes a stopped marker beside the agent's record
# (sessions/<session_id>/agents/<agent_id>.stopped) before anything else it
# does. So when a foreground Agent call returns completed:
#
#   - no binding, or a non-fleet agent type: nothing but a log line
#   - bound and marked: nothing, SubagentStop already handled it
#   - bound and not marked: one comment on the bound card. When the runtime's
#     note says the agent stopped at its N-turn limit, the comment names the
#     cap and says the lead resumes it with SendMessage or re-runs it;
#     otherwise it says the run ended without SubagentStop, so the lead reads
#     the result itself.
#
# A background launch reports status "async_launched" at launch, not at the
# end of the run, so anything but "completed" is left alone: background spawns
# are the lead's to report. Never a column write, never a non-zero exit, never
# a block.
set -euo pipefail

HOOK=AgentReturn
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/board.sh
. "$HOOK_DIR/lib/board.sh"

trap 'board_log "$HOOK" "unexpected error on line $LINENO; session continues"; exit 0' ERR

# The runtime's own note at the head of a capped run's result, read off a live
# payload: "NOTE: this agent stopped at its 3-turn limit before finishing."
RE_CAP_NOTE='stopped at its ([0-9]+)-turn limit before finishing'

input="$(cat)"

if ! command -v jq >/dev/null 2>&1; then
  board_log "$HOOK" "jq is not installed, so no hook input can be parsed. Install jq (macOS: brew install jq)."
  exit 0
fi

if ! printf '%s' "$input" | jq -e 'type == "object"' >/dev/null 2>&1; then
  board_log "$HOOK" "the event is not a JSON object; nothing to read"
  exit 0
fi

session_id="$(printf '%s' "$input" | jq -r '.session_id // ""')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // ""')"
export BOARD_CWD="$cwd"
agent_id="$(printf '%s' "$input" | jq -r '.tool_response.agentId // "" | tostring')"
agent_type="$(printf '%s' "$input" | jq -r '.tool_response.agentType // "" | tostring')"
status="$(printf '%s' "$input" | jq -r '.tool_response.status // "" | tostring')"
# The first line of the first text block: the note, when there is one, is the
# first thing in the result, so model output further down cannot fake it.
first_line="$(printf '%s' "$input" | jq -r '
  .tool_response.content
  | if type == "array" then ([ .[] | select(type == "object" and .type == "text") | .text ] | first // "")
    elif type == "string" then .
    else "" end
  | tostring | split("\n") | first // ""')"

BOARD_RUN_SESSION="$session_id"
BOARD_RUN_AGENT="$agent_type"
BOARD_RUN_AGENT_ID="$agent_id"

if [ "$status" != "completed" ]; then
  board_log "$HOOK" "${agent_type:-an untyped agent} ${agent_id:-no id} returned with status \"${status:-none}\", not completed; a background launch reports here at launch, so the lead reports its end. Nothing posted"
  exit 0
fi

if [ -z "$agent_id" ] || [ -z "$agent_type" ]; then
  board_log "$HOOK" "an Agent call returned with no agent id or type; nothing to match to a card"
  exit 0
fi

# Fleet agents only, by the same matcher SubagentStop is registered with: any
# other type never reaches board-subagent-stop.sh, so it never has a marker,
# and its missing marker says nothing about how its run ended.
matcher="$(jq -r '.hooks.SubagentStop[0].matcher // ""' "$HOOK_DIR/hooks.json" 2>/dev/null)" || matcher=""
if [ -z "$matcher" ]; then
  board_log "$HOOK" "could not read the SubagentStop matcher from hooks.json; cannot tell a fleet agent, so nothing posted"
  exit 0
fi
if ! [[ $agent_type =~ $matcher ]]; then
  board_log "$HOOK" "$agent_type $agent_id is not a fleet agent, so SubagentStop's hook never runs for it; nothing posted"
  exit 0
fi

page_id=""
if ! page_id="$(state_agent_page_id "$session_id" "$agent_id")"; then
  board_log "$HOOK" "$agent_type $agent_id returned with no board item bound; nothing posted"
  exit 0
fi

if state_agent_stopped "$session_id" "$agent_id"; then
  board_log "$HOOK" "$agent_type $agent_id returned and SubagentStop already ran for it; nothing more to say on $page_id"
  exit 0
fi

if [[ $first_line =~ $RE_CAP_NOTE ]]; then
  turns="${BASH_REMATCH[1]}"
  comment="Stopped at its turn cap. $agent_type stopped at its ${turns}-turn cap before finishing, so it wrote no handoff and no handoff check ran. Its result is partial. The lead resumes it with SendMessage to let it finish, or re-runs it."
  board_log "$HOOK" "$agent_type $agent_id stopped at its ${turns}-turn cap without SubagentStop; commenting on $page_id"
else
  comment="Ended without SubagentStop. $agent_type returned without the SubagentStop event, so no handoff check ran and nothing from its handoff reached this card. The lead reads the result itself."
  board_log "$HOOK" "$agent_type $agent_id returned completed with no SubagentStop; commenting on $page_id"
fi

if ! board_would_send; then
  board_log "$HOOK" "dry run: the comment would read: $comment"
fi
board_comment "$HOOK" "$page_id" "$comment"

exit 0
