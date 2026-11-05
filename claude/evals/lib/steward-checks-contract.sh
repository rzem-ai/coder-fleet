#!/usr/bin/env bash
#
# steward-checks-contract.sh - the fleet-steward eval's FS-criteria gate needs
# a real criterion, and accepts the shapes an issue body really takes.
#
# claude/evals/fleet-steward/checks.sh gates the steward's smoke eval, and its
# FS-criteria check says every issue the steward files carries acceptance
# criteria. The eval workspace has no GitHub remote, so the final message is
# the only evidence. A weak check passes "I filed #9 without acceptance
# criteria." and a message whose only checkbox sits under Definition of Done or
# Actions for human, so the check needs a real criterion in the message, and
# reads no prose for admissions: those are the rubric's (FS01f, FS04e). This
# feeds checks.sh crafted transcripts and asserts each verdict.
#
# Then a self-test: one mutant per decision in checks.sh, each a string
# replacement in a copy. Every mutant must change at least one case's verdict,
# so a decision weakened until the cases pass, or a case list emptied of the
# ones that bite, fails the suite.
#
# Usage:  evals/lib/steward-checks-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
CHECKS="$LIB_DIR/../fleet-steward/checks.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/steward-checks.XXXXXX")
trap 'rm -rf "$T"' EXIT

PASSED=0
FAILED=0
ok()   { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %-28s %s\n' "$1" "$2"; return 0; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL  %-28s %s\n' "$1" "$2"; [ -n "${3:-}" ] && printf '%s\n' "$3" | sed 's/^/        /'; return 0; }

CRIT='- [ ] #1 claude-haiku-5 is in the roster or recorded as not adopted'
GOOD_TX="- Filed #9, adopt claude-haiku-5, with its acceptance criteria:
$CRIT"
NUMBERED_TX='Filed #9 for claude-haiku-5.

Acceptance criteria:
1. claude-haiku-5 is in the roster or recorded as not adopted'

# mkcase <name> <transcript>
mkcase() {
    local d="$T/cases/$1"
    mkdir -p "$d"
    printf '%s\n' "$2" > "$d/transcript.txt"
    : > "$d/changed-files.txt"
}

# name|want|prompt
CASES=(
    "a|fail|01-new-model"
    "b|fail|01-new-model"
    "e|fail|04-thin-evidence"
    "g|fail|01-new-model"
    "good|pass|01-new-model"
    "good-numbered|pass|04-thin-evidence"
    "admission-plus-real|pass|01-new-model"
    "box-no-number|pass|01-new-model"
    "bare-box|fail|01-new-model"
    "dod-only-message|fail|01-new-model"
    "actions-only-message|fail|04-thin-evidence"
    "dod-before-heading|pass|04-thin-evidence"
    "heading-colonless|pass|04-thin-evidence"
    "inline-numbered|pass|01-new-model"
)
mkcase a "Filed #9 for the new model. no criteria: none written."
mkcase b "I filed #9 without acceptance criteria."
# Prose after the heading is not a criterion.
mkcase e "Filed #9. Acceptance criteria: in roster."
mkcase g "Filed #9 and wrote the model into the roster."
mkcase good "$GOOD_TX"
mkcase good-numbered "$NUMBERED_TX"
# No refusal of admissions in prose: word-matching free text cannot tell good
# messages from bad. A real criterion plus an admission that a second issue
# went bare passes this check; the rubric's FS01f and FS04e fail it.
mkcase admission-plus-real "$GOOD_TX
- I filed #10 without acceptance criteria."
# An issue body's criteria are plain task-list items, numbered or not.
mkcase box-no-number "Filed #9. Acceptance criteria:
- [ ] model in roster"
# A checkbox with no text is not a criterion.
mkcase bare-box "Filed #9. Acceptance criteria:
- [ ] #1"
# A checkbox under Definition of Done, or under Actions for human, is not one.
mkcase dod-only-message "Filed #9.
Definition of Done:
- [ ] #1 tests pass"
mkcase actions-only-message "Filed #9.

## Actions for human
- [ ] 1. Which model replaces the retired alias?"
# A criteria heading ends a Definition of Done stretch, so a checkbox after
# it counts again.
mkcase dod-before-heading "Filed #9 with the default Definition of Done.

## Acceptance criteria

What closing it means:
$CRIT"
# A heading with no colon still introduces criteria.
mkcase heading-colonless "Filed #9.

## Acceptance criteria
1. model in roster"
# A numbered item on the heading's own line counts.
mkcase inline-numbered "Filed #9. Acceptance criteria: 1. model in roster"

verdict() {
    # $1 checks.sh, $2 case name, $3 prompt. Echoes pass or fail.
    local out
    out=$("$1" "$T/cases/$2" "$3" 2>&1)
    if grep -q '^FAIL FS-criteria' <<<"$out"; then echo fail; else echo pass; fi
}

for c in "${CASES[@]}"; do
    IFS='|' read -r name want prompt <<< "$c"
    got=$(verdict "$CHECKS" "$name" "$prompt")
    if [ "$got" = "$want" ]; then
        ok "case-$name" "FS-criteria says $got"
    else
        fail "case-$name" "wanted FS-criteria to $want, it said $got" "$("$CHECKS" "$T/cases/$name" "$prompt" 2>&1)"
    fi
done

# Self-test. Each mutant must change at least one case's verdict. The first
# case that catches a mutant is enough, so the rest are not run against it:
# all of them against every case would be most of this file's run time.
mutant() {
    # $1 label, $2 phrase in checks.sh, $3 replacement
    local m="$T/mutant-$1.sh" caught="" name want prompt
    if ! grep -qF -- "$2" "$CHECKS"; then
        fail "mutant-$1" "the phrase to mutate is gone from checks.sh ($2); update this self-test"
        return
    fi
    python3 -c 'import sys; s=open(sys.argv[1]).read(); open(sys.argv[2],"w").write(s.replace(sys.argv[3], sys.argv[4], 1))' \
        "$CHECKS" "$m" "$2" "$3"
    chmod +x "$m"
    for c in "${CASES[@]}"; do
        IFS='|' read -r name want prompt <<< "$c"
        if [ "$(verdict "$m" "$name" "$prompt")" != "$want" ]; then caught="$name"; break; fi
    done
    if [ -n "$caught" ]; then
        ok "mutant-$1" "case-$caught caught it"
    else
        fail "mutant-$1" "no case caught checks.sh with this decision weakened"
    fi
}
mutant transcript-if-true   'if transcript_has_criteria "$tx"; then' 'if true; then'
mutant box-needs-no-text    '(?:#\d+\s+)?[^\s#]")' '")'
mutant box-needs-number     '(?:#\d+\s+)?[^\s#]")' '#\d+\s+[^\s#]")'
mutant dod-box-counted      'if BOX.match(l) and not not_criteria:' 'if BOX.match(l):'
mutant actions-box-counted  'definition of done|actions for human' 'definition of done'
mutant m5-no-hash-heading   ' or l.lstrip().startswith("#")' ''
mutant m6-no-inline         'if m and re.match(' 'if False and re.match('
mutant dod-reset-deleted    '        not_criteria = False' '        pass'

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] && printf 'FS-criteria needs a real criterion in the message, accepts a plain task-list criterion, and each mutant is caught.\n'
[ "$FAILED" -eq 0 ]
