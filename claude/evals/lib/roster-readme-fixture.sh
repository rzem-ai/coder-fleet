#!/usr/bin/env bash
#
# roster-readme-fixture.sh - roster-contract.sh actually reads the README table.
#
# AGENTS.md has always said the roster check makes "every agent named in the
# README table" agree with the matcher, the runner and the design, but until
# the Task 7 follow-up roster-contract.sh never opened README.md at all. This
# proves the assertion is real: a README with an agent row dropped fails the
# check, naming the agent, and the unmodified README still passes.
#
# The lead's shape checks get the same proof through LEAD_BODY_OVERRIDE: a copy
# of the lead's body over 20 KB, carrying a paragraph over 250 words, or naming
# a reference file that does not exist fails the check that guards it
# (docs/decisions/lead-body-and-references.md).
#
# Usage:  evals/lib/roster-readme-fixture.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)
ROSTER="$LIB_DIR/roster-contract.sh"
README="$REPO_ROOT/claude/README.md"

[ -f "$ROSTER" ] || { printf 'roster-readme-fixture: missing %s\n' "$ROSTER" >&2; exit 2; }
[ -f "$README" ] || { printf 'roster-readme-fixture: missing %s\n' "$README" >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/roster-readme-fixture.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

FAILED=0

# 1. A README with the scripter row dropped fails the check, naming scripter.
DROPPED="$TMP/readme-dropped-scripter.md"
grep -v '^| `scripter`' "$README" > "$DROPPED"
if ROSTER_README_OVERRIDE="$DROPPED" "$ROSTER" > "$TMP/dropped.out" 2>&1; then
    printf 'FAIL  dropped-row-should-fail   roster-contract.sh passed against a README missing the scripter row\n'
    FAILED=1
elif ! grep -q 'scripter' "$TMP/dropped.out"; then
    printf 'FAIL  dropped-row-names-agent   roster-contract.sh failed but did not name scripter\n'
    cat "$TMP/dropped.out"
    FAILED=1
else
    printf 'ok    dropped-row-should-fail   roster-contract.sh fails against a README missing the scripter row, naming it\n'
fi

# 2. The real, unmodified README still passes.
if ROSTER_README_OVERRIDE="$README" "$ROSTER" > "$TMP/real.out" 2>&1; then
    printf 'ok    real-readme-should-pass   roster-contract.sh passes against the real README\n'
else
    printf 'FAIL  real-readme-should-pass   roster-contract.sh failed against the real, unmodified README\n'
    cat "$TMP/real.out"
    FAILED=1
fi

# 3, 4 and 5. A lead body over 20 KB, one with a paragraph past 250 words, and
# one naming a reference file that does not exist each fail the check that
# guards it, by name.
BODY="$REPO_ROOT/claude/coder-fleet/agents/lead.md"
[ -f "$BODY" ] || { printf 'roster-readme-fixture: missing %s\n' "$BODY" >&2; exit 2; }
{ cat "$BODY"; head -c 21000 /dev/zero | tr '\0' 'x'; printf '\n'; } > "$TMP/body-too-big.md"
{ cat "$BODY"; printf '%s\n' "$(yes word | head -n 260 | tr '\n' ' ')"; } > "$TMP/body-long-paragraph.md"
{ cat "$BODY"; printf 'Read `${CLAUDE_PLUGIN_ROOT}/references/no-such-file.md` first.\n'; } > "$TMP/body-missing-reference.md"
lead_body_case() { # $1 case, $2 body copy, $3 check name that must fail
    if LEAD_BODY_OVERRIDE="$2" "$ROSTER" > "$TMP/$1.out" 2>&1; then
        printf 'FAIL  %-27s roster-contract.sh passed against %s\n' "$1" "$(basename "$2")"
        FAILED=1
    elif ! grep -q "FAIL  $3 " "$TMP/$1.out"; then
        printf 'FAIL  %-27s roster-contract.sh failed, but not on %s\n' "$1" "$3"
        cat "$TMP/$1.out"
        FAILED=1
    else
        printf 'ok    %-27s %s fails against %s\n' "$1" "$3" "$(basename "$2")"
    fi
}
lead_body_case lead-body-too-big "$TMP/body-too-big.md" lead-size
lead_body_case lead-paragraph-too-long "$TMP/body-long-paragraph.md" lead-paragraph-length
lead_body_case lead-reference-missing "$TMP/body-missing-reference.md" lead-references-resolve

if [ "$FAILED" -ne 0 ]; then
    printf '\nroster-readme-fixture: the roster check does not reliably read the README table or the lead body.\n'
    exit 1
fi
printf '\nroster-readme-fixture: the roster check catches a dropped README row and still passes the real one.\n'
printf 'roster-readme-fixture: it also catches a lead body over 20 KB, with a paragraph past 250 words, or naming a missing reference file.\n'
