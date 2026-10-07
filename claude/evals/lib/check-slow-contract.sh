#!/usr/bin/env bash
#
# check-slow-contract.sh - check-slow.sh fails when one of its checks fails, and
# suite-coverage.sh counts a check as run only where a live run line names it.
#
# CI trusts check-slow.sh's exit code and the gate never runs it, so a suite
# that exits 0 over a red check hides that check everywhere (CF-56.1). And
# suite-coverage.sh is what keeps every check in one suite or the other: a
# check whose run line is commented out runs nowhere, and has to be reported as
# running nowhere rather than found by its path in the comment. Both run here
# as copies in a scratch tree, against stub checks.
#
# Usage:  evals/lib/check-slow-contract.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
for f in check-slow.sh suite-coverage.sh; do
    [ -f "$LIB_DIR/$f" ] || { printf 'check-slow-contract: missing %s\n' "$LIB_DIR/$f" >&2; exit 2; }
done

TMP=$(mktemp -d "${TMPDIR:-/tmp}/check-slow-contract.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }
stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$1"; chmod +x "$1"; }

# check-slow.sh's verdict. Every check it names is a stub that passes, and then
# the first one it names fails.
SLOW="$TMP/slow/claude/evals/lib"
mkdir -p "$SLOW"
cp "$LIB_DIR/check-slow.sh" "$SLOW/check-slow.sh"
names=$(grep -oE '^[[:space:]]*run[[:space:]].*\$LIB_DIR/[A-Za-z0-9_.-]+\.sh' "$LIB_DIR/check-slow.sh" | grep -oE '[A-Za-z0-9_.-]+\.sh$')
for n in $names; do stub "$SLOW/$n" 'exit 0'; done
first=$(printf '%s\n' $names | head -n 1)
first_label=$(sed -nE "s/^[[:space:]]*run[[:space:]]+([^[:space:]]+).*\\\$LIB_DIR\/$first.*/\1/p" "$LIB_DIR/check-slow.sh" | head -n 1)

if [ -z "$first" ] || [ -z "$first_label" ]; then
    fail 'check-slow.sh names at least one check on a run line'
else
    bash "$SLOW/check-slow.sh" > "$TMP/green.out" 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then pass 'check-slow.sh exits 0 when every slow check passes'
    else fail "check-slow.sh exits 0 when every slow check passes (exit $rc)"; sed 's/^/        /' "$TMP/green.out"; fi

    stub "$SLOW/$first" 'exit 1'
    bash "$SLOW/check-slow.sh" > "$TMP/red.out" 2>&1
    rc=$?
    if [ "$rc" -eq 1 ]; then pass "check-slow.sh exits 1 when $first fails"
    else fail "check-slow.sh exits 1 when $first fails (exit $rc)"; sed 's/^/        /' "$TMP/red.out"; fi
    if grep -qx "FAILED: $first_label" "$TMP/red.out"; then pass "check-slow.sh names $first_label as the failure"
    else fail "check-slow.sh names $first_label as the failure"; fi
fi

# No other suite runs board-hook-contract.sh in one process, the way
# BOARD_HOOK_SHARDS=1 promises it still runs, so check-slow.sh does, once. Every
# check it names is real here except board-hook-no-bun.sh and the steward
# checks, which are stubs, and a stub contract that logs the count it was given.
mkdir -p "$TMP/once/claude/evals/lib"
ONCE="$TMP/once/claude/evals/lib"
cp "$LIB_DIR/check-slow.sh" "$ONCE/"
for n in $names; do
    case "$n" in
        board-hook-no-bun.sh|steward-checks-contract.sh) stub "$ONCE/$n" 'exit 0' ;;
        *) cp "$LIB_DIR/$n" "$ONCE/$n" ;;
    esac
done
stub "$ONCE/board-hook-contract.sh" "printf '%s\\n' \"\${BOARD_HOOK_SHARDS:-unset}\" >> '$TMP/once.log'; exit 0"
: > "$TMP/once.log"
BOARD_HOOK_SHARDS=4 bash "$ONCE/check-slow.sh" > "$TMP/once.out" 2>&1
rc=$?
if [ "$rc" -eq 0 ] && [ "$(cat "$TMP/once.log")" = 1 ]; then
    pass 'check-slow.sh runs board-hook-contract.sh with BOARD_HOOK_SHARDS=1 exactly once'
else
    fail "check-slow.sh runs board-hook-contract.sh with BOARD_HOOK_SHARDS=1 exactly once (exit $rc, counts given: $(tr '\n' ' ' < "$TMP/once.log"))"
    sed 's/^/        /' "$TMP/once.out"
fi

# suite-coverage.sh over a toy repository: one check in each suite, and CI
# running both.
cov() { # $1 the line check-slow.sh carries for b.sh; leaves RC and $TMP/cov.out
    local root="$TMP/cov" lib="$TMP/cov/claude/evals/lib"
    rm -rf "$root"
    mkdir -p "$lib" "$root/.github/workflows"
    cp "$LIB_DIR/suite-coverage.sh" "$lib/suite-coverage.sh"
    stub "$lib/a.sh" 'exit 0'
    stub "$lib/b.sh" 'exit 0'
    printf '\n' > "$lib/c.mjs"
    printf '#!/usr/bin/env bash\nrun suite-coverage "$LIB_DIR/suite-coverage.sh"\nrun a "$LIB_DIR/a.sh"\nrun c node "$LIB_DIR/c.mjs"\n' > "$lib/check-all.sh"
    printf '#!/usr/bin/env bash\n%s\n' "$1" > "$lib/check-slow.sh"
    printf 'jobs:\n  checks:\n    steps:\n      - name: all\n        run: bash claude/evals/lib/check-all.sh\n      - name: slow\n        run: bash claude/evals/lib/check-slow.sh\n' > "$root/.github/workflows/checks.yml"
    bash "$lib/suite-coverage.sh" > "$TMP/cov.out" 2>&1
    RC=$?
}

cov 'run b "$LIB_DIR/b.sh"'
if [ "$RC" -eq 0 ]; then pass 'suite-coverage passes a toy repository with every check run once'
else fail "suite-coverage passes a toy repository with every check run once (exit $RC)"; sed 's/^/        /' "$TMP/cov.out"; fi

cov '# run b "$LIB_DIR/b.sh"'
if [ "$RC" -eq 1 ] && grep -q '^FAIL  b.sh runs in neither suite' "$TMP/cov.out"; then
    pass 'suite-coverage reports a check whose only run line is commented out as run nowhere'
else
    fail "suite-coverage reports a check whose only run line is commented out as run nowhere (exit $RC)"
    sed 's/^/        /' "$TMP/cov.out"
fi

cov '# b.sh, "$LIB_DIR/b.sh", is named here but run by nothing'
if [ "$RC" -eq 1 ] && grep -q '^FAIL  b.sh runs in neither suite' "$TMP/cov.out"; then
    pass 'suite-coverage does not count a check named only in a comment'
else
    fail "suite-coverage does not count a check named only in a comment (exit $RC)"
    sed 's/^/        /' "$TMP/cov.out"
fi

if [ "$FAILED" -ne 0 ]; then
    printf '\ncheck-slow-contract: check-slow.sh or suite-coverage.sh lets a check that never runs, or fails, through.\n'
    exit 1
fi
printf '\ncheck-slow-contract: check-slow.sh fails on a red check, and suite-coverage.sh counts only live run lines.\n'
