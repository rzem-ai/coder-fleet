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
KICKOFF="$PLUGIN_ROOT/commands/kickoff.md"
INIT="$PLUGIN_ROOT/commands/init.md"
LEAD="$PLUGIN_ROOT/agents/lead.md"

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

# kickoff's Next paragraph runs from its bold label to the next bold label.
next_offer() { awk '/^\*\*Next\.\*\*/{f=1} f&&/^\*\*/&&!/^\*\*Next\.\*\*/{exit} f' "$KICKOFF"; }
next_offer_says() { next_offer | grep -qF -- "$1"; }
status_check() { grep -E '^- Its `statuses` are ' "$KICKOFF"; }
status_check_says() { status_check | grep -qF -- "$1"; }
init_board_line() { grep -F 'If `.boards/config.yml` exists, say so' "$INIT"; }
init_board_line_says() { init_board_line | grep -qF -- "$1"; }

printf '\n/kickoff and /init offer Next to a board without it\n'
check "kickoff's status check names the six"                  status_check_says '`To Do`, `Next`, `In Progress`, `Blocked`, `Blocked by human`, `Done`'
check "kickoff's status check passes a board without Next"   status_check_says 'A board without `Next` is not a failure'
check 'kickoff has a Next offer'                              grep -qE '^\*\*Next\.\*\*' "$KICKOFF"
check 'the offer asks with AskUserQuestion'                   next_offer_says 'AskUserQuestion'
check 'the offer inserts Next after To Do'                    next_offer_says 'directly after `To Do`'
check 'the offer changes nothing on a no'                     next_offer_says 'On a no, change nothing'
check 'the offer commits the config alone'                    next_offer_says '-- .boards/config.yml'
check 'the offer moves no item'                               next_offer_says 'moves no item'
check 'the offer says which branch before it asks'            next_offer_says 'say which branch that is before you ask'
check 'init follows the Next offer for an existing board'     init_board_line_says 'Next paragraph of `${CLAUDE_PLUGIN_ROOT}/commands/kickoff.md`'
check 'init says a new board gets Next from the template'     init_board_line_says 'A new board gets `In Progress` and `Next` from the template'
check 'kickoff states the status names, Next among them'      grep -qF 'the status names as the config spells them, `Next` among them where the board has it' "$KICKOFF"

step3() { grep -E '^3\. Build what the human ordered\.' "$LEAD"; }
step3_says() { step3 | grep -qF -- "$1"; }

printf '\nThe lead takes Next first and never moves a card into it\n'
check 'a card in Next is the human'"'"'s order'               step3_says 'A card in the Next column is the human'"'"'s order to build it'
check 'Next is taken ahead of any other queued work'       step3_says 'take Next cards ahead of any other queued work'
check 'top of the column first, by ordinal'                step3_says 'top of the column first by ordinal, never by priority'
check 'the lead may suggest a card for Next'               step3_says 'you may suggest a card for Next'
check 'the lead never moves one'                           step3_says 'never move one there yourself'

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The Next column is missing or out of place somewhere the fleet reads it.\n'
    exit 1
fi
printf 'Next sits between To Do and In Progress, and the fleet says what it means.\n'
