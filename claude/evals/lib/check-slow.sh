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
# or opens a network connection.
#
#   steward-checks        the fleet-steward smoke eval's FS-criteria gate needs
#                         a real acceptance criterion and refuses misplaced
#                         ones, with a mutant self-test of the gate script.
#                         About a minute; it guards a manual, paid eval
#   board-hook-no-bun     board-hook-contract.sh passes sharded with no bun and
#                         no installed board, CI's shape, run here so a Mac
#                         that has both still covers it. A second full run of
#                         the contract, too costly for the gate
#
# Usage:  evals/lib/check-slow.sh [-v]

set -uo pipefail

VERBOSE="${1:-}"
LIB_DIR=$(cd "$(dirname "$0")" && pwd)

FAILED=()
SUITE_START=$(date +%s)

run() {
    # $1 label, rest: command. Each closes with its verdict and duration.
    local label="$1" start verdict; shift
    printf '\n=== %s ===\n' "$label"
    start=$(date +%s)
    if "$@" ${VERBOSE:+"$VERBOSE"} < /dev/null; then verdict=ok; else verdict=FAILED; FAILED+=("$label"); fi
    printf '%s: %s (%ss)\n' "$label" "$verdict" "$(( $(date +%s) - start ))"
}

run steward-checks      "$LIB_DIR/steward-checks-contract.sh"
run board-hook-no-bun   "$LIB_DIR/board-hook-no-bun.sh"

printf '\n---\ntotal: %ss\n' "$(( $(date +%s) - SUITE_START ))"
if [ "${#FAILED[@]}" -ne 0 ]; then
    printf 'FAILED: %s\n' "${FAILED[*]}"
    exit 1
fi
printf 'Every slow deterministic check passes.\n'
