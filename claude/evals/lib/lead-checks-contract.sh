#!/usr/bin/env bash
#
# lead-checks-contract.sh - the lead eval's gate passes a prose reply and fails
# a reply carrying the handoff's headings.
#
# claude/evals/lead/checks.sh is the mechanical half of the lead's smoke eval,
# and the model runs that exercise it are manual and cost money, so nothing
# would notice LD-nohandoff passing a reply it should fail. This builds the
# result directory run.sh would leave - changed-files.txt and transcript.txt -
# and asserts each verdict.
#
# Usage:  evals/lib/lead-checks-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)
CHECKS="$EVAL_ROOT/lead/checks.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/lead-checks.XXXXXX") || exit 2
trap 'rm -rf "$T"' EXIT

PASSED=0
FAILED=0
ok()   { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"; return 0; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -n 10; return 0; }

# verdict NAME pass|fail PROMPT TRANSCRIPT
verdict() {
    local name="$1" want="$2" prompt="$3" d out rc
    d="$T/$name"
    mkdir -p "$d"
    : > "$d/changed-files.txt"
    printf '%s\n' "$4" > "$d/transcript.txt"
    out=$(bash "$CHECKS" "$d" "$prompt" 2>&1)
    rc=$?
    if { [ "$want" = pass ] && [ "$rc" -eq 0 ]; } || { [ "$want" = fail ] && [ "$rc" -ne 0 ]; }; then
        ok "$name"
    else
        fail "$name (want $want, exit $rc)" "$out"
    fi
}

verdict prose-passes pass 01-route-the-work 'EX-1.1 is reviewed and refresh rotation works on its branch. Not done: it is not merged, and EX-1.2 and EX-1.3 have not started.'
verdict typed-prefix-in-prose-passes pass 04-merge-the-handoffs 'The coder'"'"'s Blocker: line is already in your queue, and the researcher'"'"'s Propose item: line went on EX-1 as a comment.'
verdict done-heading-fails fail 01-route-the-work 'Routed.

## Done
- Routed EX-1.1 to coder.'
verdict decisions-heading-fails fail 02-where-is-it 'Prose first.

## Decisions needed
- None'
verdict trailing-space-heading-fails fail 02-where-is-it 'Prose first.

## Not done  
- Nothing.'
verdict all-four-fail fail 05-auth-diff-escalation '## Done
- x

## Not done
- None

## Unverified
- None

## Decisions needed
- None'

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || exit 1
printf 'The lead eval gate passes a prose reply and fails one carrying handoff headings.\n'
