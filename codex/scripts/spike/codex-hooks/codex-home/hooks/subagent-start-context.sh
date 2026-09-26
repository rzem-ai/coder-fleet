#!/bin/bash
# Logs the SubagentStart payload and returns additionalContext text, to see
# whether it reaches the subagent (question 5). Output shape confirmed
# against learn.chatgpt.com/docs/hooks, 25 September 2026: additionalContext
# nests under hookSpecificOutput.hookEventName.
LOGDIR="${SPIKE_LOG_DIR:?SPIKE_LOG_DIR must be set - no /tmp fallback}"
mkdir -p "$LOGDIR"
PAYLOAD="$(cat)"
{
  echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
  echo "$PAYLOAD"
} >> "$LOGDIR/SubagentStart.log"

echo '{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"SPIKE_MARKER_9f3a: if you can see this sentence, additionalContext from SubagentStart reached you. Mention the literal token SPIKE_MARKER_9f3a somewhere in your final message."}}'
exit 0
