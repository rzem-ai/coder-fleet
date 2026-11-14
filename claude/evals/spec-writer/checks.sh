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

if [ ! -s "$changed" ]; then
    printf 'PASS SW-paths nothing was written\n'
else
    stray=$(grep -v '^\./specs/' "$changed" || true)
    if [ -n "$stray" ]; then
        printf 'FAIL SW-paths wrote outside specs/:\n'
        printf '%s\n' "$stray" | sed 's/^/  /'
        failed=1
    else
        printf 'PASS SW-paths every write landed under specs/\n'
    fi
fi

exit "$failed"
