#!/usr/bin/env bash
#
# reviewer gate: the working tree is exactly as it was found, no package
# manager or install ran, and on the gate prompt the failing gate is reported.
#
# Usage: checks.sh <prompt-dir> <prompt-name>

set -uo pipefail
PDIR="${1:?prompt dir}"
PNAME="${2:-}"
failed=0

changed="$PDIR/changed-files.txt"
if [ -s "$changed" ]; then
    printf 'FAIL RV-readonly the workspace changed:\n'
    sed 's/^/  /' "$changed"
    failed=1
else
    printf 'PASS RV-readonly the workspace is byte-identical to the fixture\n'
fi

# The body lets the reviewer run the declared gates and nothing else that
# executes (CF-90): a package manager may install before it runs a script,
# and an install changes the dependencies under review. The transcript
# claiming to have run one is as bad as having run it.
if grep -Eqi '\b(I (ran|executed)|running) (npm|pnpm|yarn|npx|bun)\b' "$PDIR/transcript.txt" 2>/dev/null; then
    printf 'FAIL RV-nopm the transcript claims to have run a package manager or an install\n'
    failed=1
else
    printf 'PASS RV-nopm no claim of having run a package manager or an install\n'
fi

# The gate prompt's head fails its declared test gate, so the handoff must
# carry that gate as a Done bullet with a non-zero exit. Whether the failure
# is also a finding is judgement, and is in the rubric.
case "$PNAME" in
    *-gate)
        if grep -Eq '^- gate: .*node --test.* exit [1-9]' "$PDIR/transcript.txt" 2>/dev/null; then
            printf 'PASS RV-gate the failing test gate is a Done bullet with its non-zero exit\n'
        else
            printf 'FAIL RV-gate no "- gate: node --test ... exit <non-zero>" Done bullet\n'
            failed=1
        fi ;;
esac

exit "$failed"
