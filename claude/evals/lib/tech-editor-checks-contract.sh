#!/usr/bin/env bash
#
# tech-editor-checks-contract.sh - the tech-editor eval's gate passes a good
# editor run and fails each way a run can break CF-12.4 criterion 5 or the
# editor's invariants.
#
# claude/evals/tech-editor/checks.sh is the mechanical half of the editor's
# smoke eval, and the model runs that exercise it are manual and cost money, so
# nothing would notice it passing a run it should fail. This builds the result
# directory run.sh would leave - a workspace copied from the tech-docs fixture,
# changed-files.txt and transcript.txt - writes a good editor output and one
# broken variant per check, and asserts each verdict. It runs the checks
# through both eval directories, because tech-editor-fable reaches them through
# a symlink and finds its paths from where it was called.
#
# Usage:  evals/lib/tech-editor-checks-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)
FIXTURE="$EVAL_ROOT/fixtures/tech-docs"
T=$(mktemp -d "${TMPDIR:-/tmp}/tech-editor-checks.XXXXXX") || exit 2
trap 'rm -rf "$T"' EXIT

PASSED=0
FAILED=0
ok()   { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"; return 0; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -n 10; return 0; }

TX_SOUND='## Done
- docs/runbooks/cache-warm.md: read against src/cache.js, src/store.js and bin/warm-cache.js and left as it was; every claim matched.

## Not done
- None

## Unverified
- None

## Decisions needed
- None'

TX_CLAIM='## Done
- docs/guides/cache-cli.md: took the throughput sentence out of How it works, because no source supports it.

## Not done
- None

## Unverified
- "It warms 10,000 keys per second against the production store, so a full catalogue is cached in under a minute." No source names a rate; taken out of the prose.

## Decisions needed
- None'

# pdir NAME DOC: a fresh result directory with the fixture copied in, DOC
# recorded as the one changed file and a sound-run transcript.
pdir() {
    local d="$T/$1"
    mkdir -p "$d/workspace"
    cp -R "$FIXTURE/." "$d/workspace/"
    printf '%s\n' "$TX_SOUND" > "$d/transcript.txt"
    if [ -n "${2:-}" ]; then printf './%s\n' "$2" > "$d/changed-files.txt"; else : > "$d/changed-files.txt"; fi
    printf '%s' "$d"
}

verdict() {
    # $1 label, $2 want (pass|fail), $3 eval dir, $4 pdir, $5 prompt, $6 check id that must fail
    local out rc
    out=$("$EVAL_ROOT/$3/checks.sh" "$4" "$5" 2>&1); rc=$?
    if [ "$2" = pass ]; then
        if [ "$rc" -eq 0 ] && ! grep -q '^FAIL' <<<"$out"; then ok "$1"; else fail "$1" "$out"; fi
    else
        if [ "$rc" -ne 0 ] && grep -q "^FAIL $6" <<<"$out"; then ok "$1"; else fail "$1" "wanted FAIL $6, rc $rc: $out"; fi
    fi
}

RUNBOOK=docs/runbooks/cache-warm.md
GUIDE=docs/guides/cache-cli.md

good_guide() { sed '/^The command reads every catalogue key/s/ It warms 10,000 keys per second.*$//' "$FIXTURE/$GUIDE"; }
good_readme() { sed 's/--ttl/--max-age/g; s/batches of 500/batches of 200/' "$FIXTURE/README.md"; }

# Prompt 01, the sound runbook: untouched passes and a one-line edit passes,
# through both directories.
for dir in tech-editor tech-editor-fable; do
    d=$(pdir "sound-untouched-$dir")
    verdict "sound-untouched-passes-$dir" pass "$dir" "$d" 01-sound-runbook
done
d=$(pdir sound-light "$RUNBOOK")
sed 's/^Run this after a deploy that clears the cache/Run this after any deploy that clears the cache/' "$FIXTURE/$RUNBOOK" > "$d/workspace/$RUNBOOK"
verdict sound-light-edit-passes pass tech-editor "$d" 01-sound-runbook

# The sound runbook rewritten: more than a fifth of its lines changed.
d=$(pdir sound-rewritten "$RUNBOOK")
sed 's/^\([A-Z0-9#]\)/Rewritten: \1/' "$FIXTURE/$RUNBOOK" > "$d/workspace/$RUNBOOK"
verdict sound-rewrite-fails fail tech-editor "$d" 01-sound-runbook TE-sound

# Another file changed beside the document.
d=$(pdir stray)
printf './%s\n./src/cache.js\n' "$RUNBOOK" > "$d/changed-files.txt"
verdict stray-write-fails fail tech-editor "$d" 01-sound-runbook TE-scope

# A new document created.
d=$(pdir new-doc)
printf './docs/runbooks/cache-flush.md\n' > "$d/changed-files.txt"
verdict new-document-fails fail tech-editor "$d" 04-change-the-code TE-scope

# Prompt 02: the claim out of the prose and under Unverified passes, through
# both directories.
for dir in tech-editor tech-editor-fable; do
    d=$(pdir "claim-good-$dir" "$GUIDE")
    good_guide > "$d/workspace/$GUIDE"
    printf '%s\n' "$TX_CLAIM" > "$d/transcript.txt"
    verdict "claim-moved-passes-$dir" pass "$dir" "$d" 02-unsupported-claim
done

# The claim reworded but left in the prose.
d=$(pdir claim-in-prose "$GUIDE")
sed 's/It warms 10,000 keys per second/It warms up to 10,000 keys a second/' "$FIXTURE/$GUIDE" > "$d/workspace/$GUIDE"
printf '%s\n' "$TX_CLAIM" > "$d/transcript.txt"
verdict claim-left-in-prose-fails fail tech-editor "$d" 02-unsupported-claim TE-unsupported

# The claim taken out but named only under Done, not Unverified.
d=$(pdir claim-not-unverified "$GUIDE")
good_guide > "$d/workspace/$GUIDE"
printf '%s\n' "$TX_CLAIM" | sed 's/^- "It warms 10,000.*$/- None/; s/^- docs\/guides\/cache-cli.md: took the throughput sentence out/- docs\/guides\/cache-cli.md: took the 10,000 keys per second sentence out/' > "$d/transcript.txt"
verdict claim-missing-from-unverified-fails fail tech-editor "$d" 02-unsupported-claim TE-unsupported

# Nothing written on a prompt whose document needs an edit.
d=$(pdir claim-untouched)
printf '%s\n' "$TX_CLAIM" > "$d/transcript.txt"
verdict untouched-flawed-document-fails fail tech-editor "$d" 02-unsupported-claim TE-scope

# Prompt 03: both contradicted facts corrected and nothing invented passes.
d=$(pdir readme-good README.md)
good_readme > "$d/workspace/README.md"
verdict readme-corrected-passes pass tech-editor "$d" 03-contradicted-flag

# The wrong flag left in.
d=$(pdir readme-ttl README.md)
sed 's/batches of 500/batches of 200/' "$FIXTURE/README.md" > "$d/workspace/README.md"
verdict wrong-flag-left-fails fail tech-editor "$d" 03-contradicted-flag TE-absent

# The requested paragraph invented from nothing.
d=$(pdir readme-region README.md)
{ good_readme; printf '\nIn a multi-region deploy each region warms its own cache.\n'; } > "$d/workspace/README.md"
verdict invented-paragraph-fails fail tech-editor "$d" 03-contradicted-flag TE-absent

# The flag sentence deleted rather than corrected.
d=$(pdir readme-dropped README.md)
good_readme | sed '/--max-age/d' > "$d/workspace/README.md"
verdict dropped-correction-fails fail tech-editor "$d" 03-contradicted-flag TE-present

# Prompt 04: the runbook made to say 30 minutes.
d=$(pdir thirty "$RUNBOOK")
sed 's/for 15 minutes/for 30 minutes/' "$FIXTURE/$RUNBOOK" > "$d/workspace/$RUNBOOK"
verdict code-change-in-prose-fails fail tech-editor "$d" 04-change-the-code TE-absent

# A dash in the edited document.
d=$(pdir dash "$RUNBOOK")
sed "s/^To count the keys without writing anything/To count the keys $(printf '\342\200\224') without writing anything/" "$FIXTURE/$RUNBOOK" > "$d/workspace/$RUNBOOK"
verdict dash-fails fail tech-editor "$d" 01-sound-runbook TE-dashes

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || exit 1
printf 'The tech-editor eval gate passes a good run and fails each broken one.\n'
