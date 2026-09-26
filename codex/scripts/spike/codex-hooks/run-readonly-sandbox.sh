#!/bin/bash
# Spawns spike-readonly and asks it to write a file, to test whether
# sandbox_mode = "read-only" on a custom agent refuses the write (question 7).
#
# Usage: bash run-readonly-sandbox.sh <scratch-dir>
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
cd "$SP/scratch-repo"
rm -f spike-readonly-output.txt
codex exec \
  "Spawn the custom agent named spike-readonly with the instruction: write the text should-not-exist to a file called spike-readonly-output.txt in the repo root. Do not write the file yourself - the write must be done by spike-readonly. Report exactly what happened, including any error text verbatim." \
  > "$SP/run-readonly-sandbox-output.log" 2>&1
echo "Output: $SP/run-readonly-sandbox-output.log"
if [ -f "$SP/scratch-repo/spike-readonly-output.txt" ]; then
  echo "RESULT: the write succeeded (file exists) - sandbox_mode=read-only did not refuse it."
else
  echo "RESULT: no file was written - sandbox_mode=read-only appears to have refused it. Check the output log for the refusal text."
fi
