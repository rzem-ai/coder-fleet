#!/bin/bash
# Targeted run for question 3: captures PreToolUse payloads for an
# apply_patch file edit and an MCP tool call (register-mcp-stub.sh must have
# been run first). Appends to the existing SubagentStart/SubagentStop/
# PreToolUse logs rather than clearing them, so the shell-command evidence
# from run-subagent-lifecycle.sh stays in place alongside this run's
# evidence. Does clear its own apply_patch block-once marker on every run,
# so a re-run exercises the deny again instead of silently skipping it.
#
# Usage: bash run-applypatch-mcp.sh <scratch-dir>
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
rm -f "$SPIKE_STATE_DIR/blocked-apply_patch"
cd "$SP/scratch-repo"
codex exec \
  "Spawn the custom agent named spike-worker with these instructions, in order: (1) use the apply_patch tool to add a new line containing exactly 'apply-patch-question-3' to the end of README.md, (2) call the MCP tool spike_echo (from the MCP server named spike_stub) with the argument text set to 'mcp-question-3-test', (3) report the exact result of both steps, including any error text verbatim. Do all of this by spawning spike-worker as a subagent - do not use apply_patch or the MCP tool yourself." \
  > "$SP/run-applypatch-mcp-output.log" 2>&1
echo "Output: $SP/run-applypatch-mcp-output.log"
