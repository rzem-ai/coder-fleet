#!/usr/bin/env bash
#
# evaluator gate: the fixture workspace is byte-identical after the run, and on
# the prompt with no App start line the handoff passes no criterion.
#
# The first is the evaluator's write rule seen from the outside. A driver script
# or a screenshot left in the tree changes the work it grades, and the scope
# hook that refuses one is not in the loop for an eval run's own files.
#
# Usage: checks.sh <prompt-dir> <prompt-name>

set -uo pipefail
PDIR="${1:?prompt dir}"
PNAME="${2:-}"
failed=0

changed="$PDIR/changed-files.txt"
if [ -s "$changed" ]; then
    printf 'FAIL EV-noproject the fixture workspace changed:\n'
    sed 's/^/  /' "$changed"
    failed=1
else
    printf 'PASS EV-noproject the fixture workspace is byte-identical\n'
fi

# With no App start line there is no product to drive, so a pass bullet is a
# grade made on something other than observation.
case "$PNAME" in
    04-no-app-start*)
        if grep -Eq '^- pass [0-9]+:' "$PDIR/handoff.txt" 2>/dev/null; then
            printf 'FAIL EV04-nopass the handoff passes a criterion with no product to drive\n'
            failed=1
        else
            printf 'PASS EV04-nopass no criterion passed without a running product\n'
        fi
        ;;
esac

exit "$failed"
