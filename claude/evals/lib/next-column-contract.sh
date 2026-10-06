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
GLOSSARY="$PLUGIN_ROOT/skills/glossary/SKILL.md"
CONVENTIONS="$PLUGIN_ROOT/skills/board-conventions/SKILL.md"
DESIGN="$REPO_ROOT/docs/fleet-design.md"
README="$REPO_ROOT/README.md"
HOOKS_README="$PLUGIN_ROOT/hooks/README.md"

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

# The refuter's round-1 survivors (m2, m3, m5, m6): the guard that stops a
# duplicate Next, the commit's trailer, the check after the write, and the
# order of the two offers. init carries the guard, the trailer and the order
# in its own words and follows kickoff's paragraph for the rest.
paragraph_line() { grep -nE "^\*\*$1\.\*\*" "$KICKOFF" | head -n 1 | cut -d: -f1; }
rename_before_next() {
    local r n
    r=$(paragraph_line Rename); n=$(paragraph_line Next)
    [ -n "$r" ] && [ -n "$n" ] && [ "$r" -lt "$n" ]
}
# init's Next sentence, from "If its `statuses` lack `Next`" to its full stop.
init_next_sentence() { init_board_line | python3 -I -c 'import re,sys; m=re.search(r"If its `statuses` lack `Next`.*?\.(?=\s|$)", sys.stdin.read()); print(m.group(0)) if m else sys.exit(1)'; }
init_next_says() { init_next_sentence | grep -qF -- "$1"; }
init_rename_then_next() {
    local line r n
    line=$(init_board_line)
    r=${line%%first offer the rename*}; n=${line%%then offer to add it*}
    [ "$r" != "$line" ] && [ "$n" != "$line" ] && [ "${#r}" -lt "${#n}" ]
}

printf '\nThe Next offer adds one Next, commits it as kickoff, checks it, and comes after Rename\n'
check 'kickoff offers only when the board has no Next'        next_offer_says 'When the `statuses` list has `To Do` and no `Next`, offer'
check 'the Next commit carries the Board-Writer trailer'      next_offer_says 'git commit -m "Add the Next column to the board" -m "Board-Writer: kickoff" -- .boards/config.yml'
check 'the offer checks Next follows To Do after the write'   next_offer_says 'Check with `${CLAUDE_PLUGIN_ROOT}/board/board.sh config show` that `Next` follows `To Do`.'
check 'the offer makes the Rename offer first'                next_offer_says 'When the Rename offer also applies, make it first.'
check 'the Rename paragraph comes before the Next paragraph'  rename_before_next
check 'init offers only when the board lacks Next'            init_next_says 'If its `statuses` lack `Next`, then offer to add it'
check 'init commits Next with its own Board-Writer trailer'   init_next_says '`Board-Writer: init` on the config commit'
check 'init offers the rename first, then Next'               init_rename_then_next

step3() { grep -E '^3\. Build what the human ordered\.' "$LEAD"; }
step3_says() { step3 | grep -qF -- "$1"; }

printf '\nThe lead takes Next first and never moves a card into it\n'
check 'a card in Next is the human'"'"'s order'               step3_says 'A card in the Next column is the human'"'"'s order to build it'
check 'Next is taken ahead of any other queued work'       step3_says 'take Next cards ahead of any other queued work'
check 'top of the column first, by ordinal'                step3_says 'top of the column first by ordinal, never by priority'
check 'the lead may suggest a card for Next'               step3_says 'you may suggest a card for Next'
check 'the lead never moves one'                           step3_says 'never move one there yourself'

# Phrase-presence checks pass however much contradicting text sits beside them
# (the refuter's m4). So read every sentence, and table cell, that names Next
# beside a move, put, place, drag, drop or set verb: every such verb must be
# negated - never or not up to five words before it, or no straight after - or
# have the human as its subject. "from Next" is a move out of the column, not
# into it, so it is dropped first.
moves_into_next_only_with_never() {
    python3 -I -c '
import re, sys
V = r"(?:move|moves|moved|moving|put|puts|putting|place|places|placed|placing|drag|drags|dragged|dragging|drop|drops|dropped|dropping|set|sets|setting)"
verb = re.compile(r"\b" + V + r"\b", re.I)
before = re.compile(r"\b(?:never|not)\b(?:\W+\w+){0,5}\W+$", re.I)
after = re.compile(r"^\s+no\b", re.I)
human = re.compile(r"\bhuman\s+$", re.I)
bad = []
for line in open(sys.argv[1], encoding="utf-8"):
    for s in re.split(r"(?<=[.!?])\s+|\s\|\s", line.strip()):
        rest = re.sub(r"\bfrom (the )?Next\b", "", s)
        if not re.search(r"\bNext\b", rest):
            continue
        for m in verb.finditer(rest):
            head, tail = rest[:m.start()], rest[m.end():]
            if not (before.search(head) or after.search(tail) or human.search(head)):
                bad.append(s)
                break
for s in bad:
    print(s, file=sys.stderr)
sys.exit(1 if bad else 0)
' "$1"
}
check 'lead.md tells the lead to move nothing into Next'          moves_into_next_only_with_never "$LEAD"
check 'board-conventions has no agent move a card into Next'      moves_into_next_only_with_never "$CONVENTIONS"

# Every file that describes the columns says six, names Next, and says what it
# means; none still says five.
says_no_five() { ! grep -qiE 'five columns|five-column|five statuses|the five status' "$1"; }

printf '\nThe prose describes six columns, Next the human'"'"'s ordered queue\n'
check 'the glossary skill has six columns'                 grep -qF 'six columns: to do, next, in progress, blocked, blocked by human, done' "$GLOSSARY"
check 'the glossary defines Next'                          grep -qE '^\| Next \| The column the human fills with the cards the fleet takes before anything else queued' "$GLOSSARY"
check 'the glossary says only the human moves a card in'   grep -qF 'Only the human moves a card into it' "$GLOSSARY"
check 'the glossary description lists Next'                grep -qE '^description: .*Gate, Board, Next, Human queue,' "$GLOSSARY"
check 'board-conventions says six in its description'      grep -qF 'the meaning of the six columns (to do, next, in progress, blocked, blocked by human, done)' "$CONVENTIONS"
check 'board-conventions has a Next row'                   grep -qE '^\| Next \| The human'"'"'s ordered queue' "$CONVENTIONS"
check 'the design has a Next row'                          grep -qE '^\| Next \| Your ordered queue' "$DESIGN"
check 'the design says six columns'                        grep -qF 'The board is the task files grouped by status, six columns:' "$DESIGN"
check 'the README says six statuses'                       grep -qF 'its six statuses' "$README"
check 'the README defines Next'                            grep -qF "Next, between To Do and In Progress: the human's ordered queue" "$README"
check 'hooks/README lists Next'                            grep -qF 'covers `To Do`, `Next`, `In Progress`, `Blocked`, `Blocked by human` and `Done`' "$HOOKS_README"
for f in "$GLOSSARY" "$CONVENTIONS" "$DESIGN" "$README" "$HOOKS_README" "$KICKOFF" "$INIT" "$PLUGIN_ROOT/templates/rules/glossary.md" "$REPO_ROOT/.claude/rules/glossary.md"; do
    check "${f#"$REPO_ROOT"/} no longer says five"          says_no_five "$f"
done

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The Next column is missing or out of place somewhere the fleet reads it.\n'
    exit 1
fi
printf 'Next sits between To Do and In Progress, and the fleet says what it means.\n'
