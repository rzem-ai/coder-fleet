#!/bin/bash
# Spawns spike-worker and asks it to write a file, to test SubagentStart and
# SubagentStop firing (questions 1, 2, 5) and PreToolUse on apply_patch or a
# shell write (question 3).
#
# Usage: bash run-subagent-lifecycle.sh <scratch-dir>
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/guard.sh
source "$HERE/lib/guard.sh"

SP="$(resolve_scratch_dir "$1")" || exit 1
require_scratch_shape "$SP" || exit 1

export CODEX_HOME="$SP/codex-home"
export SPIKE_LOG_DIR="$SP/logs"
export SPIKE_STATE_DIR="$SP/state"
mkdir -p "$SPIKE_LOG_DIR" "$SPIKE_STATE_DIR"
rm -f "$SPIKE_LOG_DIR"/*.log "$SPIKE_LOG_DIR"/*.json
rm -f "$SPIKE_STATE_DIR"/blocked-*
cd "$SP/scratch-repo"
codex exec \
  "Spawn the custom agent named spike-worker with the instruction: write the text hello-from-spike-worker to a file called spike-output.txt in the repo root, then report success. Do this by spawning spike-worker as a subagent, do not write the file yourself." \
  > "$SP/run-subagent-lifecycle-output.log" 2>&1
echo "Output: $SP/run-subagent-lifecycle-output.log"
echo "Hook logs: $SP/logs"
