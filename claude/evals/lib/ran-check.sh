#!/usr/bin/env bash
#
# ran-check.sh - the rule both suites apply to a section that exits 0. Sourced,
# never run.
#
# A contract cut down to nothing that checks anything - empty, a bare shebang,
# comments, an `exit 0` before its first check - still exits 0, and only what it
# prints tells that apart from a pass. So a section that exits 0 passes only if
# its output carries a result line from a check it ran: a positive count of
# passes or cases, bun's count of passing tests, or an `ok` line. A section that
# marked itself skipped is exempt, by writing the file named in
# CHECK_ALL_SKIP_FILE, and so is any section the suite lists in NO_COUNT_SECTIONS
# before it calls this, each of which runs a check that has no count to print.
# Nothing else is.
#
#   . "$LIB_DIR/ran-check.sh"
#   NO_COUNT_SECTIONS=(label ...)       # optional; the suite's own exemptions
#   msg=$(ran_no_check LABEL SKIPFILE OUTFILE)    # for a section that exited 0
#       Prints the complaint and returns 0 when the section ran no check; prints
#       nothing and returns 1 when it did, marked itself skipped or is exempt.

RESULT_LINE='(^|[^0-9])[1-9][0-9]* (passed|cases)|^[[:space:]]*[1-9][0-9]* pass$|^[[:space:]]*ok([[:space:]]|$)'

ran_no_check() {
    local label="$1" skipfile="$2" outfile="$3" s
    [ -e "$skipfile" ] && return 1
    # ${arr[@]+...} keeps an unset or empty list from tripping set -u on bash 3.2.
    for s in ${NO_COUNT_SECTIONS[@]+"${NO_COUNT_SECTIONS[@]}"}; do
        [ "$s" = "$label" ] && return 1
    done
    grep -Eq "$RESULT_LINE" "$outfile" && return 1
    printf '%s ran no check: it exited 0 but printed no count and no ok line\n' "$label"
    return 0
}
