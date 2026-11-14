#!/usr/bin/env bash
#
# challenge-gate-contract.sh - scripts/challenge-gate.py, the one gate that
# lead.md step 3 and spec-to-card's card stage both run, against the notation
# in docs/decisions/challenge-notation.md.
#
# Four parts, each against the real script:
#
#   check   the verdict on fixture specs, with spec-editor enabled or disabled.
#           These run with a git on PATH that records any call and fails, and the run checks it
#           was never called: the gate reads no git history, which is what
#           lets it pass in a shallow clone or a cloud session.
#   close   the closed spec, compared byte for byte with a hand-written expected
#           file, so "every other line is byte-identical" is a cmp, not a grep.
#   lint    the notation check the spec-editor eval's checks.sh runs over an
#           editor's output, so the eval and the gate share one parser.
#   run     the gate on the spec in the board's specs/, and the close in
#           place, in throwaway repositories and boards under this test's own
#           temporary directory, never in this checkout; and whether
#           the project disables spec-editor, read from its main checkout's
#           .claude/coder-fleet.json as the spawn hook reads it, never from an
#           AGENTS.md line.
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
# Whether file permissions bind this process. Under root (or any process
# holding CAP_DAC_OVERRIDE) chmod changes nothing, so a case that makes a file
# or directory unwritable or unreadable cannot show what it claims: it is
# skipped with a SKIP line, counted as neither pass nor fail, as the human
# asked, rather than failing a suite that is green everywhere permissions bind.
perms_bind() {
    local probe; probe=$(mktemp "${TMPDIR:-/tmp}/perms-probe.XXXXXX") || return 0
    chmod 000 "$probe"
    if [ -r "$probe" ]; then rm -f "$probe"; return 1; fi
    rm -f "$probe"; return 0
}
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
    # $1 spec file, then any flag for check. Sets RC, writes $OUT.
    PATH="$NOGIT:$PATH" python3 -I "$GATE" check "$@" > "$OUT" 2>&1
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
printf '# Agent rules\n\nNothing about editors here.\n' > "$F/agents-none.md"
# A line an earlier /init wrote. The gate no longer reads it.
printf '# Agent rules\n\nSpec editor: neither\n' > "$F/agents-neither.md"

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
section 'check: passes'
# ---------------------------------------------------------------------------

spec '[resolved]' > "$F/resolved.md"
gate_check "$F/resolved.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ] && [ "$(field reason)" = resolved ]; then ok pass-all-resolved
else bad pass-all-resolved "rc $RC: $(cat "$OUT")"; fi

spec '[struck: the hook contract already covers this]' > "$F/struck.md"
gate_check "$F/struck.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ]; then ok pass-struck-with-reason
else bad pass-struck-with-reason "rc $RC: $(cat "$OUT")"; fi

# Only should-resolve and note challenges, both still open.
spec '[open]' | grep -v '^- C1 ' > "$F/soft-only.md"
gate_check "$F/soft-only.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ]; then ok pass-only-soft-open
else bad pass-only-soft-open "rc $RC: $(cat "$OUT")"; fi

# The closed marker, and nothing else of the section.
printf '# EX-7\n\nStatus: approved\n\n## Challenges (spec-editor): closed in 3f2a9c1\n\n## Open questions\n' > "$F/closed.md"
gate_check "$F/closed.md"
if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ] && [ "$(field reason)" = closed-marker ]; then ok pass-closed-marker
else bad pass-closed-marker "rc $RC: $(cat "$OUT")"; fi

# A full 40-character sha is a closed marker too.
printf '# EX-7\n\n## Challenges (spec-editor): closed in 3f2a9c1e4b5d6a7f8091a2b3c4d5e6f708192a3b\n' > "$F/closed40.md"
gate_check "$F/closed40.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = closed-marker ]; then ok pass-closed-marker-40
else bad pass-closed-marker-40 "rc $RC: $(cat "$OUT")"; fi

