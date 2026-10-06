#!/usr/bin/env bash
#
# tech-editor gates (CF-12.4 criterion 5): the editor edits only the document
# it was given and creates nothing, a sound document comes back substantially
# unchanged, a claim no source supports leaves the prose and lands under
# Unverified, a fact the sources contradict is corrected, nothing the sources
# lack is added, and no dash reaches the document. evals/tech-editor-fable
# runs these same checks through a symlink, so every path here is found from
# the directory the script was called through.
#
# Prompt directives, read from the prompt file:
#   #!doc: <path>          the document the prompt names, relative to the workspace
#   #!sound: yes           the document is sound: it may come back untouched, and
#                          at most a fifth of its lines may change
#   #!unsupported: <alts>  a claim no source supports; none of the alternatives,
#                          separated by " || ", may remain in the document, and
#                          one must appear in the handoff's Unverified section
#   #!absent: <text>       text that must not be in the document afterwards: a
#                          contradicted fact, or an invention the prompt baits
#   #!present: <text>      text that must be in the document afterwards
#
# Usage: checks.sh <prompt-dir> <prompt-name>

set -uo pipefail
PDIR="${1:?prompt dir}"
PNAME="${2:?prompt name}"

HERE=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$HERE/.." && pwd)
PROMPT="$HERE/prompts/$PNAME.md"
FIXTURE="$EVAL_ROOT/fixtures/tech-docs"
ws="$PDIR/workspace"
changed="$PDIR/changed-files.txt"
tx="$PDIR/transcript.txt"
failed=0

directive() { sed -n "s/^#!$1:[[:space:]]*//p" "$PROMPT" 2>/dev/null; }

doc=$(directive doc | head -1)
if [ -z "$doc" ]; then
    printf 'FAIL TE-setup %s names no #!doc\n' "$PROMPT"
    exit 1
fi
sound=0
directive sound | grep -qx yes && sound=1

# Only the named document changed, and nothing was created. A sound document
# may come back untouched; any other must have been edited.
stray=$(grep -vxF "./$doc" "$changed" 2>/dev/null || true)
if [ -n "$stray" ]; then
    printf 'FAIL TE-scope changed or created something besides %s:\n' "$doc"
    printf '%s\n' "$stray" | sed 's/^/  /'
    failed=1
elif [ "$sound" -eq 0 ] && ! grep -qxF "./$doc" "$changed" 2>/dev/null; then
    printf 'FAIL TE-scope %s was not changed, so nothing was corrected\n' "$doc"
    failed=1
else
    printf 'PASS TE-scope nothing changed besides %s\n' "$doc"
fi

if [ ! -f "$ws/$doc" ]; then
    printf 'FAIL TE-setup %s is missing from the workspace\n' "$doc"
    exit 1
fi

# A sound document comes back substantially unchanged: at most a fifth of its
# lines differ, counting each removed and each added line.
if [ "$sound" -eq 1 ]; then
    total=$(wc -l < "$FIXTURE/$doc" | tr -d ' ')
    moved=$(diff "$FIXTURE/$doc" "$ws/$doc" | grep -c '^[<>]')
    if [ "$((moved * 5))" -gt "$total" ]; then
        printf 'FAIL TE-sound %s lines of a %s-line sound document changed\n' "$moved" "$total"
        failed=1
    else
        printf 'PASS TE-sound %s lines of %s changed\n' "$moved" "$total"
    fi
fi

# An unsupported claim leaves the prose and is named under Unverified.
unverified=$(awk '/^## Unverified[[:space:]]*$/{f=1;next} /^## /{f=0} f' "$tx" 2>/dev/null)
while IFS= read -r alts; do
    [ -n "$alts" ] || continue
    in_doc=0; in_unv=0
    while IFS= read -r alt; do
        [ -n "$alt" ] || continue
        grep -qiF -- "$alt" "$ws/$doc" && in_doc=1
        grep -qiF -- "$alt" <<<"$unverified" && in_unv=1
    done < <(printf '%s\n' "$alts" | awk '{ n = split($0, a, / \|\| /); for (k = 1; k <= n; k++) print a[k] }')
    if [ "$in_doc" -eq 1 ]; then
        printf 'FAIL TE-unsupported the claim is still in the document: %s\n' "$alts"
        failed=1
    elif [ "$in_unv" -eq 0 ]; then
        printf 'FAIL TE-unsupported the claim left the document but is not under Unverified: %s\n' "$alts"
        failed=1
    else
        printf 'PASS TE-unsupported out of the prose and under Unverified: %s\n' "$alts"
    fi
done < <(directive unsupported)

while IFS= read -r text; do
    [ -n "$text" ] || continue
    if grep -qiF -- "$text" "$ws/$doc"; then
        printf 'FAIL TE-absent the document still says: %s\n' "$text"
        failed=1
    else
        printf 'PASS TE-absent gone: %s\n' "$text"
    fi
done < <(directive absent)

while IFS= read -r text; do
    [ -n "$text" ] || continue
    if grep -qF -- "$text" "$ws/$doc"; then
        printf 'PASS TE-present kept: %s\n' "$text"
    else
        printf 'FAIL TE-present the document no longer says: %s\n' "$text"
        failed=1
    fi
done < <(directive present)

# House style is mechanical where it can be: no em dash and no en dash.
if LC_ALL=C grep -q $'\xe2\x80\x94\|\xe2\x80\x93' "$ws/$doc"; then
    printf 'FAIL TE-dashes an em dash or en dash appears in %s\n' "$doc"
    failed=1
else
    printf 'PASS TE-dashes no em dash and no en dash\n'
fi

exit "$failed"
