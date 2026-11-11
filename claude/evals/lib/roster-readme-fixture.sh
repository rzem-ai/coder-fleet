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
# The lead's shape checks get the same proof through LEAD_SKILL_OVERRIDE: a copy
# of the lead-procedures skill missing a section, or carrying a paragraph over
# 250 words, fails the check that guards it (docs/decisions/lead-procedures-skill.md).
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

# 3 and 4. A lead-procedures skill that loses a section, or grows a paragraph
# past 250 words, fails the check that guards it, by name.
SKILL="$REPO_ROOT/claude/coder-fleet/skills/lead-procedures/SKILL.md"
[ -f "$SKILL" ] || { printf 'roster-readme-fixture: missing %s\n' "$SKILL" >&2; exit 2; }
grep -v '^## Editors$' "$SKILL" > "$TMP/skill-no-editors.md"
{ cat "$SKILL"; printf '%s\n' "$(yes word | head -n 260 | tr '\n' ' ')"; } > "$TMP/skill-long-paragraph.md"
lead_skill_case() { # $1 case, $2 skill copy, $3 check name that must fail
    if LEAD_SKILL_OVERRIDE="$2" "$ROSTER" > "$TMP/$1.out" 2>&1; then
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
lead_skill_case lead-section-dropped "$TMP/skill-no-editors.md" lead-procedures-sections
lead_skill_case lead-paragraph-too-long "$TMP/skill-long-paragraph.md" lead-procedures-paragraph-length

if [ "$FAILED" -ne 0 ]; then
    printf '\nroster-readme-fixture: the roster check does not reliably read the README table or the lead-procedures skill.\n'
    exit 1
fi
printf '\nroster-readme-fixture: the roster check catches a dropped README row and still passes the real one.\n'
printf 'roster-readme-fixture: it also catches a lead-procedures skill that loses a section or grows a paragraph past 250 words.\n'