# A disabled spec-editor passes every spec, sectioned or not, open or not.
printf '# EX-7\n\nStatus: approved\n\n## Acceptance criteria\n\n1. It works.\n' > "$F/plain.md"
spec '[open]' > "$F/open.md"
for s in plain open; do
    gate_check "$F/$s.md" --spec-editor-disabled
    if [ "$RC" -eq 0 ] && [ "$(field verdict)" = pass ] && [ "$(field reason)" = disabled ]; then ok "pass-disabled-$s"
    else bad "pass-disabled-$s" "rc $RC: $(cat "$OUT")"; fi
done

# ---------------------------------------------------------------------------
section 'check: refusals, each naming every blocking id'
# ---------------------------------------------------------------------------

refuses_naming() {
    # $1 label, $2 spec, $3 the blocking ids wanted, space-separated
    gate_check "$2"
    if [ "$RC" -eq 1 ] && [ "$(field verdict)" = refuse ] && [ "$(field blocking)" = "$3" ]; then ok "$1"
    else bad "$1" "rc $RC, wanted blocking '$3': $(cat "$OUT")"; fi
}

spec '[struck: ]' > "$F/struck-empty.md"
refuses_naming refuse-struck-empty-reason "$F/struck-empty.md" C1

spec '[struck:]' > "$F/struck-bare.md"
refuses_naming refuse-struck-no-reason "$F/struck-bare.md" C1

refuses_naming refuse-must-resolve-open "$F/open.md" C1

spec '[open]' '- C4 [must resolve] [open] Criterion 2 names no clock.' > "$F/open-two.md"
refuses_naming refuse-names-every-open-id "$F/open-two.md" 'C1 C4'

spec '[resolved]' '- C4 [must resolve] [open] Criterion 2 names no clock.' > "$F/one-of-two.md"
refuses_naming refuse-names-only-the-open-one "$F/one-of-two.md" C4

spec '' > "$F/state-deleted.md"
refuses_naming refuse-state-tag-deleted "$F/state-deleted.md" C1

# A resolved tag does not hide an [open] left beside it.
spec '[resolved] [open]' > "$F/both-states.md"
refuses_naming refuse-resolved-and-open "$F/both-states.md" C1

# With spec-editor enabled, a spec it never ran on is refused, and the refusal
# names the one switch that lets specs through without it.
gate_check "$F/plain.md"
if [ "$RC" -eq 1 ] && [ "$(field verdict)" = refuse ] && [ "$(field reason)" = no-section ] \
    && grep -q '/coder-fleet:agents disable spec-editor' "$OUT"; then ok refuse-no-section
else bad refuse-no-section "rc $RC: $(cat "$OUT")"; fi

# The human deleted the section by hand and left the inline markers: still no
# section and no closed marker, so still a refusal.
spec '[open]' | awk '/^## Challenges \(spec-editor\)$/ { skip = 1; next } skip && /^## / { skip = 0 } !skip' > "$F/deleted.md"
if grep -q 'Challenges' "$F/deleted.md"; then bad deleted-fixture-sane "the fixture still has a section"; fi
gate_check "$F/deleted.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = no-section ]; then ok refuse-section-deleted-by-hand
else bad refuse-section-deleted-by-hand "rc $RC: $(cat "$OUT")"; fi

{ spec '[resolved]'; printf '\n## Challenges (spec-editor)\n\n- C9 [must resolve] [open] Second section.\n'; } > "$F/two-sections.md"
gate_check "$F/two-sections.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = ambiguous ]; then ok refuse-two-sections
else bad refuse-two-sections "rc $RC: $(cat "$OUT")"; fi

{ spec '[open]'; printf '\n## Challenges (spec-editor): closed in 3f2a9c1\n'; } > "$F/section-and-marker.md"
gate_check "$F/section-and-marker.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = ambiguous ]; then ok refuse-section-and-marker
else bad refuse-section-and-marker "rc $RC: $(cat "$OUT")"; fi

# A heading with something after it is not the section, and not a pass.
spec '[open]' | sed 's/^## Challenges (spec-editor)$/## Challenges (spec-editor) - draft/' > "$F/near-miss.md"
gate_check "$F/near-miss.md"
if [ "$RC" -eq 1 ] && [ "$(field verdict)" = refuse ]; then ok refuse-near-miss-heading
else bad refuse-near-miss-heading "rc $RC: $(cat "$OUT")"; fi

