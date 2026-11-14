#!/usr/bin/env bash
#
# check-slow.sh - the deterministic checks that are too slow for check-all.sh
# and that the TaskCompleted gate can do without.
#
# check-all.sh runs on every card close in this repository and has a budget
# (AGENTS.md, "Before saying anything works"). A check lands here only when it
# is slow and guards something no card close depends on. CI runs this after
# check-all.sh, so nothing here goes unrun; suite-coverage.sh fails if a check
# is in neither suite or in both. Like check-all.sh, nothing here calls a model
# or opens a network connection. And like check-all.sh, a check that exits 0
# without printing a count or an ok line has run nothing and fails
# (ran-check.sh, shared by both); one that has no tool to run marks itself
# skipped through CHECK_ALL_SKIP_FILE and passes as skipped. None of the checks
# below needs the exemption list check-all.sh keeps for checks with no count.
#
#   steward-checks        the fleet-steward smoke eval's FS-criteria gate needs
#                         a real acceptance criterion and refuses misplaced
#                         ones, with a mutant self-test of the gate script.
#                         About a minute; it guards a manual, paid eval
#   opencode-live         every OpenCode port body's merged ruleset from a
#                         real OpenCode, and one denial end to end against a
#                         mock endpoint (opencode/test/run.sh live). Needs the
#                         pinned OpenCode binary, which a close cannot assume
#
# Usage:  evals/lib/check-slow.sh [-v]

set -uo pipefail

VERBOSE="${1:-}"
LIB_DIR=$(cd "$(dirname "$0")" && pwd)

. "$LIB_DIR/ran-check.sh" || exit 2

FAILED=()
SUITE_START=$(date +%s)
JOBS=$(mktemp -d "${TMPDIR:-/tmp}/check-slow.XXXXXX") || exit 2
trap 'rm -rf "$JOBS"' EXIT

run() {
    # $1 label, rest: command. Each closes with its verdict and duration. The
    # output streams as it is written and is kept to look for a result line.
    local label="$1" start verdict msg; shift
    printf '\n=== %s ===\n' "$label"
    start=$(date +%s)
    rm -f "$JOBS/skip" "$JOBS/out"
    export CHECK_ALL_SKIP_FILE="$JOBS/skip"
    if "$@" ${VERBOSE:+"$VERBOSE"} < /dev/null 2>&1 | tee "$JOBS/out"; then
        verdict=ok
        [ -e "$JOBS/skip" ] && verdict=skipped
        if msg=$(ran_no_check "$label" "$JOBS/skip" "$JOBS/out"); then
            printf '%s\n' "$msg"; verdict=FAILED; FAILED+=("$label")
        fi
    else
        verdict=FAILED; FAILED+=("$label")
    fi
    printf '%s: %s (%ss)\n' "$label" "$verdict" "$(( $(date +%s) - start ))"
}

run steward-checks      "$LIB_DIR/steward-checks-contract.sh"
run opencode-live       "$LIB_DIR/opencode-live.sh"

printf '\n---\ntotal: %ss\n' "$(( $(date +%s) - SUITE_START ))"
if [ "${#FAILED[@]}" -ne 0 ]; then
    printf 'FAILED: %s\n' "${FAILED[*]}"
    exit 1
fi
printf 'Every slow deterministic check passes.\n'
