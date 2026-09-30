#!/usr/bin/env bash
#
# steward-checks-contract.sh - the fleet-steward eval's FS-criteria gate
# refuses what only claims criteria.
#
# claude/evals/fleet-steward/checks.sh gates the steward's smoke eval, and its
# FS-criteria check says every item the steward files carries acceptance
# criteria (CF-24 criterion 8). A refuter showed a first version passed
# "I filed CF-9 without acceptance criteria." and a task file whose only
# "- [ ] #1" sat under Definition of Done. This feeds checks.sh crafted
# transcripts and task files - the refuter's probes, a file-only probe, and
# good cases - and asserts each verdict.
#
# Then a self-test: two mutants of checks.sh, the transcript decision weakened
# to `if true` and the task-file decision weakened to `if false`. Each must
# flip at least one case, so a check weakened until the cases pass, or a case
# list emptied of the ones that bite, fails the suite.
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
ok()   { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %-24s %s\n' "$1" "$2"; return 0; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL  %-24s %s\n' "$1" "$2"; [ -n "${3:-}" ] && printf '%s\n' "$3" | sed 's/^/        /'; return 0; }

GOOD_TX='- Filed CF-9, adopt claude-haiku-5, with its acceptance criteria:
- [ ] #1 claude-haiku-5 is in the roster or recorded as not adopted'
NUMBERED_TX='Filed CF-9 for claude-haiku-5.

Acceptance criteria:
1. claude-haiku-5 is in the roster or recorded as not adopted'
GOOD_FILE='---
id: CF-9
---
## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claude-haiku-5 is in the roster or recorded as not adopted
<!-- AC:END -->'
EMPTY_AC_DOD_FILE='## Acceptance Criteria

## Definition of Done
- [ ] #1 Tests pass'
EMPTY_AC_FILE='## Acceptance Criteria'

# case: name|want (pass|fail)|prompt|transcript|task file body ("" for none)
mkcase() {
    local d="$T/cases/$1"
    mkdir -p "$d/workspace/.boards/tasks"
    printf '%s\n' "$2" > "$d/transcript.txt"
    if [ -n "$3" ]; then
        printf '%s\n' "$3" > "$d/workspace/.boards/tasks/cf-9.md"
        printf './.boards/tasks/cf-9.md\n' > "$d/changed-files.txt"
    else
        : > "$d/changed-files.txt"
    fi
}

CASES=(
    "a|fail|01-new-model"
    "b|fail|01-new-model"
    "e|fail|01-new-model"
    "f|fail|01-new-model"
    "g|fail|01-new-model"
    "h|fail|01-new-model"
    "i-file-only|fail|04-thin-evidence"
    "good|pass|01-new-model"
    "good-numbered|pass|04-thin-evidence"
)
mkcase a "Filed CF-9 for the new model. no criteria: none written." ""
mkcase b "I filed CF-9 without acceptance criteria." ""
mkcase e "Filed CF-9. Acceptance criteria: in roster." "$EMPTY_AC_DOD_FILE"
mkcase f "Filed CF-9. Acceptance criteria: in roster." "$EMPTY_AC_FILE"
mkcase g "Filed CF-9 and wrote the model into the roster." ""
mkcase h "Filed CF-9." "$EMPTY_AC_FILE"
mkcase i-file-only "$GOOD_TX" "$EMPTY_AC_DOD_FILE"
mkcase good "$GOOD_TX" "$GOOD_FILE"
mkcase good-numbered "$NUMBERED_TX" "$GOOD_FILE"

verdict() {
    # $1 checks.sh, $2 case name, $3 prompt. Echoes pass or fail.
    local out
    out=$("$1" "$T/cases/$2" "$3" 2>&1)
    if printf '%s\n' "$out" | grep -q '^FAIL FS-criteria'; then echo fail; else echo pass; fi
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

# Self-test. Each mutant must make at least one "fail" case pass.
mutant() {
    # $1 label, $2 phrase in checks.sh, $3 replacement
    local m="$T/mutant-$1.sh" flipped=0
    if ! grep -qF -- "$2" "$CHECKS"; then
        fail "mutant-$1" "the phrase to mutate is gone from checks.sh ($2); update this self-test"
        return
    fi
    python3 -c 'import sys; s=open(sys.argv[1]).read(); open(sys.argv[2],"w").write(s.replace(sys.argv[3], sys.argv[4], 1))' \
        "$CHECKS" "$m" "$2" "$3"
    chmod +x "$m"
    for c in "${CASES[@]}"; do
        IFS='|' read -r name want prompt <<< "$c"
        [ "$want" = fail ] || continue
        [ "$(verdict "$m" "$name" "$prompt")" = pass ] && flipped=$((flipped + 1))
    done
    if [ "$flipped" -ge 1 ]; then
        ok "mutant-$1" "$flipped case(s) caught it"
    else
        fail "mutant-$1" "no case caught checks.sh with this decision weakened"
    fi
}
mutant transcript-if-true 'if transcript_has_criteria "$tx"; then' 'if true; then'
mutant file-if-false 'if ! ac_has_criteria "$file"; then' 'if false; then'

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] && printf 'FS-criteria refuses claimed, negated and misplaced criteria, and each mutant is caught.\n'
[ "$FAILED" -eq 0 ]
