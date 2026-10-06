#!/usr/bin/env bash
#
# next-column-contract.sh - the board's Next column (CF-140).
#
# Next sits between To Do and In Progress and holds the cards the human wants
# built before anything else queued. A card there is the human's order, the
# lead takes Next top first by ordinal, only the human moves a card into it,
# and /kickoff and /init offer it to a board that lacks it. The board binary
# takes its columns from the statuses list, so the configs carry the column;
# board-hook-contract.sh's start-col-next proves a spawn moves a Next card, and
# the board's next-column.test.ts proves the web board serves it in order.
#
# Usage:  claude/evals/lib/next-column-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)

TEMPLATE="$PLUGIN_ROOT/templates/board.config.yml"
OWN_CONFIG="$REPO_ROOT/.boards/config.yml"

PASSED=0
FAILED=0

check() {
    # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$label"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s\n' "$label"
    fi
    return 0
}

SIX='statuses: ["To Do", "Next", "In Progress", "Blocked", "Blocked by human", "Done"]'
lists_six() { grep -qxF -- "$SIX" "$1"; }

printf '\nThe configs list Next between To Do and In Progress, Done last\n'
check 'the template lists the six statuses in order'      lists_six "$TEMPLATE"
check "this repository's board lists them in order"       lists_six "$OWN_CONFIG"
check 'a new item still starts in To Do'                  grep -qxF 'default_status: "To Do"' "$TEMPLATE"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The Next column is missing or out of place somewhere the fleet reads it.\n'
    exit 1
fi
printf 'Next sits between To Do and In Progress, and the fleet says what it means.\n'
