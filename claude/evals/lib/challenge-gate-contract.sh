#!/usr/bin/env bash
#
# challenge-gate-contract.sh - scripts/challenge-gate.py, the one gate that
# lead.md step 3 and spec-to-card's card stage both run (CF-12 spec Q14, Q18 to
# Q21, "The challenge notation").
#
# Four parts, each against the real script:
#
#   check   the verdict on fixture specs and AGENTS.md records. These run with a
#           git on PATH that records any call and fails, and the run checks it
#           was never called: the gate reads no git history (Q19), which is what
#           lets it pass in a shallow clone or a cloud session.
#   close   the closed spec, compared byte for byte with a hand-written expected
#           file, so "every other line is byte-identical" is a cmp, not a grep.
#   lint    the notation check the spec-editor eval's checks.sh runs over an
#           editor's output, so the eval and the gate share one parser.
#   run     the close as commits, in throwaway repositories under this test's
#           own temporary directory, never in this checkout.
#
# Usage:  claude/evals/lib/challenge-gate-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
GATE="$PLUGIN_ROOT/scripts/challenge-gate.py"

command -v python3 >/dev/null 2>&1 || { printf 'challenge-gate-contract: python3 is needed\n' >&2; exit 2; }
REAL_GIT=$(command -v git) || { printf 'challenge-gate-contract: git is needed for the run cases\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/challenge-gate-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
trap 'rm -rf "$TMP"' EXIT

# A caller's git environment or user config must not leak into the fixtures.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

PASSED=0
FAILED=0

ok() {
    PASSED=$((PASSED + 1))
    [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"
    return 0
}
bad() {
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n' "$1"
    [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -n 12
    return 0
}
section() { [ "$VERBOSE" -eq 1 ] && printf '\n%s\n' "$1"; return 0; }

# A git that records being called and fails, for every check case.
NOGIT="$TMP/nogit"
mkdir -p "$NOGIT"
GIT_CALLED="$TMP/git-was-called"
printf '#!/bin/sh\necho "$@" >> "%s"\nexit 97\n' "$GIT_CALLED" > "$NOGIT/git"
chmod +x "$NOGIT/git"

OUT="$TMP/out"
RC=0
gate_check() {
    # $1 spec file, $2 AGENTS.md (may not exist). Sets RC, writes $OUT.
    PATH="$NOGIT:$PATH" python3 -I "$GATE" check "$1" --agents "$2" > "$OUT" 2>&1
    RC=$?
}
field() { # $1 key: the value of the first "<key>\t<value>" line of $OUT
    awk -F'\t' -v k="$1" '$1 == k { sub(/^[^\t]*\t/, ""); print; exit }' "$OUT"
}

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

F="$TMP/fx"
mkdir -p "$F"
printf '# Agent rules\n\nSpec editor: opus\n' > "$F/agents-opus.md"
printf '# Agent rules\n\nSpec editor: fable\n' > "$F/agents-fable.md"
printf '# Agent rules\n\nSpec editor: neither\n' > "$F/agents-neither.md"
printf '# Agent rules\n\nNothing about editors here.\n' > "$F/agents-none.md"
printf '# Agent rules\n\nSpec editor: sonnet\n' > "$F/agents-typo.md"
printf '# Agent rules\n\nSpec editor: <opus|fable|neither>\n' > "$F/agents-placeholder.md"

# spec STATE1 [EXTRA_CHALLENGE_LINE]: the spec with an intact section, C1's
# state tag replaced by STATE1 (empty deletes it) and an optional fourth line.
spec() {
    local state="$1" extra="${2:-}" c1
    if [ -n "$state" ]; then c1="- C1 [must resolve] $state Criterion 1 cannot fail as written."
    else c1="- C1 [must resolve] Criterion 1 cannot fail as written."; fi
    printf '%s\n' \
        '# EX-7: session refresh' \
        '' \
        'Status: approved' \
        '' \
        '## Problem' \
        '' \
        'Sessions expire mid-edit. [challenge C2]' \
        '' \
        '## Acceptance criteria' \
        '' \
        '1. The refresh token rotates on every use. [challenge C1]' \
        '2. A revoked session ends within one minute. [challenge C3] [challenge C4]' \
        '' \
        '## Challenges (spec-editor)' \
        '' \
        "$c1" \
        '- C2 [should resolve] [open] The problem names no user.' \
        '- C3 [note] [open] Consider naming the token store.'
    [ -n "$extra" ] && printf '%s\n' "$extra"
    printf '%s\n' \
        '' \
        '## Open questions' \
        '' \
        '- None.'
}

# ---------------------------------------------------------------------------
section 'check: passes (criterion 9)'
# ---------------------------------------------------------------------------

spec '[resolved]' > "$F/resolved.md"
gate_check "$F/resolved.md" "$F/agents-opus.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ] && [ "$(field reason)" = resolved ]; then ok pass-all-resolved
else bad pass-all-resolved "rc $RC: $(cat "$OUT")"; fi

spec '[struck: the hook contract already covers this]' > "$F/struck.md"
gate_check "$F/struck.md" "$F/agents-fable.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ]; then ok pass-struck-with-reason
else bad pass-struck-with-reason "rc $RC: $(cat "$OUT")"; fi

# Only should-resolve and note challenges, both still open.
spec '[open]' | grep -v '^- C1 ' > "$F/soft-only.md"
gate_check "$F/soft-only.md" "$F/agents-opus.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ]; then ok pass-only-soft-open
else bad pass-only-soft-open "rc $RC: $(cat "$OUT")"; fi

# The closed marker, and nothing else of the section.
printf '# EX-7\n\nStatus: approved\n\n## Challenges (spec-editor): closed in 3f2a9c1\n\n## Open questions\n' > "$F/closed.md"
gate_check "$F/closed.md" "$F/agents-opus.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ] && [ "$(field reason)" = closed-marker ]; then ok pass-closed-marker
else bad pass-closed-marker "rc $RC: $(cat "$OUT")"; fi

# A full 40-character sha is a closed marker too.
printf '# EX-7\n\n## Challenges (spec-editor): closed in 3f2a9c1e4b5d6a7f8091a2b3c4d5e6f708192a3b\n' > "$F/closed40.md"
gate_check "$F/closed40.md" "$F/agents-fable.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = closed-marker ]; then ok pass-closed-marker-40
else bad pass-closed-marker-40 "rc $RC: $(cat "$OUT")"; fi

printf '# EX-7\n\nStatus: approved\n\n## Acceptance criteria\n\n1. It works.\n' > "$F/plain.md"
gate_check "$F/plain.md" "$F/agents-neither.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ] && [ "$(field reason)" = neither ]; then ok pass-neither-no-section
else bad pass-neither-no-section "rc $RC: $(cat "$OUT")"; fi

# ---------------------------------------------------------------------------
section 'check: no recorded answer (criterion 10)'
# ---------------------------------------------------------------------------

gate_check "$F/plain.md" "$F/agents-none.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ] && [ "$(field reason)" = no-record ] \
    && grep -q '/kickoff' "$OUT"; then ok no-record-passes-and-suggests-kickoff
else bad no-record-passes-and-suggests-kickoff "rc $RC: $(cat "$OUT")"; fi

gate_check "$F/plain.md" "$F/does-not-exist.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = no-record ] && grep -q '/kickoff' "$OUT"; then ok no-agents-file-is-no-record
else bad no-agents-file-is-no-record "rc $RC: $(cat "$OUT")"; fi

# A template placeholder nobody filled is no answer yet, not a typo.
gate_check "$F/plain.md" "$F/agents-placeholder.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = no-record ]; then ok placeholder-is-no-record
else bad placeholder-is-no-record "rc $RC: $(cat "$OUT")"; fi

# ---------------------------------------------------------------------------
section 'check: refusals, each naming every blocking id (criterion 11)'
# ---------------------------------------------------------------------------

refuses_naming() {
    # $1 label, $2 spec, $3 agents, $4 the blocking ids wanted, space-separated
    gate_check "$2" "$3"
    if [ "$RC" -eq 1 ] && [ "$(field verdict)" = refuse ] && [ "$(field blocking)" = "$4" ]; then ok "$1"
    else bad "$1" "rc $RC, wanted blocking '$4': $(cat "$OUT")"; fi
}

spec '[struck: ]' > "$F/struck-empty.md"
refuses_naming refuse-struck-empty-reason "$F/struck-empty.md" "$F/agents-opus.md" C1

spec '[struck:]' > "$F/struck-bare.md"
refuses_naming refuse-struck-no-reason "$F/struck-bare.md" "$F/agents-opus.md" C1

spec '[open]' > "$F/open.md"
refuses_naming refuse-must-resolve-open "$F/open.md" "$F/agents-opus.md" C1

spec '[open]' '- C4 [must resolve] [open] Criterion 2 names no clock.' > "$F/open-two.md"
refuses_naming refuse-names-every-open-id "$F/open-two.md" "$F/agents-fable.md" 'C1 C4'

spec '[resolved]' '- C4 [must resolve] [open] Criterion 2 names no clock.' > "$F/one-of-two.md"
refuses_naming refuse-names-only-the-open-one "$F/one-of-two.md" "$F/agents-opus.md" C4

spec '' > "$F/state-deleted.md"
refuses_naming refuse-state-tag-deleted "$F/state-deleted.md" "$F/agents-opus.md" C1

# A resolved tag does not hide an [open] left beside it.
spec '[resolved] [open]' > "$F/both-states.md"
refuses_naming refuse-resolved-and-open "$F/both-states.md" "$F/agents-opus.md" C1

for rec in opus fable; do
    gate_check "$F/plain.md" "$F/agents-$rec.md"
    if [ "$RC" -eq 1 ] && [ "$(field verdict)" = refuse ] && [ "$(field reason)" = no-section ]; then ok "refuse-no-section-$rec"
    else bad "refuse-no-section-$rec" "rc $RC: $(cat "$OUT")"; fi
done

# The human deleted the section by hand and left the inline markers: still no
# section and no closed marker, so still a refusal.
spec '[open]' | awk '/^## Challenges \(spec-editor\)$/ { skip = 1; next } skip && /^## / { skip = 0 } !skip' > "$F/deleted.md"
if grep -q 'Challenges' "$F/deleted.md"; then bad deleted-fixture-sane "the fixture still has a section"; fi
gate_check "$F/deleted.md" "$F/agents-opus.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = no-section ]; then ok refuse-section-deleted-by-hand
else bad refuse-section-deleted-by-hand "rc $RC: $(cat "$OUT")"; fi

# Not criteria, but each is a way through the gate if it is wrong.
gate_check "$F/open.md" "$F/agents-typo.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = bad-record ]; then ok refuse-unreadable-record
else bad refuse-unreadable-record "rc $RC: $(cat "$OUT")"; fi

{ spec '[resolved]'; printf '\n## Challenges (spec-editor)\n\n- C9 [must resolve] [open] Second section.\n'; } > "$F/two-sections.md"
gate_check "$F/two-sections.md" "$F/agents-opus.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = ambiguous ]; then ok refuse-two-sections
else bad refuse-two-sections "rc $RC: $(cat "$OUT")"; fi

{ spec '[open]'; printf '\n## Challenges (spec-editor): closed in 3f2a9c1\n'; } > "$F/section-and-marker.md"
gate_check "$F/section-and-marker.md" "$F/agents-opus.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = ambiguous ]; then ok refuse-section-and-marker
else bad refuse-section-and-marker "rc $RC: $(cat "$OUT")"; fi

# A heading with something after it is not the section, and not a pass.
spec '[open]' | sed 's/^## Challenges (spec-editor)$/## Challenges (spec-editor) - draft/' > "$F/near-miss.md"
gate_check "$F/near-miss.md" "$F/agents-opus.md"
if [ "$RC" -eq 1 ] && [ "$(field verdict)" = refuse ]; then ok refuse-near-miss-heading
else bad refuse-near-miss-heading "rc $RC: $(cat "$OUT")"; fi

# A must-resolve line with no id still blocks, named by its line.
spec '[resolved]' '- [must resolve] [open] An id-less challenge.' > "$F/no-id.md"
gate_check "$F/no-id.md" "$F/agents-opus.md"
if [ "$RC" -eq 1 ] && printf '%s' "$(field blocking)" | grep -q '^line:[0-9][0-9]*$'; then ok refuse-id-less-must-resolve
else bad refuse-id-less-must-resolve "rc $RC: $(cat "$OUT")"; fi

# The heading inside a code fence is documentation, not the section.
{ cat "$F/plain.md"; printf '\n```\n## Challenges (spec-editor)\n- C1 [must resolve] [open] x\n```\n'; } > "$F/fenced.md"
gate_check "$F/fenced.md" "$F/agents-opus.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = no-section ]; then ok fenced-heading-is-not-a-section
else bad fenced-heading-is-not-a-section "rc $RC: $(cat "$OUT")"; fi

# Fix round 1, refuter survivor 3. A line that opens a fence with an info
# string, "```js", cannot close one, so a heading after it in a nested example
# is still inside the outer fence and is not the section.
{ cat "$F/plain.md"; printf '\n```markdown\nAn example of the notation:\n```js\n## Challenges (spec-editor)\n- C1 [must resolve] [resolved] x\n```\n'; } > "$F/nested-fence.md"
gate_check "$F/nested-fence.md" "$F/agents-opus.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = no-section ]; then ok nested-fence-heading-is-not-a-section
else bad nested-fence-heading-is-not-a-section "rc $RC: $(cat "$OUT")"; fi

# Fix round 1, refuter survivor 1. A closed marker's sha is 7 to 64 hex
# characters; anything else is not a marker, so the spec has no section, and
# the refusal names the challenge ids its inline markers carry.
for bad_sha in later 3f2a9c HEAD~1 3F2A9C1 "$(printf '%065d' 0)"; do
    printf '# EX-7\n\n1. A criterion. [challenge C1] [challenge C3]\n\n## Challenges (spec-editor): closed in %s\n' "$bad_sha" > "$F/bad-marker.md"
    gate_check "$F/bad-marker.md" "$F/agents-opus.md"
    if [ "$RC" -eq 1 ] && [ "$(field reason)" = no-section ] && [ "$(field blocking)" = 'C1 C3' ]; then ok "bad-sha-marker-refused-$bad_sha"
    else bad "bad-sha-marker-refused-$bad_sha" "rc $RC: $(cat "$OUT")"; fi
done

# Fix round 1, Low: a SHA-256 repository names a commit with 64 hex
# characters, and the marker the close writes there has to pass.
printf '# EX-7\n\n## Challenges (spec-editor): closed in %s\n' "$(printf 'a%.0s' $(seq 64))" > "$F/closed64.md"
gate_check "$F/closed64.md" "$F/agents-opus.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = closed-marker ]; then ok pass-closed-marker-64
else bad pass-closed-marker-64 "rc $RC: $(cat "$OUT")"; fi

# Fix round 1, refuter survivor 2. The spec says the first `Spec editor:`
# line is the record, so a later line cannot switch the gate off.
printf '# Agent rules\n\nSpec editor: opus\n\nSpec editor: neither\n' > "$F/agents-two-lines.md"
gate_check "$F/open.md" "$F/agents-two-lines.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = open ] && [ "$(field blocking)" = C1 ]; then ok first-record-line-wins
else bad first-record-line-wins "rc $RC: $(cat "$OUT")"; fi

# An empty section, a sound draft the editor found nothing in, passes.
spec '[open]' | grep -v '^- C[0-9]' > "$F/empty-section.md"
gate_check "$F/empty-section.md" "$F/agents-opus.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = resolved ]; then ok pass-empty-section
else bad pass-empty-section "rc $RC: $(cat "$OUT")"; fi

# Only meaningful once the script exists: an absent script calls no git either.
if [ ! -f "$GATE" ]; then bad check-reads-no-git "the gate script is missing"
elif [ -e "$GIT_CALLED" ]; then bad check-reads-no-git "git was called: $(cat "$GIT_CALLED")"
else ok check-reads-no-git; fi

# ---------------------------------------------------------------------------
section 'close: the closed spec (criterion 12)'
# ---------------------------------------------------------------------------

SHA=3f2a9c1e4b5d
expected_closed() {
    printf '%s\n' \
        '# EX-7: session refresh' \
        '' \
        'Status: approved' \
        '' \
        '## Problem' \
        '' \
        'Sessions expire mid-edit.' \
        '' \
        '## Acceptance criteria' \
        '' \
        '1. The refresh token rotates on every use.' \
        '2. A revoked session ends within one minute.' \
        '' \
        "## Challenges (spec-editor): closed in $SHA" \
        '' \
        '## Open questions' \
        '' \
        '- None.'
}

gate_check "$F/resolved.md" "$F/agents-opus.md"
[ "$RC" -eq 0 ] || bad close-precondition "the gate did not pass on the fixture: $(cat "$OUT")"
PATH="$NOGIT:$PATH" python3 -I "$GATE" close "$F/resolved.md" --sha "$SHA" > "$F/closed-out.md" 2> "$OUT"
RC=$?
expected_closed > "$F/closed-want.md"
if [ "$RC" -eq 0 ] && cmp -s "$F/closed-want.md" "$F/closed-out.md"; then ok close-byte-identical
else bad close-byte-identical "rc $RC: $(diff "$F/closed-want.md" "$F/closed-out.md"; cat "$OUT")"; fi
if [ "$(grep -c '^## Challenges (spec-editor): closed in ' "$F/closed-out.md")" = 1 ] \
    && ! grep -q '\[challenge C[0-9]' "$F/closed-out.md" \
    && ! grep -qE '\[(must resolve|should resolve|note)\]' "$F/closed-out.md"; then ok close-leaves-only-the-marker
else bad close-leaves-only-the-marker "$(cat "$F/closed-out.md")"; fi

# The closed spec passes the gate it was closed by.
gate_check "$F/closed-out.md" "$F/agents-opus.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = closed-marker ]; then ok closed-spec-passes
else bad closed-spec-passes "rc $RC: $(cat "$OUT")"; fi

# CRLF line endings and no final newline survive the close untouched.
# $( ) drops the final newline, which is the "no final newline" half; the
# carriage return before it stays.
printf '%s' "$(spec '[resolved]' | sed 's/$/\r/')" > "$F/crlf.md"
printf '%s' "$(expected_closed | sed 's/$/\r/')" > "$F/crlf-want.md"
PATH="$NOGIT:$PATH" python3 -I "$GATE" close "$F/crlf.md" --sha "$SHA" > "$F/crlf-out.md" 2> "$OUT"
RC=$?
if [ "$RC" -eq 0 ] && cmp -s "$F/crlf-want.md" "$F/crlf-out.md"; then ok close-keeps-crlf-and-final-line
else bad close-keeps-crlf-and-final-line "rc $RC: $(cat "$OUT")"; fi

# A section at the end of the file.
printf '# EX-8\n\n1. A criterion. [challenge C1]\n\n## Challenges (spec-editor)\n\n- C1 [must resolve] [resolved] x\n' > "$F/at-end.md"
printf '# EX-8\n\n1. A criterion.\n\n## Challenges (spec-editor): closed in %s\n' "$SHA" > "$F/at-end-want.md"
PATH="$NOGIT:$PATH" python3 -I "$GATE" close "$F/at-end.md" --sha "$SHA" > "$F/at-end-out.md" 2> "$OUT"
RC=$?
if [ "$RC" -eq 0 ] && cmp -s "$F/at-end-want.md" "$F/at-end-out.md"; then ok close-section-at-end
else bad close-section-at-end "rc $RC: $(diff "$F/at-end-want.md" "$F/at-end-out.md"; cat "$OUT")"; fi

# The close refuses a spec the gate would refuse, and a sha that is not one.
PATH="$NOGIT:$PATH" python3 -I "$GATE" close "$F/open.md" --sha "$SHA" > "$OUT" 2>&1
RC=$?
if [ "$RC" -eq 1 ] && [ "$(field verdict)" = refuse ]; then ok close-refuses-open-spec; else bad close-refuses-open-spec "rc $RC: $(cat "$OUT")"; fi
PATH="$NOGIT:$PATH" python3 -I "$GATE" close "$F/resolved.md" --sha 'HEAD' > "$OUT" 2>&1
RC=$?
if [ "$RC" -eq 2 ] && grep -q 'sha' "$OUT"; then ok close-refuses-non-sha; else bad close-refuses-non-sha "rc $RC: $(cat "$OUT")"; fi
SHA64=$(printf 'b%.0s' $(seq 64))
PATH="$NOGIT:$PATH" python3 -I "$GATE" close "$F/resolved.md" --sha "$SHA64" > "$F/closed-64-out.md" 2> "$OUT"
RC=$?
if [ "$RC" -eq 0 ] && grep -qx "## Challenges (spec-editor): closed in $SHA64" "$F/closed-64-out.md"; then ok close-accepts-sha256-id
else bad close-accepts-sha256-id "rc $RC: $(cat "$OUT")"; fi
PATH="$NOGIT:$PATH" python3 -I "$GATE" close "$F/resolved.md" --sha "${SHA64}b" > "$OUT" 2>&1
RC=$?
if [ "$RC" -eq 2 ]; then ok close-refuses-65-hex; else bad close-refuses-65-hex "rc $RC: $(cat "$OUT")"; fi

# ---------------------------------------------------------------------------
section 'lint: the notation the spec-editor eval checks'
# ---------------------------------------------------------------------------

lint() { PATH="$NOGIT:$PATH" python3 -I "$GATE" lint "$@" > "$OUT" 2>&1; RC=$?; }

# The editor's input, and two outputs: a good one and one that rewrote prose.
grep -v '\[challenge C' "$F/plain.md" > "$F/draft.md"
printf '# EX-7\n\nStatus: approved\n\n## Acceptance criteria\n\n1. It works. [challenge C1]\n\n## Challenges (spec-editor)\n\n- C1 [must resolve] [open] Criterion 1 cannot fail.\n- C2 [note] [open] A note.\n' > "$F/edited.md"
lint "$F/edited.md" --original "$F/draft.md"
if [ "$RC" -eq 0 ]; then ok lint-good-editor-output; else bad lint-good-editor-output "$(cat "$OUT")"; fi

sed 's/It works\./It works well./' "$F/edited.md" > "$F/rewrote.md"
lint "$F/rewrote.md" --original "$F/draft.md"
if [ "$RC" -eq 1 ]; then ok lint-catches-rewritten-prose; else bad lint-catches-rewritten-prose "rc $RC: $(cat "$OUT")"; fi

sed 's/\[challenge C1\]/[challenge C7]/' "$F/edited.md" > "$F/dangling.md"
lint "$F/dangling.md"
if [ "$RC" -eq 1 ] && grep -q 'C7' "$OUT"; then ok lint-catches-dangling-marker; else bad lint-catches-dangling-marker "rc $RC: $(cat "$OUT")"; fi

sed 's/^- C2 \[note\] \[open\]/- C2 [minor] [open]/' "$F/edited.md" > "$F/bad-severity.md"
lint "$F/bad-severity.md"
if [ "$RC" -eq 1 ]; then ok lint-catches-unknown-severity; else bad lint-catches-unknown-severity "rc $RC: $(cat "$OUT")"; fi

sed 's/^- C2 \[note\] \[open\]/- C2 [note]/' "$F/edited.md" > "$F/no-state.md"
lint "$F/no-state.md"
if [ "$RC" -eq 1 ]; then ok lint-catches-missing-state; else bad lint-catches-missing-state "rc $RC: $(cat "$OUT")"; fi

sed 's/^- C2 \[note\] \[open\]/- [note] [open]/' "$F/edited.md" > "$F/no-id-lint.md"
lint "$F/no-id-lint.md"
if [ "$RC" -eq 1 ]; then ok lint-catches-missing-id; else bad lint-catches-missing-id "rc $RC: $(cat "$OUT")"; fi

# A fresh editor output has every challenge [open].
sed 's/^- C2 \[note\] \[open\]/- C2 [note] [resolved]/' "$F/edited.md" > "$F/not-open.md"
lint "$F/not-open.md" --original "$F/draft.md"
if [ "$RC" -eq 1 ]; then ok lint-fresh-output-is-all-open; else bad lint-fresh-output-is-all-open "rc $RC: $(cat "$OUT")"; fi

# A sound draft the editor found nothing in: an empty section, which the gate
# passes, is well formed too, so the eval never rewards an invented note.
{ cat "$F/draft.md"; printf '\n## Challenges (spec-editor)\n'; } > "$F/empty-edit.md"
lint "$F/empty-edit.md" --original "$F/draft.md"
if [ "$RC" -eq 0 ]; then ok lint-empty-section-passes; else bad lint-empty-section-passes "rc $RC: $(cat "$OUT")"; fi

lint "$F/draft.md" --original "$F/draft.md"
if [ "$RC" -eq 1 ]; then ok lint-no-section-is-not-editor-output; else bad lint-no-section-is-not-editor-output "rc $RC: $(cat "$OUT")"; fi

if [ ! -f "$GATE" ]; then bad close-and-lint-read-no-git "the gate script is missing"
elif [ -e "$GIT_CALLED" ]; then bad close-and-lint-read-no-git "git was called: $(cat "$GIT_CALLED")"
else ok close-and-lint-read-no-git; fi

# ---------------------------------------------------------------------------
section 'run: the close lands as commits (criteria 13 and 14)'
# ---------------------------------------------------------------------------

G() { "$REAL_GIT" -C "$REPO" "$@"; }
new_repo() {
    # $1 name, $2 AGENTS.md fixture, $3 spec state for C1 at the first commit
    REPO="$TMP/$1"
    mkdir -p "$REPO/docs/specs"
    "$REAL_GIT" init -q -b main "$REPO"
    cp "$2" "$REPO/AGENTS.md"
    spec "$3" > "$REPO/docs/specs/EX-7.md"
    printf 'notes\n' > "$REPO/notes.txt"
    printf 'other\n' > "$REPO/other.txt"
    G add -A
    G commit -qm 'Draft EX-7 with the challenges'
}
run_gate() { # $1 issue. Runs from inside the repo, as the lead and the lane do.
    (cd "$REPO" && python3 -I "$GATE" run "$1") > "$OUT" 2>&1
    RC=$?
}

# The human resolved C1 in the working copy and has not committed it. An
# unrelated file is modified and another is staged; neither may ride along.
new_repo r-uncommitted "$F/agents-opus.md" '[open]'
spec '[resolved]' > "$REPO/docs/specs/EX-7.md"
cp "$REPO/docs/specs/EX-7.md" "$TMP/gated.md"
printf 'changed\n' >> "$REPO/notes.txt"
printf 'staged\n' >> "$REPO/other.txt"
G add other.txt
BASE=$(G rev-parse HEAD)
run_gate EX-7
RUN_RC=$RC
RUN_CLOSED=$(field closed)
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ]; then ok run-passes-intact-section
else bad run-passes-intact-section "rc $RC: $(cat "$OUT")"; fi
if [ "$(G log -1 --format=%s)" = 'Close the challenges on EX-7' ]; then ok run-close-subject
else bad run-close-subject "$(G log -3 --format=%s)"; fi
if [ "$(G show --name-only --format= HEAD)" = docs/specs/EX-7.md ]; then ok run-close-touches-only-the-spec
else bad run-close-touches-only-the-spec "$(G show --name-only --format= HEAD)"; fi
if [ "$(G show --name-only --format= HEAD~1)" = docs/specs/EX-7.md ] && [ "$(G rev-parse HEAD~2)" = "$BASE" ]; then ok run-records-uncommitted-resolutions-alone
else bad run-records-uncommitted-resolutions-alone "$(G log --name-only --format=%s "$BASE"..HEAD)"; fi
MARKED=$(G show HEAD:docs/specs/EX-7.md | sed -n 's/^## Challenges (spec-editor): closed in \([0-9a-f]*\)$/\1/p')
if [ -n "$MARKED" ] && G show "$MARKED:docs/specs/EX-7.md" > "$TMP/at-marker.md" 2>/dev/null \
    && cmp -s "$TMP/gated.md" "$TMP/at-marker.md"; then ok run-marker-names-the-gated-commit
else bad run-marker-names-the-gated-commit "marker '$MARKED'"; fi
gate_check "$TMP/at-marker.md" "$F/agents-opus.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = resolved ]; then ok run-marker-commit-passes-the-gate
else bad run-marker-commit-passes-the-gate "rc $RC: $(cat "$OUT")"; fi
if [ -n "$MARKED" ] && [ "$RUN_CLOSED" = "$MARKED $(G rev-parse HEAD)" ]; then ok run-reports-the-close
else bad run-reports-the-close "closed line '$RUN_CLOSED', marker '$MARKED'"; fi
if [ "$RUN_RC" -ne 0 ]; then bad run-leaves-other-changes "the run did not pass, so this proves nothing"
elif G diff --quiet -- notes.txt; then bad run-leaves-other-changes "notes.txt is no longer modified"
elif G diff --cached --quiet -- other.txt; then bad run-leaves-other-changes "other.txt is no longer staged"
else ok run-leaves-other-changes; fi
G show HEAD:docs/specs/EX-7.md > "$TMP/head.md"
if cmp -s "$TMP/head.md" "$REPO/docs/specs/EX-7.md"; then ok run-working-copy-is-the-closed-spec
else bad run-working-copy-is-the-closed-spec "$(diff "$TMP/head.md" "$REPO/docs/specs/EX-7.md")"; fi

# Run again: a closed marker passes with no new commit.
HEAD_BEFORE=$(G rev-parse HEAD)
run_gate EX-7
if [ "$RC" -eq 0 ] && [ "$(field reason)" = closed-marker ] && [ "$(G rev-parse HEAD)" = "$HEAD_BEFORE" ]; then ok run-closed-marker-no-commit
else bad run-closed-marker-no-commit "rc $RC: $(cat "$OUT")"; fi

# Resolutions already committed: one commit, and the marker names the commit
# that was HEAD before the run.
new_repo r-committed "$F/agents-fable.md" '[struck: covered by the hook contract]'
BASE=$(G rev-parse HEAD)
run_gate EX-7
MARKED=$(G show HEAD:docs/specs/EX-7.md | sed -n 's/^## Challenges (spec-editor): closed in \([0-9a-f]*\)$/\1/p')
if [ "$RC" -eq 0 ] && [ "$(G rev-parse HEAD~1)" = "$BASE" ] && [ "$(G rev-parse "$MARKED")" = "$BASE" ]; then ok run-committed-spec-one-commit
else bad run-committed-spec-one-commit "rc $RC, marker $MARKED, base $BASE: $(cat "$OUT")"; fi

# A sub-issue builds from its parent's spec, and the close is named for the spec.
new_repo r-sub "$F/agents-opus.md" '[resolved]'
run_gate EX-7.2
if [ "$RC" -eq 0 ] && [ "$(G log -1 --format=%s)" = 'Close the challenges on EX-7' ]; then ok run-sub-issue-uses-parent-spec
else bad run-sub-issue-uses-parent-spec "rc $RC: $(cat "$OUT"); $(G log -1 --format=%s)"; fi

# Refusal, no record and neither: no commit at all, and the right exit.
for case in 'open:opus:1:refuse' 'resolved:none:0:no-record' 'open:neither:0:neither'; do
    IFS=: read -r st rec want reason <<<"$case"
    new_repo "r-$st-$rec" "$F/agents-$rec.md" "[$st]"
    HEAD_BEFORE=$(G rev-parse HEAD)
    run_gate EX-7
    if [ "$RC" -eq "$want" ] && [ "$(G rev-parse HEAD)" = "$HEAD_BEFORE" ] && G diff --quiet -- docs/specs/EX-7.md \
        && { [ "$reason" = refuse ] && [ "$(field blocking)" = C1 ] || [ "$(field reason)" = "$reason" ]; }; then ok "run-$st-$rec-no-commit"
    else bad "run-$st-$rec-no-commit" "rc $RC: $(cat "$OUT")"; fi
done

# Fix round 1, refuter survivor 4. A spec that was never committed is dirty:
# it is committed alone first, so the marker names a commit that holds it,
# then closed. An untracked file elsewhere stays untracked.
REPO="$TMP/r-untracked"
mkdir -p "$REPO/docs/specs"
"$REAL_GIT" init -q -b main "$REPO"
cp "$F/agents-opus.md" "$REPO/AGENTS.md"
G add AGENTS.md
G commit -qm 'Rules'
BASE=$(G rev-parse HEAD)
spec '[resolved]' > "$REPO/docs/specs/EX-7.md"
cp "$REPO/docs/specs/EX-7.md" "$TMP/untracked-gated.md"
printf 'scratch\n' > "$REPO/scratch.txt"
run_gate EX-7
MARKED=$(G show HEAD:docs/specs/EX-7.md 2>/dev/null | sed -n 's/^## Challenges (spec-editor): closed in \([0-9a-f]*\)$/\1/p')
if [ "$RC" -eq 0 ] && [ "$(G rev-parse HEAD~2 2>/dev/null)" = "$BASE" ] \
    && [ "$(G show --name-only --format= HEAD~1)" = docs/specs/EX-7.md ] \
    && [ "$(G log -1 --format=%s)" = 'Close the challenges on EX-7' ] \
    && G show "$MARKED:docs/specs/EX-7.md" 2>/dev/null | cmp -s - "$TMP/untracked-gated.md" \
    && [ -n "$(G ls-files --others -- scratch.txt)" ]; then ok run-untracked-spec-committed-then-closed
else bad run-untracked-spec-committed-then-closed "rc $RC: $(cat "$OUT"); $(G log --oneline --name-only 2>&1 | head -8)"; fi

# Fix round 1, Low: in a SHA-256 repository the marker carries the full
# 64-character id, and the closed spec passes the gate on a rerun.
REPO="$TMP/r-sha256"
mkdir -p "$REPO/docs/specs"
if "$REAL_GIT" init -q -b main --object-format=sha256 "$REPO" 2>/dev/null; then
    cp "$F/agents-opus.md" "$REPO/AGENTS.md"
    spec '[resolved]' > "$REPO/docs/specs/EX-7.md"
    G add -A
    G commit -qm 'Draft EX-7'
    BASE=$(G rev-parse HEAD)
    run_gate EX-7
    MARKED=$(G show HEAD:docs/specs/EX-7.md | sed -n 's/^## Challenges (spec-editor): closed in \([0-9a-f]*\)$/\1/p')
    run_gate EX-7
    if [ "${#BASE}" -eq 64 ] && [ "$MARKED" = "$BASE" ] && [ "$RC" -eq 0 ] && [ "$(field reason)" = closed-marker ]; then ok run-sha256-repo
    else bad run-sha256-repo "base $BASE, marker '$MARKED', rc $RC: $(cat "$OUT")"; fi
else
    bad run-sha256-repo "this git cannot init a SHA-256 repository"
fi

# Fix round 1, Low: the close is written to a temporary file beside the spec
# and renamed over it, never by opening the spec for writing, so a close that
# cannot be written leaves the spec whole. A read-only docs/specs/ makes the
# temporary file impossible to create while the spec itself stays writable;
# writing the spec in place would succeed there and commit.
new_repo r-atomic "$F/agents-opus.md" '[resolved]'
cp "$REPO/docs/specs/EX-7.md" "$TMP/atomic-before.md"
HEAD_BEFORE=$(G rev-parse HEAD)
chmod a-w "$REPO/docs/specs"
run_gate EX-7
chmod u+w "$REPO/docs/specs"
if [ "$RC" -eq 3 ] && cmp -s "$TMP/atomic-before.md" "$REPO/docs/specs/EX-7.md" && [ "$(G rev-parse HEAD)" = "$HEAD_BEFORE" ] \
    && [ -z "$(G status --porcelain)" ]; then ok run-unwritable-close-leaves-spec-whole
else bad run-unwritable-close-leaves-spec-whole "rc $RC: $(cat "$OUT"); $(G status --porcelain)"; fi

# No spec at all for the item: nothing to gate.
new_repo r-nospec "$F/agents-opus.md" '[resolved]'
run_gate EX-9
if [ "$RC" -eq 0 ] && [ "$(field reason)" = no-spec ]; then ok run-no-spec-passes
else bad run-no-spec-passes "rc $RC: $(cat "$OUT")"; fi

# A commit that fails leaves the spec as the human left it.
new_repo r-hookfail "$F/agents-opus.md" '[resolved]'
printf '#!/bin/sh\nexit 1\n' > "$REPO/.git/hooks/pre-commit"
chmod +x "$REPO/.git/hooks/pre-commit"
cp "$REPO/docs/specs/EX-7.md" "$TMP/before-fail.md"
HEAD_BEFORE=$(G rev-parse HEAD)
run_gate EX-7
if [ "$RC" -eq 3 ] && [ "$(G rev-parse HEAD)" = "$HEAD_BEFORE" ] && cmp -s "$TMP/before-fail.md" "$REPO/docs/specs/EX-7.md"; then ok run-failed-commit-restores-spec
else bad run-failed-commit-restores-spec "rc $RC: $(cat "$OUT")"; fi

# An issue id that is not one is refused before anything is read.
(cd "$REPO" && python3 -I "$GATE" run '../../etc/passwd') > "$OUT" 2>&1
RC=$?
if [ "$RC" -eq 2 ] && grep -q 'issue' "$OUT"; then ok run-refuses-bad-issue; else bad run-refuses-bad-issue "rc $RC: $(cat "$OUT")"; fi

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || exit 1
printf 'The challenge gate passes, refuses and closes as the CF-12 spec says, and reads no git history to decide.\n'