# A must-resolve line with no id still blocks, named by its line.
spec '[resolved]' '- [must resolve] [open] An id-less challenge.' > "$F/no-id.md"
gate_check "$F/no-id.md"
if [ "$RC" -eq 1 ] && printf '%s' "$(field blocking)" | grep -q '^line:[0-9][0-9]*$'; then ok refuse-id-less-must-resolve
else bad refuse-id-less-must-resolve "rc $RC: $(cat "$OUT")"; fi

# The heading inside a code fence is documentation, not the section.
{ cat "$F/plain.md"; printf '\n```\n## Challenges (spec-editor)\n- C1 [must resolve] [open] x\n```\n'; } > "$F/fenced.md"
gate_check "$F/fenced.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = no-section ]; then ok fenced-heading-is-not-a-section
else bad fenced-heading-is-not-a-section "rc $RC: $(cat "$OUT")"; fi

# A line that opens a fence with an info
# string, "```js", cannot close one, so a heading after it in a nested example
# is still inside the outer fence and is not the section.
{ cat "$F/plain.md"; printf '\n```markdown\nAn example of the notation:\n```js\n## Challenges (spec-editor)\n- C1 [must resolve] [resolved] x\n```\n'; } > "$F/nested-fence.md"
gate_check "$F/nested-fence.md"
if [ "$RC" -eq 1 ] && [ "$(field reason)" = no-section ]; then ok nested-fence-heading-is-not-a-section
else bad nested-fence-heading-is-not-a-section "rc $RC: $(cat "$OUT")"; fi

# A closed marker's sha is 7 to 64 hex
# characters; anything else is not a marker, so the spec has no section, and
# the refusal names the challenge ids its inline markers carry.
for bad_sha in later 3f2a9c HEAD~1 3F2A9C1 "$(printf '%065d' 0)"; do
    printf '# EX-7\n\n1. A criterion. [challenge C1] [challenge C3]\n\n## Challenges (spec-editor): closed in %s\n' "$bad_sha" > "$F/bad-marker.md"
    gate_check "$F/bad-marker.md"
    if [ "$RC" -eq 1 ] && [ "$(field reason)" = no-section ] && [ "$(field blocking)" = 'C1 C3' ]; then ok "bad-sha-marker-refused-$bad_sha"
    else bad "bad-sha-marker-refused-$bad_sha" "rc $RC: $(cat "$OUT")"; fi
done

# A SHA-256 repository names a commit with 64 hex
# characters, and the marker the close writes there has to pass.
printf '# EX-7\n\n## Challenges (spec-editor): closed in %s\n' "$(printf 'a%.0s' $(seq 64))" > "$F/closed64.md"
gate_check "$F/closed64.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = closed-marker ]; then ok pass-closed-marker-64
else bad pass-closed-marker-64 "rc $RC: $(cat "$OUT")"; fi

# An empty section, a sound draft the editor found nothing in, passes.
spec '[open]' | grep -v '^- C[0-9]' > "$F/empty-section.md"
gate_check "$F/empty-section.md"
if [ "$RC" -eq 0 ] && [ "$(field reason)" = resolved ]; then ok pass-empty-section
else bad pass-empty-section "rc $RC: $(cat "$OUT")"; fi

# Only meaningful once the script exists: an absent script calls no git either.
if [ ! -f "$GATE" ]; then bad check-reads-no-git "the gate script is missing"
elif [ -e "$GIT_CALLED" ]; then bad check-reads-no-git "git was called: $(cat "$GIT_CALLED")"
else ok check-reads-no-git; fi

# ---------------------------------------------------------------------------
section 'close: the closed spec'
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

gate_check "$F/resolved.md"
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
gate_check "$F/closed-out.md"
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
section 'run: the spec in the board'"'"'s specs/, closed in place, nothing committed'
# ---------------------------------------------------------------------------

