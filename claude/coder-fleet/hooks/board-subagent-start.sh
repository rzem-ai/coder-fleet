#!/usr/bin/env bash
# SubagentStart: move the board item into In Progress (or Doing, on a board not
# yet renamed) and record which item this subagent is working on, so
# board-subagent-stop.sh and board-task-completed.sh can find it again.
#
# Fails soft, always. SubagentStart cannot block a spawn, and nothing about
# the board is allowed to matter to the session.
set -euo pipefail

HOOK=SubagentStart
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/board.sh
. "$HOOK_DIR/lib/board.sh"

trap 'board_log "$HOOK" "unexpected error on line $LINENO; session continues"; exit 0' ERR

# held_for_human ID: true, having logged it, when the card sits in Blocked by
# human with an action the human has not yet ticked (CF-25, the hold rule). A
# start then moves nothing: moving it would archive the questions off the top
# of the card while the human is still reading them. The lead ticks each action
# as the human answers it, and the next start after the last tick moves the
# card as before. Reads BOARD_ITEM_STATUS and BOARD_ITEM_OPEN_ACTIONS, which the
# caller has just filled with board_item_read.
held_for_human() {
  if board_status_same "$BOARD_ITEM_STATUS" "$BOARD_COL_BLOCKED_HUMAN" && [ "${BOARD_ITEM_OPEN_ACTIONS:-0}" -gt 0 ]; then
    board_log "$HOOK" "waiting on the human: $BOARD_ITEM_OPEN_ACTIONS open action(s) on $1; leaving it in $BOARD_COL_BLOCKED_HUMAN until each is ticked. Nothing moved."
    return 0
  fi
  return 1
}

input="$(cat)"

if ! command -v jq >/dev/null 2>&1; then
  board_log "$HOOK" "jq is not installed, so no hook input can be parsed. Install jq (macOS: brew install jq)."
  exit 0
fi

session_id="$(printf '%s' "$input" | jq -r '.session_id // ""')"
agent_id="$(printf '%s' "$input" | jq -r '.agent_id // ""')"
agent_type="$(printf '%s' "$input" | jq -r '.agent_type // ""')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // ""')"
export BOARD_CWD="$cwd"
# Which run a board write belongs to, as the stop hook sets them. A refused
# move is noted on the card once per session, which needs the session here.
BOARD_RUN_SESSION="$session_id"
BOARD_RUN_AGENT="$agent_type"
BOARD_RUN_AGENT_ID="$agent_id"

# A resume. SendMessage to a finished subagent re-fires SubagentStart for the
# same agent id, and the record its first start wrote says which item it is on.
# That record wins over everything below, the focus included: a resume never
# takes its item from the focus, because the lead may have refocused on other
# work since, and the stop has to reach the item the agent was working on. The
# focus is still read, but only to say in the log when it now differs.
if [ -n "$agent_id" ] && state_agent_bound "$session_id" "$agent_id"; then
  page_id="$(state_agent_page_id "$session_id" "$agent_id")" || page_id=""
  focus=""
  if focus="$(board_focus_id "$HOOK")"; then
    focus="$(normalise_page_id "$focus")" || focus=""
  else
    focus=""
  fi
  if [ -z "$page_id" ]; then
    board_log "$HOOK" "${agent_type:-agent} $agent_id resumed; it started with no item, so it stays unbound${focus:+ (the focus is now $focus)}. Nothing moved."
    exit 0
  fi
  mismatch=""
  if [ -n "$focus" ] && [ "$focus" != "$page_id" ]; then mismatch=" (the focus is now $focus)"; fi
  board_log "$HOOK" "${agent_type:-agent} $agent_id resumed; keeping $page_id, the item it started on$mismatch"
  # Done stays Done: a resume after TaskCompleted is usually a question, and
  # moving the card would silently reopen finished work. Blocked by human with
  # an open action stays too (held_for_human). Anything else, Blocked by human
  # with every action ticked included, goes back to In Progress. A dry run or a
  # disabled board reads no card, so it cannot know which applies, and says so
  # rather than reporting a move that might not happen.
  if ! board_would_send; then
    board_log "$HOOK" "dry run: resumed on $page_id; the Done check was skipped because no status is read, and the hold check with it, so it would go to In Progress unless it is Done, or $BOARD_COL_BLOCKED_HUMAN with an open action"
    exit 0
  fi
  # A failed read moves nothing: read as "nothing held", a view that timed out
  # would let the move through and the binary would archive the human's open asks.
  if ! board_item_read "$HOOK" "$page_id"; then
    board_log "$HOOK" "could not read $page_id, so neither the Done check nor the hold check can run; moving nothing"
    exit 0
  fi
  if board_status_same "$BOARD_ITEM_STATUS" "$BOARD_COL_DONE"; then
    board_log "$HOOK" "resumed on $page_id, which is Done; leaving it there"
    exit 0
  fi
  if held_for_human "$page_id"; then exit 0; fi
  if col="$(board_in_progress_column "$HOOK")"; then board_write "$HOOK" "$page_id" "$col"; fi
  exit 0
