#!/bin/bash
# A SubagentStop wrapper for the CF-12.1 scratch projects.
#
# Usage, from a project's settings.json (absolute paths, written by setup.sh):
#   capture-stop.sh <scratch> capture
#   capture-stop.sh <scratch> hook
#
# In both modes it reads the SubagentStop JSON payload from stdin, writes it
# verbatim to <scratch>/logs/stop-<agent_id>.json, and - when the payload
# names an agent_transcript_path that exists - copies that transcript file
# into <scratch>/logs/ too, so both are ground truth for summarise.sh and
# replay.sh, capturing exactly what the runtime sent with nothing dropped.
#
# "capture" mode always exits 0: it exists only to record E1 and E3 stops,
# which never gate on a handoff.
#
# "hook" mode additionally pipes the same payload into the hook named in
# <scratch>/hook-under-test (an absolute path, one line, no trailing
# newline expected but tolerated), with CODER_FLEET_STATE_DIR and
# BOARD_LOG_FILE pointed into <scratch>/state so nothing it does ever
# touches a real board or a real ~/.claude. The hook's exit code and stderr
# are both recorded under <scratch>/logs/ and also passed straight through -
# stderr to this script's own stderr, and the exit code as this script's own
# exit code - so the live Claude Code runtime acting on this hook sees
# exactly what board-subagent-stop.sh itself would have produced.
set -u

SCRATCH="${1:-}"
MODE="${2:-capture}"

if [ -z "$SCRATCH" ] || [ ! -d "$SCRATCH/logs" ]; then
  echo "capture-stop.sh: usage: capture-stop.sh <scratch> <capture|hook>; <scratch>/logs must already exist" >&2
  exit 0
fi

PAYLOAD="$(cat)"

AGENT_ID="unknown"
if command -v jq >/dev/null 2>&1; then
  AGENT_ID="$(printf '%s' "$PAYLOAD" | jq -r '.agent_id // "unknown"' 2>/dev/null)"
  [ -n "$AGENT_ID" ] || AGENT_ID="unknown"
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOGFILE="$SCRATCH/logs/stop-${AGENT_ID}-${STAMP}.json"
printf '%s' "$PAYLOAD" > "$LOGFILE"

if command -v jq >/dev/null 2>&1; then
  TRANSCRIPT_PATH="$(printf '%s' "$PAYLOAD" | jq -r '.agent_transcript_path // ""' 2>/dev/null)"
  if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
    cp "$TRANSCRIPT_PATH" "$SCRATCH/logs/transcript-${AGENT_ID}-${STAMP}.jsonl" 2>/dev/null || true
  fi
fi

if [ "$MODE" != "hook" ]; then
  exit 0
fi

HOOK_UNDER_TEST_FILE="$SCRATCH/hook-under-test"
if [ ! -f "$HOOK_UNDER_TEST_FILE" ]; then
  echo "capture-stop.sh: hook mode requested but $HOOK_UNDER_TEST_FILE does not exist; skipping the hook call" >&2
  exit 0
fi
HOOK_PATH="$(cat "$HOOK_UNDER_TEST_FILE")"
if [ ! -x "$HOOK_PATH" ]; then
  echo "capture-stop.sh: hook-under-test $HOOK_PATH is not executable; skipping the hook call" >&2
  exit 0
fi

STATE_DIR="$SCRATCH/state"
mkdir -p "$STATE_DIR"
HOOK_STDERR="$SCRATCH/logs/hook-stderr-${AGENT_ID}-${STAMP}.txt"
HOOK_EXIT_FILE="$SCRATCH/logs/hook-exit-${AGENT_ID}-${STAMP}.txt"

set +e
printf '%s' "$PAYLOAD" \
  | CODER_FLEET_STATE_DIR="$STATE_DIR" BOARD_LOG_FILE="$STATE_DIR/board.log" "$HOOK_PATH" \
  2> "$HOOK_STDERR"
HOOK_EXIT=$?
set -e 2>/dev/null || true

echo "$HOOK_EXIT" > "$HOOK_EXIT_FILE"
if [ -s "$HOOK_STDERR" ]; then
  cat "$HOOK_STDERR" >&2
fi

exit "$HOOK_EXIT"
