#!/usr/bin/env bash
#
# handoff-parity.sh - prove the two handoff validators agree.
#
# The handoff format has two machine readers and they have to be the same rule
# set, or CI fails a handoff production accepts and production sends back a
# handoff CI passed:
#
#   production  claude/coder-fleet/hooks/board-subagent-stop.sh, on the
#               `last_assistant_message`. Exit 2 means "malformed,
#               re-emit".
#   CI          evals/lib/handoff-check.sh, on the final assistant message of
#               an eval run. Exit 1 means "gate failed".
#
# This runs both over every case in evals/fixtures/handoff-cases/ and compares
# their verdicts with each other and with expected.tsv. It exits non-zero if
# any case disagrees or if any verdict is not the expected one. It also fails
# if valid-review-finding-not-blocker.txt is not a byte-for-byte copy of the
# handoff skill's "A finding is not a blocker" example.
#
# Usage:  evals/lib/handoff-parity.sh [-v]
#           -v  also print each implementation's reasons for every case
#
# Nothing here touches the board: the hook runs with CODER_FLEET_BOARD=off
# and a throwaway config and state directory.

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)
HARNESS_ROOT=$(cd "$EVAL_ROOT/.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)

CASES_DIR="$EVAL_ROOT/fixtures/handoff-cases"
EXPECTED="$CASES_DIR/expected.tsv"
CHECK="$LIB_DIR/handoff-check.sh"
HOOK="$PLUGIN_ROOT/hooks/board-subagent-stop.sh"

for f in "$EXPECTED" "$CHECK" "$HOOK"; do
    [ -f "$f" ] || { printf 'handoff-parity: missing %s\n' "$f" >&2; exit 2; }
done
command -v jq >/dev/null 2>&1 || {
    printf 'handoff-parity: jq is needed to drive the hook\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/handoff-parity.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/config" "$TMP/state"

export CODER_FLEET_CONFIG_DIR="$TMP/config"
export CODER_FLEET_STATE_DIR="$TMP/state"
export CODER_FLEET_BOARD=off
export BOARD_DRY_RUN=1

hook_verdict() {
    # $1 message file. Drives the real SubagentStop hook.
    local f="$1" rc
    jq -n --rawfile message "$f" \
        '{session_id:"parity",agent_id:"parity",agent_type:"coder",
          last_assistant_message:$message}' \
      | "$HOOK" > "$TMP/hook.out" 2> "$TMP/hook.err"
    rc=$?
    case "$rc" in
        0) printf 'valid\n' ;;
        2) printf 'invalid\n' ;;
        *) printf 'error(%s)\n' "$rc" ;;
    esac
}

check_verdict() {
    # $1 message file. Runs the CI gate.
    local f="$1" rc
    "$CHECK" "$f" > "$TMP/check.out" 2>&1
    rc=$?
    case "$rc" in
        0) printf 'valid\n' ;;
        1) printf 'invalid\n' ;;
        *) printf 'error(%s)\n' "$rc" ;;
    esac
}

printf '%-42s %-9s %-9s %-9s %s\n' CASE EXPECTED HOOK GATE VERDICT
printf '%-42s %-9s %-9s %-9s %s\n' \
    "------------------------------------------" "--------" "--------" "--------" "-------"

failed=0
cases=0
while IFS=$'\t' read -r name expected covers; do
    case "$name" in ''|'#'*) continue ;; esac
    file="$CASES_DIR/$name.txt"
    if [ ! -f "$file" ]; then
        printf '%-42s %-9s %-9s %-9s %s\n' "$name" "$expected" "-" "-" "MISSING FILE"
        failed=1
        continue
    fi
    cases=$((cases + 1))
    hv=$(hook_verdict "$file")
    cv=$(check_verdict "$file")
    if [ "$hv" != "$cv" ]; then
        verdict="DISAGREE"
        failed=1
    elif [ "$hv" != "$expected" ]; then
        verdict="AGREE, WRONG"
        failed=1
    else
        verdict="ok"
    fi
    printf '%-42s %-9s %-9s %-9s %s\n' "$name" "$expected" "$hv" "$cv" "$verdict"
    if [ "$VERBOSE" -eq 1 ]; then
        printf '    covers: %s\n' "$covers"
        printf '    hook:\n'
        sed 's/^/      /' "$TMP/hook.err" | grep -v '\[SubagentStop\]' || true
        printf '    gate:\n'
        sed 's/^/      /' "$TMP/check.out"
    fi
done < "$EXPECTED"

printf '\n%s cases\n' "$cases"

# The skill's "A finding is not a blocker" example is proven legal only through
# its fixture copy, so the two have to be the same bytes. The example is the
# first fenced block after that heading.
SKILL="$PLUGIN_ROOT/skills/handoff/SKILL.md"
EXAMPLE_FIXTURE="$CASES_DIR/valid-review-finding-not-blocker.txt"
awk '
    $0 == "## A finding is not a blocker" { seen = 1; next }
    seen && !inside && $0 == "```" { inside = 1; next }
    inside && $0 == "```" { exit }
    inside { print }
' "$SKILL" > "$TMP/example.txt"
if [ -s "$TMP/example.txt" ] && cmp -s "$TMP/example.txt" "$EXAMPLE_FIXTURE"; then
    printf 'The skill example "A finding is not a blocker" matches %s byte for byte.\n' "${EXAMPLE_FIXTURE##*/}"
else
    printf 'The skill example "A finding is not a blocker" and %s differ. Keep them identical.\n' "${EXAMPLE_FIXTURE##*/}"
    [ "$VERBOSE" -eq 1 ] && diff "$TMP/example.txt" "$EXAMPLE_FIXTURE"
    failed=1
fi

if [ "$failed" -eq 0 ]; then
    printf 'The hook and the eval gate agree on every case, and every verdict is the expected one.\n'
    exit 0
fi
printf 'Parity broken. Fix whichever side moved; they are one rule set.\n'
exit 1
