#!/usr/bin/env bash
#
# spec-editor-checks-contract.sh - the spec-editor eval's gate passes a good
# editor run and fails each way a run can break CF-12.3 criteria 5 to 8.
#
# claude/evals/spec-editor/checks.sh is the mechanical half of the editor's
# smoke eval, and the model runs that exercise it are manual and cost money, so
# nothing would notice it passing a run it should fail. This builds the result
# directory run.sh would leave - a workspace copied from the spec-drafts
# fixture, changed-files.txt and transcript.txt - writes a good editor output
# and one broken variant per check, and asserts each verdict. It runs the
# checks through both eval directories, because spec-editor-fable reaches them
# through a symlink and finds its paths from where it was called.
#
# Usage:  evals/lib/spec-editor-checks-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)
FIXTURE="$EVAL_ROOT/fixtures/spec-drafts"
T=$(mktemp -d "${TMPDIR:-/tmp}/spec-editor-checks.XXXXXX") || exit 2
trap 'rm -rf "$T"' EXIT

PASSED=0
FAILED=0
ok()   { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"; return 0; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -n 10; return 0; }

GOOD_TX='## Done
- docs/specs/EX-21.md: added three challenges.
- must resolve: C1 criterion 3 cannot fail.
- should resolve: C2 the 30-day deletion is unattributed.
- note: C3 criterion 1 names no encoding.

## Not done
- None

## Unverified
- None

## Decisions needed
- None'

# pdir NAME: a fresh result directory with the fixture copied in.
pdir() {
    local d="$T/$1"
    mkdir -p "$d/workspace"
    cp -R "$FIXTURE/." "$d/workspace/"
    printf '%s\n' "$GOOD_TX" > "$d/transcript.txt"
    printf './docs/specs/EX-21.md\n' > "$d/changed-files.txt"
    printf '%s' "$d"
}

# A good editor output for prompt 01: both flaw lines marked, a third line
# marked for a note, and the section appended at the end, every challenge open.
good_ex21() {
    awk '
        /^3\. Exported timestamps/ { print $0 " [challenge C1]"; next }
        /^- Exported files are deleted after 30 days\./ { print $0 " [challenge C2]"; next }
        /^1\. `npm run export-sessions`/ { print $0 " [challenge C3]"; next }
        { print }
    ' "$FIXTURE/docs/specs/EX-21.md"
    printf '\n## Challenges (spec-editor)\n\n'
    printf '%s\n' \
        '- C1 [must resolve] [open] Criterion 3 cannot fail: every timestamp is in some time zone.' \
        "- C2 [should resolve] [open] The 30-day deletion carries no attribution, unlike the other decisions." \
        '- C3 [note] [open] Criterion 1 names no file encoding.'
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

# The good run passes, through both directories.
for dir in spec-editor spec-editor-fable; do
    d=$(pdir "good-$dir")
    good_ex21 > "$d/workspace/docs/specs/EX-21.md"
    verdict "good-run-passes-$dir" pass "$dir" "$d" 01-cannot-fail-and-guess
done

# Prose rewritten: one word of a decision line changed.
d=$(pdir prose)
good_ex21 | sed 's/support can answer/support could answer/' > "$d/workspace/docs/specs/EX-21.md"
verdict prose-change-fails fail spec-editor "$d" 01-cannot-fail-and-guess SE-notation

# A challenge written as already resolved.
d=$(pdir resolved)
good_ex21 | sed 's/^- C3 \[note\] \[open\]/- C3 [note] [resolved]/' > "$d/workspace/docs/specs/EX-21.md"
verdict resolved-challenge-fails fail spec-editor "$d" 01-cannot-fail-and-guess SE-notation

# A marker naming a challenge that is not in the section.
d=$(pdir dangling)
good_ex21 | sed 's/\[challenge C3\]/[challenge C9]/' > "$d/workspace/docs/specs/EX-21.md"
verdict dangling-marker-fails fail spec-editor "$d" 01-cannot-fail-and-guess SE-notation

# A planted flaw left unmarked.
d=$(pdir unmarked)
good_ex21 | sed 's/after 30 days\. \[challenge C2\]/after 30 days./' > "$d/workspace/docs/specs/EX-21.md"
verdict unmarked-flaw-fails fail spec-editor "$d" 01-cannot-fail-and-guess SE-flaw

# Rubric SE01b accepts the guess challenged at criterion 4 instead of at the
# decision line, so the gate does too.
d=$(pdir flaw-alternative)
good_ex21 | sed 's/after 30 days\. \[challenge C2\]/after 30 days./; s/^4\. An export file older than 30 days is deleted the next time the command runs\.$/& [challenge C2]/' > "$d/workspace/docs/specs/EX-21.md"
verdict flaw-alternative-line-passes pass spec-editor "$d" 01-cannot-fail-and-guess

# Another file changed beside the draft.
d=$(pdir stray)
good_ex21 > "$d/workspace/docs/specs/EX-21.md"
printf './docs/specs/EX-21.md\n./src/session.js\n' > "$d/changed-files.txt"
verdict stray-write-fails fail spec-editor "$d" 01-cannot-fail-and-guess SE-scope

# Nothing written at all.
d=$(pdir untouched)
: > "$d/changed-files.txt"
verdict untouched-draft-fails fail spec-editor "$d" 01-cannot-fail-and-guess SE-scope

# A challenge raised as a Blocker.
d=$(pdir blocker)
good_ex21 > "$d/workspace/docs/specs/EX-21.md"
printf '%s\n' "$GOOD_TX" | sed '$s/^- None$/- Blocker: C1 criterion 3 cannot fail; the human must rewrite it?/' > "$d/transcript.txt"
verdict blocker-fails fail spec-editor "$d" 01-cannot-fail-and-guess SE-no-blocker

# The sound draft: one note passes, a must-resolve fails.
d=$(pdir sound-ok)
printf './docs/specs/EX-24.md\n' > "$d/changed-files.txt"
{ cat "$FIXTURE/docs/specs/EX-24.md"; printf '\n## Challenges (spec-editor)\n\n- C1 [note] [open] Criterion 5 could name the test file.\n'; } > "$d/workspace/docs/specs/EX-24.md"
verdict sound-draft-note-passes pass spec-editor "$d" 04-sound-draft
d=$(pdir sound-empty)
printf './docs/specs/EX-24.md\n' > "$d/changed-files.txt"
{ cat "$FIXTURE/docs/specs/EX-24.md"; printf '\n## Challenges (spec-editor)\n'; } > "$d/workspace/docs/specs/EX-24.md"
verdict sound-draft-empty-section-passes pass spec-editor "$d" 04-sound-draft
d=$(pdir sound-bad)
printf './docs/specs/EX-24.md\n' > "$d/changed-files.txt"
{ cat "$FIXTURE/docs/specs/EX-24.md"; printf '\n## Challenges (spec-editor)\n\n- C1 [must resolve] [open] Criterion 5 could name the test file.\n'; } > "$d/workspace/docs/specs/EX-24.md"
verdict sound-draft-must-resolve-fails fail spec-editor "$d" 04-sound-draft SE-sound

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || exit 1
printf 'The spec-editor eval gate passes a good run and fails each broken one.\n'
