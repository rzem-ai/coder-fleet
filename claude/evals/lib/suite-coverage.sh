#!/usr/bin/env bash
#
# suite-coverage.sh - every check under claude/evals/lib runs in exactly one
# suite, and CI runs both suites.
#
# CF-56 split the deterministic checks in two: check-all.sh, which the
# TaskCompleted gate runs on every close and has to stay inside its budget, and
# check-slow.sh, which holds the slow checks the gate can do without and which
# CI runs after it. A check moved between the two, or a new one written and
# never wired in, must not quietly stop running anywhere. So every script in
# this directory is either a check named by exactly one suite, or one of the
# named helpers below that other scripts call.
#
# Usage:  evals/lib/suite-coverage.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$LIB_DIR/../../.." && pwd)
ALL="$LIB_DIR/check-all.sh"
SLOW="$LIB_DIR/check-slow.sh"
CI="$REPO_ROOT/.github/workflows/checks.yml"

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }

# Scripts here that are not checks, and what runs them instead.
helper() {
    case "$1" in
        check-all.sh|check-slow.sh) return 0 ;;   # the suites themselves
        shards.sh) return 0 ;;                      # sourced by the sharded contracts
        final-message.sh|handoff-check.sh) return 0 ;; # the eval runner's, and run by the parity checks
    esac
    return 1
}

for f in "$ALL" "$SLOW" "$CI"; do
    if [ -f "$f" ]; then pass "${f#"$REPO_ROOT"/} exists"; else fail "${f#"$REPO_ROOT"/} exists"; fi
done

names() { # $1 suite: every lib script it names through $LIB_DIR
    grep -oE '\$LIB_DIR/[A-Za-z0-9_.-]+\.(sh|mjs)' "$1" 2>/dev/null | sed 's#^\$LIB_DIR/##' | sort -u
}

for path in "$LIB_DIR"/*.sh "$LIB_DIR"/*.mjs; do
    name=$(basename "$path")
    helper "$name" && continue
    in_all=0; in_slow=0
    names "$ALL" | grep -qxF "$name" && in_all=1
    names "$SLOW" | grep -qxF "$name" && in_slow=1
    case "$in_all$in_slow" in
        10) pass "$name runs in check-all.sh" ;;
        01) pass "$name runs in check-slow.sh" ;;
        11) fail "$name runs in both suites; it belongs in one" ;;
        *)  fail "$name runs in neither suite, so nothing runs it" ;;
    esac
done

for suite in check-all.sh check-slow.sh; do
    if grep -qE "^[[:space:]]+run: bash claude/evals/lib/$suite\$" "$CI" 2>/dev/null; then
        pass "CI runs $suite"
    else
        fail "CI runs $suite"
    fi
done

if [ "$FAILED" -ne 0 ]; then
    printf '\nsuite-coverage: a check under claude/evals/lib does not run in exactly one suite, or CI skips a suite.\n'
    exit 1
fi
printf '\nsuite-coverage: every check runs in exactly one suite, and CI runs both.\n'
