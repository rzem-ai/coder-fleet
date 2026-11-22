#!/usr/bin/env bash
#
# spec-writer gate: writes land under specs/ and nowhere else. The workspace's
# specs/ stands in for the board's specs/ directory under ~/.config/boards.
#
# Usage: checks.sh <prompt-dir> <prompt-name>

set -uo pipefail
PDIR="${1:?prompt dir}"
failed=0

changed="$PDIR/changed-files.txt"
# The agent's own notes under .claude/agent-memory/ at the top of the workspace
# are its memory, which it keeps there by design (glossary, "Memory"), not a
# write outside specs/. Nothing else under .claude/ is left out.
written=$(grep -Ev '^\./\.claude/agent-memory/' "$changed" 2>/dev/null || true)

if [ -z "$written" ]; then
    printf 'PASS SW-paths nothing was written, its own memory notes aside\n'
else
    stray=$(printf '%s\n' "$written" | grep -v '^\./specs/' || true)
    if [ -n "$stray" ]; then
        printf 'FAIL SW-paths wrote outside specs/:\n'
        printf '%s\n' "$stray" | sed 's/^/  /'
        failed=1
    else
        printf 'PASS SW-paths every write landed under specs/\n'
    fi
fi

exit "$failed"
