#!/bin/bash
# Logs the SubagentStop payload, then blocks the first call for a given
# agent_id and allows subsequent calls through (question 2). Output shape
# confirmed against learn.chatgpt.com/docs/hooks, 25 September 2026: the
# top-level decision/reason shape is the only one documented for
# SubagentStop, unlike PreToolUse which also has a hookSpecificOutput form.
LOGDIR="${SPIKE_LOG_DIR:?SPIKE_LOG_DIR must be set - no /tmp fallback}"
STATEDIR="${SPIKE_STATE_DIR:?SPIKE_STATE_DIR must be set - no /tmp fallback}"
mkdir -p "$LOGDIR" "$STATEDIR"
PAYLOAD="$(cat)"
{
  echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
  echo "$PAYLOAD"
} >> "$LOGDIR/SubagentStop.log"

AGENT_ID="$(echo "$PAYLOAD" | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("agent_id","unknown"))' 2>/dev/null)"
MARKER="$STATEDIR/blocked-$AGENT_ID"

if [ ! -f "$MARKER" ]; then
  touch "$MARKER"
  echo '{"decision":"block","reason":"spike: first SubagentStop for this agent is always blocked once, to see whether the subagent is sent back to work with this reason"}'
  exit 0
fi

exit 0