fi

# There is no spawn prompt on this event - the SubagentStart schema is the
# common fields plus agent_id and agent_type - so the binding comes from the
# checkout, not the spawn. In order: the focus file the lead wrote with
# task_focus (or the human with /work), then the launch-time environment
# variable, kept last so a stale one in a shell never overrides a focus.
# `instructions` is still read first so that a runtime which starts sending one
# works without another change here. There is no session fallback (CF-48): the
# item the session last bound used to come next, so a cleared focus did not
# keep a scout off that card, and its start could reopen a Done one.
instructions="$(printf '%s' "$input" | jq -r '.instructions // .prompt // .initial_prompt // ""')"

page_id=""
source_of_id=""

if [ -n "$instructions" ]; then
  if page_id="$(page_id_from_instructions "$instructions")"; then
    source_of_id="Board-Item: line in the spawn prompt"
  else
    page_id=""
  fi
fi

focus_rc=0
if [ -z "$page_id" ]; then
  if page_id="$(board_focus_id "$HOOK")"; then source_of_id="focus file"; else focus_rc=$?; page_id=""; fi
fi

if [ -z "$page_id" ] && [ -n "${CODER_FLEET_BOARD_PAGE_ID:-}" ]; then
  if page_id="$(normalise_page_id "$CODER_FLEET_BOARD_PAGE_ID")"; then
    source_of_id="CODER_FLEET_BOARD_PAGE_ID"
  else
    board_log "$HOOK" "CODER_FLEET_BOARD_PAGE_ID is set but is not a board item id or task file path"
    page_id=""
  fi
fi

if [ -z "$page_id" ]; then
  # Record the agent as unbound, so a resume of it stays unbound rather than
  # picking up whatever the lead focuses in the meantime. Only on a focus read
  # that succeeded and found nothing: a read that failed or timed out is not
  # evidence, and a permanent unbound record written on it would keep the
  # resume off an item the checkout was in fact focused on.
  if [ -n "$agent_id" ] && [ "$focus_rc" -ne 1 ]; then
    board_log "$HOOK" "could not read the focus for ${agent_type:-agent} $agent_id (the board is off, or focus --show failed); recording no binding, so a resume reads the focus again"
  elif [ -n "$agent_id" ]; then
    bind_rc=0
    state_bind_agent "$session_id" "$agent_id" "" "$agent_type" || bind_rc=$?
    if [ "$bind_rc" -eq 1 ]; then
      board_log "$HOOK" "could not write the state file under $CODER_FLEET_STATE_DIR; a resume of $agent_id will read the focus"
    fi
  fi
  board_log "$HOOK" "no board item for ${agent_type:-unknown agent} (${agent_id:-no id}): nothing is focused in this checkout. Call task_focus <id> (or run /work <id>) before spawning against an item. Nothing moved. See hooks/README.md."
  exit 0
fi

if [ -z "$agent_id" ]; then
  # Nothing to key a record by. Every such start sharing one record would send
  # each later start's stop to the first one's item, so none is written.
  board_log "$HOOK" "${agent_type:-agent} start carries no agent_id; moving $page_id but recording no binding, so its stop will not find the item"
else
  bind_rc=0
  state_bind_agent "$session_id" "$agent_id" "$page_id" "$agent_type" || bind_rc=$?
  if [ "$bind_rc" -eq 1 ]; then
    board_log "$HOOK" "could not write the state file under $CODER_FLEET_STATE_DIR; later hooks will not find item $page_id"
  elif [ "$bind_rc" -eq 3 ]; then
    # Only reachable when this start lost a race with another start for the
    # same agent. The record that won stands.
    board_log "$HOOK" "${agent_type:-agent} $agent_id already has a state file; its first binding stands"
  fi
fi

board_log "$HOOK" "${agent_type:-agent} ${agent_id:-} picked up $page_id (from the $source_of_id)"
# The binding above stands either way, so the stop still reaches this item. Only
# the move waits: Done stays Done whatever bound it (CF-48), as on a resume, and
# an open action holds the card. A dry run reads no card, as on a resume.
if ! board_would_send; then
  board_log "$HOOK" "dry run: the Done check was skipped because no card is read, and the hold check was skipped with it, so $page_id would go to In Progress unless it is Done, or $BOARD_COL_BLOCKED_HUMAN with an open action"
  exit 0
fi
if ! board_item_read "$HOOK" "$page_id"; then
  board_log "$HOOK" "could not read $page_id, so neither the Done check nor the hold check can run; moving nothing"
  exit 0
fi
if board_status_same "$BOARD_ITEM_STATUS" "$BOARD_COL_DONE"; then
  board_log "$HOOK" "picked up $page_id, which is Done; leaving it there"
  exit 0
fi
if held_for_human "$page_id"; then exit 0; fi
if col="$(board_in_progress_column "$HOOK")"; then board_write "$HOOK" "$page_id" "$col"; fi

exit 0
