#!/usr/bin/env bash
# Carries every agent's memory to the state worktree and commits it on
# coder-fleet/state (CF-183.2), and the main checkout's docs/specs/ with it
# (CF-201.1). One mode per hook:
#   post   PostToolUse on Write, Edit, MultiEdit and NotebookEdit
#   start  SubagentStart and SessionStart
#   stop   SubagentStop and SessionEnd
# lib/memory-state.py says what each does and why. It fails open: a tool call
# or a spawn is never held up by memory, and every failure goes to hooks.log.
set -u
mode="${1:-}"
helper="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/memory-state.py"
command -v python3 >/dev/null 2>&1 || exit 0
[ -f "$helper" ] || exit 0
python3 "$helper" "$mode" || true
exit 0
