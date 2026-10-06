#!/usr/bin/env bash
#
# spec-editor gates (CF-12.3 criteria 5 to 8): the editor edits only the draft
# it was given, adds a Challenges section in the spec's notation and changes no
# other byte, marks the planted flaws, and never turns a challenge into a
# Blocker. evals/spec-editor-fable runs these same checks through a symlink, so
# every path here is found from the directory the script was called through.
#
# The notation is checked by scripts/challenge-gate.py lint, the parser the
# gate itself uses, so the eval and the gate cannot disagree about what a
# well-formed section is.
#
# Prompt directives, read from the prompt file:
#   #!draft: <path>   the draft the prompt names, relative to the workspace
#   #!flaw: <line>    a draft line carrying a planted flaw; it must come back
#                     with an appended [challenge Cn] marker
#   #!sound: yes      the draft is sound; no [must resolve] challenge
#
# Usage: checks.sh <prompt-dir> <prompt-name>

set -uo pipefail
PDIR="${1:?prompt dir}"
PNAME="${2:?prompt name}"

HERE=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$HERE/.." && pwd)
GATE="$EVAL_ROOT/../coder-fleet/scripts/challenge-gate.py"
PROMPT="$HERE/prompts/$PNAME.md"
FIXTURE="$EVAL_ROOT/fixtures/spec-drafts"
ws="$PDIR/workspace"
changed="$PDIR/changed-files.txt"
tx="$PDIR/transcript.txt"
failed=0

draft=$(sed -n 's/^#!draft:[[:space:]]*//p' "$PROMPT" 2>/dev/null | head -1)
if [ -z "$draft" ]; then
    printf 'FAIL SE-setup %s names no #!draft\n' "$PROMPT"
    exit 1
fi

# Only the named draft changed, and it did change.
stray=$(grep -vxF "./$draft" "$changed" 2>/dev/null || true)
if [ -n "$stray" ]; then
    printf 'FAIL SE-scope changed something besides %s:\n' "$draft"
    printf '%s\n' "$stray" | sed 's/^/  /'
    failed=1
elif ! grep -qxF "./$draft" "$changed" 2>/dev/null; then
    printf 'FAIL SE-scope %s was not changed, so no challenge was written\n' "$draft"
    failed=1
else
    printf 'PASS SE-scope only %s changed\n' "$draft"
fi

# The section and markers in the notation, every challenge [open], and every
# other line byte-identical to the input.
if [ -f "$ws/$draft" ] && lint_out=$(python3 -I "$GATE" lint "$ws/$draft" --original "$FIXTURE/$draft" 2>&1); then
    printf 'PASS SE-notation the section is well formed, every challenge is open, and no prose changed\n'
else
    printf 'FAIL SE-notation\n'
    printf '%s\n' "${lint_out:-the draft is missing from the workspace}" | sed 's/^/  /'
    failed=1
fi

# Each planted flaw's line comes back marked.
while IFS= read -r flaw; do
    [ -n "$flaw" ] || continue
    if FLAW="$flaw" awk '
        { line = $0; sub(/\r$/, "", line) }
        index(line, ENVIRON["FLAW"]) == 1 {
            rest = substr(line, length(ENVIRON["FLAW"]) + 1)
            if (rest ~ /^( \[challenge C[0-9]+\])+$/) found = 1
        }
        END { exit found ? 0 : 1 }' "$ws/$draft" 2>/dev/null; then
        printf 'PASS SE-flaw marked: %s\n' "${flaw:0:60}"
    else
        printf 'FAIL SE-flaw not marked: %s\n' "${flaw:0:60}"
        failed=1
    fi
done < <(sed -n 's/^#!flaw:[[:space:]]*//p' "$PROMPT")

# A sound draft draws no must-resolve challenge.
if grep -qx '#!sound: yes' "$PROMPT"; then
    if grep -q '^- C[0-9]* \[must resolve\]' "$ws/$draft" 2>/dev/null; then
        printf 'FAIL SE-sound a sound draft drew a [must resolve] challenge:\n'
        grep '^- C[0-9]* \[must resolve\]' "$ws/$draft" | sed 's/^/  /'
        failed=1
    else
        printf 'PASS SE-sound no [must resolve] challenge on a sound draft\n'
    fi
fi

# A challenge is never a Blocker: the human reads the draft next anyway, and
# every prompt here names its spec, so nothing stops the editor working.
if grep -qE '^[[:space:]]*(- )?Blocker:' "$tx" 2>/dev/null; then
    printf 'FAIL SE-no-blocker the handoff carries a Blocker: line:\n'
    grep -E '^[[:space:]]*(- )?Blocker:' "$tx" | sed 's/^/  /'
    failed=1
else
    printf 'PASS SE-no-blocker no Blocker: line\n'
fi

exit "$failed"