# Each repository gets a board of its own under a throwaway XDG_CONFIG_HOME,
# made through the board's CLI from source, never the runner's own boards.
export XDG_CONFIG_HOME="$TMP/config"
G() { "$REAL_GIT" -C "$REPO" "$@"; }
NB=0
new_repo() {
    # $1 name, $2 AGENTS.md fixture, $3 spec state for C1, $4 a
    # .claude/coder-fleet.json to commit, when given. Sets REPO and SPEC, the
    # spec in the repo's board.
    NB=$((NB + 1))
    REPO="$TMP/$1"
    mkdir -p "$REPO"
    "$REAL_GIT" init -q -b main "$REPO"
    cp "$2" "$REPO/AGENTS.md"
    if [ -n "${4:-}" ]; then mkdir -p "$REPO/.claude"; printf '%s\n' "$4" > "$REPO/.claude/coder-fleet.json"; fi
    G add -A
    G commit -qm 'Rules'
    (cd "$REPO" && printf 'R%s\n' "$NB" | bun --no-env-file "$PLUGIN_ROOT/boards/src/cli.ts" init) >/dev/null 2>&1
    SPEC="$XDG_CONFIG_HOME/boards/R$NB/specs/EX-7.md"
    mkdir -p "${SPEC%/*}"
    spec "$3" > "$SPEC"
}
run_gate() { # $1 issue. Runs from inside the repo, as the lead and the lane do.
    (cd "$REPO" && python3 -I "$GATE" run "$1") > "$OUT" 2>&1
    RC=$?
}

# A resolved spec passes and is closed in place, naming the commit the
# repository is at; it is outside the project's history, so nothing is
# committed. A second run sees the closed marker.
new_repo r-resolved "$F/agents-none.md" '[resolved]'
cp "$SPEC" "$TMP/resolved-before.md"
HEAD_BEFORE=$(G rev-parse HEAD)
run_gate EX-7
if [ "$RC" -eq 0 ] && [ "$(field reason)" = resolved ] && [ "$(field spec)" = "$SPEC" ] && [ "$(field closed)" = "$HEAD_BEFORE" ]; then ok run-reads-the-board-spec
else bad run-reads-the-board-spec "rc $RC: $(cat "$OUT")"; fi
python3 -I "$GATE" close "$TMP/resolved-before.md" --sha "$HEAD_BEFORE" > "$TMP/resolved-want.md" 2>/dev/null
if cmp -s "$TMP/resolved-want.md" "$SPEC"; then ok run-closes-in-place
else bad run-closes-in-place "$(diff "$TMP/resolved-want.md" "$SPEC")"; fi
if [ "$(G rev-parse HEAD)" = "$HEAD_BEFORE" ] && [ -z "$(G status --porcelain)" ]; then ok run-commits-nothing
else bad run-commits-nothing "$(G log --oneline -3; G status --porcelain)"; fi
run_gate EX-7
if [ "$RC" -eq 0 ] && [ "$(field reason)" = closed-marker ]; then ok run-second-sees-closed-marker
else bad run-second-sees-closed-marker "rc $RC: $(cat "$OUT")"; fi

# A sub-issue builds from its parent's spec.
new_repo r-sub "$F/agents-none.md" '[resolved]'
run_gate EX-7.2
if [ "$RC" -eq 0 ] && [ "$(field reason)" = resolved ] && [ "$(field spec)" = "$SPEC" ]; then ok run-sub-issue-uses-parent-spec
else bad run-sub-issue-uses-parent-spec "rc $RC: $(cat "$OUT")"; fi

# A spec left in the repo's own docs/specs/ is not the board's, so it is not read.
new_repo r-docs "$F/agents-none.md" '[open]'
rm -f "$SPEC"
mkdir -p "$REPO/docs/specs"
spec '[open]' > "$REPO/docs/specs/EX-7.md"
run_gate EX-7
if [ "$RC" -eq 0 ] && [ "$(field reason)" = no-spec ]; then ok run-docs-specs-is-not-read
else bad run-docs-specs-is-not-read "rc $RC: $(cat "$OUT")"; fi

