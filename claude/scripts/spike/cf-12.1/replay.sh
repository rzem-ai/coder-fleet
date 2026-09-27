#!/bin/bash
# Feeds every captured stop-*.json payload (from a "hook" or "capture" mode
# run) into a given hook version offline, and prints its exit code and log
# line. Free and re-runnable after any hook change - nothing here calls
# claude or touches a real board.
#
# Usage: bash replay.sh <scratch> <absolute hook path>
#
# With no captured payloads yet, run in "self-check" mode against three
# synthetic payloads instead (see docs/plans/CF-12.1.md's "Free evidence"):
#   a valid handoff (expect exit 0); a message present without the headings
#   (expect exit 2); message absent with a transcript whose last block is a
#   tool_use (expect exit 0, "cannot tell").
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

SP="$(resolve_scratch_dir "${1:-}")" || exit 1
HOOK="${2:-}"
if [ -z "$HOOK" ] || [ ! -x "$HOOK" ]; then
  echo "usage: bash replay.sh <scratch> <absolute hook path>; hook must exist and be executable" >&2
  exit 1
fi

STATE_DIR="$SP/replay-state"
rm -rf "$STATE_DIR"
mkdir -p "$STATE_DIR"

replay_one() {
  local label="$1" payload_file="$2"
  local stderr_file="$STATE_DIR/${label}.stderr"
  set +e
  CODER_FLEET_STATE_DIR="$STATE_DIR" BOARD_LOG_FILE="$STATE_DIR/board.log" "$HOOK" < "$payload_file" > /dev/null 2> "$stderr_file"
  local rc=$?
  set -e 2>/dev/null || true
  echo "$label: exit $rc"
  if [ -f "$STATE_DIR/board.log" ]; then
    tail -n 1 "$STATE_DIR/board.log" | sed "s/^/  log: /"
    : > "$STATE_DIR/board.log"
  fi
  if [ -s "$stderr_file" ]; then
    sed 's/^/  stderr: /' "$stderr_file" | head -n 3
  fi
}

if compgen -G "$SP/logs/stop-*.json" > /dev/null 2>&1; then
  echo "Replaying captured payloads under $SP/logs against $HOOK"
  for f in "$SP"/logs/stop-*.json; do
    replay_one "$(basename "$f" .json)" "$f"
  done
else
  echo "No captured payloads under $SP/logs yet; replaying three synthetic payloads instead"

  VALID="$STATE_DIR/synthetic-valid-handoff.json"
  cat > "$VALID" <<'JSON'
{"session_id":"s1","agent_id":"a1","agent_type":"scout","cwd":"/tmp","last_assistant_message":"## Done\n- did the thing\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n","agent_transcript_path":""}
JSON
  replay_one "synthetic-valid-handoff (expect exit 0)" "$VALID"

  NOHEADINGS="$STATE_DIR/synthetic-no-headings.json"
  cat > "$NOHEADINGS" <<'JSON'
{"session_id":"s2","agent_id":"a2","agent_type":"scout","cwd":"/tmp","last_assistant_message":"I looked at the file and it seems fine.","agent_transcript_path":""}
JSON
  replay_one "synthetic-no-headings (expect exit 2)" "$NOHEADINGS"

  ABSENT_TRANSCRIPT="$STATE_DIR/synthetic-absent-transcript.jsonl"
  cat > "$ABSENT_TRANSCRIPT" <<'JSONL'
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/tmp/f1.txt"}}]}}
JSONL
  ABSENT="$STATE_DIR/synthetic-absent.json"
  python3 - "$ABSENT_TRANSCRIPT" > "$ABSENT" <<'PY'
import json, sys
transcript_path = sys.argv[1]
payload = {
    "session_id": "s3",
    "agent_id": "a3",
    "agent_type": "scout",
    "cwd": "/tmp",
    "agent_transcript_path": transcript_path,
}
print(json.dumps(payload))
PY
  replay_one "synthetic-absent-message-tool-use-last (expect exit 0, cannot tell)" "$ABSENT"
fi
