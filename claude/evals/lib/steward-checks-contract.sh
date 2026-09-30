#!/usr/bin/env bash
#
# steward-checks-contract.sh - the fleet-steward eval's FS-criteria gate
# refuses what only claims criteria, and accepts what the board really writes.
#
# claude/evals/fleet-steward/checks.sh gates the steward's smoke eval, and its
# FS-criteria check says every item the steward files carries acceptance
# criteria (CF-24 criterion 8). A refuter showed a first version passed
# "I filed CF-9 without acceptance criteria." and a task file whose only
# "- [ ] #1" sat under Definition of Done, and a second round got seven of
# eight mutants past this file. This feeds checks.sh crafted transcripts and
# task files and asserts each verdict.
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
GOOD_TX="- Filed CF-9, adopt claude-haiku-5, with its acceptance criteria:
$CRIT"
NUMBERED_TX='Filed CF-9 for claude-haiku-5.

Acceptance criteria:
1. claude-haiku-5 is in the roster or recorded as not adopted'

GOOD_FILE="---
id: CF-9
---
## Acceptance Criteria
<!-- AC:BEGIN -->
$CRIT
<!-- AC:END -->"
EMPTY_AC_DOD_FILE='## Acceptance Criteria

## Definition of Done
- [ ] #1 Tests pass'
EMPTY_AC_FILE='## Acceptance Criteria'
BARE_BOX_FILE='## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1
<!-- AC:END -->'
EMPTY_MARKERS_STRAY_FILE='## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->
- [ ] #1 a stray line below the markers'
MARKERS_NO_HEADING_FILE="<!-- AC:BEGIN -->
$CRIT
<!-- AC:END -->"
MARKERLESS_FILE="## Acceptance Criteria
$CRIT

## Definition of Done
- [ ] #1 Tests pass"
NO_AC_FILE='---
id: CF-2
---
## Description
An item that was on the board before the run.'

# mkcase <name> <transcript> <task file body or ""> [pre-existing]
# With "pre-existing", the task file is listed in before.manifest, as run.sh
# records a file the workspace had before the agent ran.
mkcase() {
    local d="$T/cases/$1"
    mkdir -p "$d/workspace/.boards/tasks"
    printf '%s\n' "$2" > "$d/transcript.txt"
    : > "$d/changed-files.txt"
    if [ -n "$3" ]; then
        printf '%s\n' "$3" > "$d/workspace/.boards/tasks/cf-9.md"
        printf './.boards/tasks/cf-9.md\n' > "$d/changed-files.txt"
    fi
    if [ "${4:-}" = pre-existing ]; then
        printf '1234-56  ./.boards/tasks/cf-9.md\n' > "$d/before.manifest"
    else
        : > "$d/before.manifest"
    fi
}

# name|want|prompt
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
    "neg-claim-plus-real|fail|01-new-model"
    "double-negative|pass|01-new-model"
    "box-no-number|fail|01-new-model"
    "dod-only-message|fail|01-new-model"
    "heading-colonless|pass|04-thin-evidence"
    "inline-numbered|pass|01-new-model"
    "file-bare-box|fail|01-new-model"
    "file-empty-markers-stray|fail|01-new-model"
    "file-markers-no-heading|pass|01-new-model"
    "file-markerless|pass|01-new-model"
    "file-modified-not-added|pass|01-new-model"
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
# One real criterion does not excuse a second item filed bare (kills M1).
mkcase neg-claim-plus-real "$GOOD_TX
- I filed CF-10 without acceptance criteria." ""
# The reviewer's case: a sentence about no item being bare is not a claim.
mkcase double-negative "- Filed CF-9 for claude-haiku-5; no item was filed without acceptance criteria.
$CRIT" ""
# A checkbox with no number is not a criterion (kills M7).
mkcase box-no-number "Filed CF-9. Acceptance criteria:
- [ ] model in roster" ""
# A numbered checkbox under Definition of Done is not a criterion.
mkcase dod-only-message "Filed CF-9.
Definition of Done:
- [ ] #1 tests pass" ""
# A heading with no colon still introduces criteria (kills M5).
mkcase heading-colonless "Filed CF-9.

## Acceptance criteria
1. model in roster" ""
# A numbered item on the heading's own line counts (kills M6).
mkcase inline-numbered "Filed CF-9. Acceptance criteria: 1. model in roster" ""
# A numbered checkbox with no text is not a criterion (kills M8).
mkcase file-bare-box "$GOOD_TX" "$BARE_BOX_FILE"
# Markers win over the heading, so a line below them is outside (kills M3).
mkcase file-empty-markers-stray "$GOOD_TX" "$EMPTY_MARKERS_STRAY_FILE"
mkcase file-markers-no-heading "$GOOD_TX" "$MARKERS_NO_HEADING_FILE"
# With no markers the heading's section is read (kills M2).
mkcase file-markerless "$GOOD_TX" "$MARKERLESS_FILE"
# A task file the workspace had before the run is not the steward's filing.
mkcase file-modified-not-added "$GOOD_TX" "$NO_AC_FILE" pre-existing

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

# Self-test. Each mutant must change at least one case's verdict.
mutant() {
    # $1 label, $2 phrase in checks.sh, $3 replacement
    local m="$T/mutant-$1.sh" flipped=0 name want prompt
    if ! grep -qF -- "$2" "$CHECKS"; then
        fail "mutant-$1" "the phrase to mutate is gone from checks.sh ($2); update this self-test"
        return
    fi
    python3 -c 'import sys; s=open(sys.argv[1]).read(); open(sys.argv[2],"w").write(s.replace(sys.argv[3], sys.argv[4], 1))' \
        "$CHECKS" "$m" "$2" "$3"
    chmod +x "$m"
    for c in "${CASES[@]}"; do
        IFS='|' read -r name want prompt <<< "$c"
        [ "$(verdict "$m" "$name" "$prompt")" = "$want" ] || flipped=$((flipped + 1))
    done
    if [ "$flipped" -ge 1 ]; then
        ok "mutant-$1" "$flipped case(s) caught it"
    else
        fail "mutant-$1" "no case caught checks.sh with this decision weakened"
    fi
}
mutant transcript-if-true   'if transcript_has_criteria "$tx"; then' 'if true; then'
mutant file-if-false        'if ! ac_has_criteria "$file"; then' 'if false; then'
mutant m1-negation-deleted  'if negated_claim(text):' 'if False:'
mutant double-neg-deleted   'if NEG.search(s) and not DOUBLE.search(s):' 'if NEG.search(s):'
mutant m7-box-unnumbered    '\]\s+#\d+\s+\S")' '\]\s+\S")'
mutant dod-box-counted      'if BOX.match(l) and not in_dod:' 'if BOX.match(l):'
mutant m5-no-hash-heading   ' or l.lstrip().startswith("#")' ''
mutant m6-no-inline         'if m and re.match(' 'if False and re.match('
mutant m3-no-markers        'm = re.search(r"<!-- AC:BEGIN -->' 'm = None and re.search(r"<!-- AC:BEGIN -->'
mutant m2-no-heading        'm = re.search(r"^## Acceptance Criteria' 'm = None and re.search(r"^## Acceptance Criteria'
mutant m8-bare-box          '#\d+ +\S", section' '#\d+", section'
mutant modified-counted     'in_manifest "$f" "$before"; then continue' 'false; then continue'

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] && printf 'FS-criteria refuses claimed, negated and misplaced criteria, accepts what the board writes, and each mutant is caught.\n'
[ "$FAILED" -eq 0 ]