# A repository with no board has no spec to gate.
REPO="$TMP/r-no-board"
mkdir -p "$REPO"
"$REAL_GIT" init -q -b main "$REPO"
run_gate EX-7
if [ "$RC" -eq 0 ] && [ "$(field reason)" = no-spec ]; then ok run-no-board-no-spec
else bad run-no-board-no-spec "rc $RC: $(cat "$OUT")"; fi

# Whether spec-editor runs is the project's disabledAgents, read from the main
# checkout as the spawn hook reads it, and nothing else: no AGENTS.md line
# (an old `Spec editor: neither` included) switches the gate off, and a file
# the hook would not honour disables nothing. A verdict leaves the spec alone.
DISABLED='{"disabledAgents": ["spec-editor"]}'
INVALID='{"disabledAgents": ["spec-editor", "lead"]}'
OTHER='{"disabledAgents": ["tech-editor"]}'
run_case() {
    # $1 label, $2 AGENTS.md fixture, $3 the config or empty, $4 the exit wanted,
    # $5 the reason wanted. The spec's C1 is open.
    new_repo "r-$1" "$2" '[open]' "$3"
    cp "$SPEC" "$TMP/case-before.md"
    HEAD_BEFORE=$(G rev-parse HEAD)
    run_gate EX-7
    if [ "$RC" -eq "$4" ] && [ "$(field reason)" = "$5" ] && [ "$(G rev-parse HEAD)" = "$HEAD_BEFORE" ] \
        && cmp -s "$TMP/case-before.md" "$SPEC"; then ok "$1"
    else bad "$1" "rc $RC: $(cat "$OUT")"; fi
}
run_case run-no-config-gates                "$F/agents-none.md"    ''         1 open
run_case run-old-neither-line-is-not-read   "$F/agents-neither.md" ''         1 open
run_case run-disabled-passes                "$F/agents-none.md"    "$DISABLED" 0 disabled
run_case run-disabled-with-old-line-passes  "$F/agents-neither.md" "$DISABLED" 0 disabled
run_case run-invalid-config-disables-nothing "$F/agents-none.md"   "$INVALID" 1 open
run_case run-other-agent-disabled-gates     "$F/agents-none.md"    "$OTHER"   1 open

# A linked worktree reaches the same board. The main checkout's list counts
# from it; the worktree's own copy never does, so a branch cannot switch its
# own gate off.
new_repo r-wt "$F/agents-none.md" '[open]'
G worktree add -q "$TMP/r-wt-agent" -b agent-wt
mkdir -p "$TMP/r-wt-agent/.claude"
printf '%s\n' "$DISABLED" > "$TMP/r-wt-agent/.claude/coder-fleet.json"
(cd "$TMP/r-wt-agent" && python3 -I "$GATE" run EX-7) > "$OUT" 2>&1
RC=$?
if [ "$RC" -eq 1 ] && [ "$(field reason)" = open ] && [ "$(field spec)" = "$SPEC" ]; then ok run-worktree-copy-disables-nothing
else bad run-worktree-copy-disables-nothing "rc $RC: $(cat "$OUT")"; fi
mkdir -p "$REPO/.claude"
printf '%s\n' "$DISABLED" > "$REPO/.claude/coder-fleet.json"
rm -f "$TMP/r-wt-agent/.claude/coder-fleet.json"
(cd "$TMP/r-wt-agent" && python3 -I "$GATE" run EX-7) > "$OUT" 2>&1
RC=$?
if [ "$RC" -eq 0 ] && [ "$(field reason)" = disabled ]; then ok run-main-checkout-list-counts-from-a-worktree
else bad run-main-checkout-list-counts-from-a-worktree "rc $RC: $(cat "$OUT")"; fi

# An issue id that is not one is refused before anything is read.
(cd "$REPO" && python3 -I "$GATE" run '../../etc/passwd') > "$OUT" 2>&1
RC=$?
if [ "$RC" -eq 2 ] && grep -q 'issue' "$OUT"; then ok run-refuses-bad-issue; else bad run-refuses-bad-issue "rc $RC: $(cat "$OUT")"; fi

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || exit 1
printf 'The challenge gate passes, refuses and closes as the notation says, and reads no git history to decide.\n'
