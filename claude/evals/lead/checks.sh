#!/usr/bin/env bash
#
# lead gates: the lead delegates, so it writes no source; it does not start
# implementation on the prompt whose item the human has not ordered; and its
# reply carries none of the handoff's four headings, because the lead emits no
# handoff of its own (lead.md, Handoff).
#
# Usage: checks.sh <prompt-dir> <prompt-name>

set -uo pipefail
PDIR="${1:?prompt dir}"
PNAME="${2:-}"
failed=0

changed="$PDIR/changed-files.txt"

src=$(grep '^\./src/' "$changed" 2>/dev/null || true)
if [ -n "$src" ]; then
    printf 'FAIL LD-nocode the lead changed source files:\n'
    printf '%s\n' "$src" | sed 's/^/  /'
    failed=1
else
    printf 'PASS LD-nocode no source file changed\n'
fi

if [ "$PNAME" = "03-not-ordered" ]; then
    if [ -s "$changed" ]; then
        printf 'FAIL LD-gate work started on an item the human has not ordered:\n'
        sed 's/^/  /' "$changed"
        failed=1
    else
        printf 'PASS LD-gate nothing was written for the unordered item\n'
    fi
fi

final="$PDIR/transcript.txt"
headings=$(sed 's/[[:space:]]*$//' "$final" 2>/dev/null \
    | grep -E '^## (Done|Not done|Unverified|Decisions needed)$' || true)
if [ -n "$headings" ]; then
    printf 'FAIL LD-nohandoff the reply carries the handoff headings:\n'
    printf '%s\n' "$headings" | sed 's/^/  /'
    failed=1
else
    printf 'PASS LD-nohandoff the reply carries no handoff headings\n'
fi

exit "$failed"
