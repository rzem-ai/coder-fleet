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
# Usage:  evals/lib/roster-readme-fixture.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)
ROSTER="$LIB_DIR/roster-contract.sh"
README="$REPO_ROOT/README.md"

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

if [ "$FAILED" -ne 0 ]; then
    printf '\nroster-readme-fixture: the roster check does not reliably read the README table.\n'
    exit 1
fi
printf '\nroster-readme-fixture: the roster check catches a dropped README row and still passes the real one.\n'
