#!/bin/bash
# Logs every PreToolUse payload. Blocks the first apply_patch call it sees,
# to test file-edit refusal, and otherwise allows (question 3). Output shape
# confirmed against learn.chatgpt.com/docs/hooks, 25 September 2026: the
# primary block shape nests under hookSpecificOutput.permissionDecision;
# the top-level decision/reason shape is documented there only as "legacy".
LOGDIR="${SPIKE_LOG_DIR:?SPIKE_LOG_DIR must be set - no /tmp fallback}"
STATEDIR="${SPIKE_STATE_DIR:?SPIKE_STATE_DIR must be set - no /tmp fallback}"
mkdir -p "$LOGDIR" "$STATEDIR"
PAYLOAD="$(cat)"
{
  echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
  echo "$PAYLOAD"
} >> "$LOGDIR/PreToolUse.log"

TOOL_NAME="$(echo "$PAYLOAD" | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_name",""))' 2>/dev/null)"

if [ "$TOOL_NAME" = "apply_patch" ] && [ ! -f "$STATEDIR/blocked-apply_patch" ]; then
  touch "$STATEDIR/blocked-apply_patch"
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"spike: refusing this apply_patch call once, to test PreToolUse block on a file edit"}}'
  exit 0
fi

exit 0
