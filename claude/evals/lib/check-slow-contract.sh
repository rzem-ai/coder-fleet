#!/usr/bin/env bash
#
# check-slow-contract.sh - check-slow.sh fails when one of its checks fails or
# runs nothing, and suite-coverage.sh counts a check as run only where a live
# run line names it.
#
# CI trusts check-slow.sh's exit code and the gate never runs it, so a suite
# that exits 0 over a red check, or over a check emptied to a shebang and an
# `exit 0`, hides that check everywhere. And suite-coverage.sh is what keeps
# every check in one suite or the other: a check whose run line is commented out
# runs nowhere, and has to be reported as running nowhere rather than found by
# its path in the comment. Both run here as copies in a scratch tree, against
# stub checks.
#
# Usage:  evals/lib/check-slow-contract.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
for f in check-slow.sh suite-coverage.sh ran-check.sh; do
    [ -f "$LIB_DIR/$f" ] || { printf 'check-slow-contract: missing %s\n' "$LIB_DIR/$f" >&2; exit 2; }
done

TMP=$(mktemp -d "${TMPDIR:-/tmp}/check-slow-contract.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }
stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$1"; chmod +x "$1"; }
# A stub check passes the way a real one does: it prints a count.
RAN='printf "1 passed, 0 failed\n"'

# check-slow.sh's verdict. Every check it names is a stub that passes, and then
# the first one it names fails.
SLOW="$TMP/slow/claude/evals/lib"
mkdir -p "$SLOW"
cp "$LIB_DIR/check-slow.sh" "$LIB_DIR/ran-check.sh" "$SLOW/"
names=$(grep -oE '^[[:space:]]*run[[:space:]].*\$LIB_DIR/[A-Za-z0-9_.-]+\.sh' "$LIB_DIR/check-slow.sh" | grep -oE '[A-Za-z0-9_.-]+\.sh$')
for n in $names; do stub "$SLOW/$n" "$RAN; exit 0"; done
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

# A check cut down to nothing that checks anything exits 0 having run no check,
# so it must fail whatever is left of it: nothing at all, a bare shebang, a
# shebang and `exit 0`, comments, or an exit before the first check. A check
# that marks itself skipped passes, as in check-all.sh.
if [ -n "$first" ] && [ -n "$first_label" ]; then
    for c in 'empty|' 'a bare shebang|' 'a shebang and exit 0|exit 0' 'comments only|# every check was here' "an exit before its checks|exit 0; $RAN"; do
        what=${c%%|*}; body=${c#*|}
        for n in $names; do stub "$SLOW/$n" "$RAN; exit 0"; done
        case "$what" in
            empty) : > "$SLOW/$first" ;;
            'a bare shebang') printf '#!/usr/bin/env bash\n' > "$SLOW/$first" ;;
            *) stub "$SLOW/$first" "$body" ;;
        esac
        bash "$SLOW/check-slow.sh" > "$TMP/empty.out" 2>&1
        rc=$?
        if [ "$rc" -eq 1 ] && grep -qx "FAILED: $first_label" "$TMP/empty.out" && grep -q "^$first_label ran no check" "$TMP/empty.out"; then
            pass "check-slow.sh fails $first when its script is $what, and says it ran no check"
        else
            fail "check-slow.sh fails $first when its script is $what, and says it ran no check (exit $rc)"; sed 's/^/        /' "$TMP/empty.out"
        fi
    done

    for n in $names; do stub "$SLOW/$n" "$RAN; exit 0"; done
    stub "$SLOW/$first" 'printf "no tool, so skipped\n"; : > "$CHECK_ALL_SKIP_FILE"; exit 0'
    bash "$SLOW/check-slow.sh" > "$TMP/skip.out" 2>&1
    rc=$?
    if [ "$rc" -eq 0 ] && grep -q "^$first_label: skipped (" "$TMP/skip.out"; then
        pass "check-slow.sh passes $first as skipped when it marks itself skipped"
    else
        fail "check-slow.sh passes $first as skipped when it marks itself skipped (exit $rc)"; sed 's/^/        /' "$TMP/skip.out"
    fi
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
