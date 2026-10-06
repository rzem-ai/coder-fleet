#!/usr/bin/env bash
#
# check-all-timing.sh - check-all.sh prints how long each of its sections took.
#
# CF-56: the suite grew past its budget and nobody could see where the time
# went. This runs a copy of check-all.sh in a scratch tree where every section
# is a stub, one stub sleeping and one failing, and proves three things: every
# section header gets a closing line carrying its duration, whether it passed
# or failed; the duration is measured rather than printed as a constant; and
# the run ends with the total.
#
# Usage:  evals/lib/check-all-timing.sh

set -uo pipefail

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
CHECK_ALL="$LIB_DIR/check-all.sh"
[ -f "$CHECK_ALL" ] || { printf 'check-all-timing: missing %s\n' "$CHECK_ALL" >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/check-all-timing.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

ROOT="$TMP/repo"
mkdir -p "$ROOT/claude/evals/lib" "$ROOT/claude/coder-fleet/hooks" "$ROOT/claude/coder-fleet/scripts" \
         "$ROOT/claude/coder-fleet/workflows" "$ROOT/claude/coder-fleet/board/node_modules" \
         "$ROOT/claude/coder-fleet/.claude-plugin" "$ROOT/claude/scripts" "$ROOT/.claude-plugin" "$TMP/bin"

stub() { # $1 path, $2 body
    printf '#!/usr/bin/env bash\n%s\n' "$2" > "$1"
    chmod +x "$1"
}

cp "$CHECK_ALL" "$ROOT/claude/evals/lib/check-all.sh"
for f in "$LIB_DIR"/*.sh; do
    name=$(basename "$f")
    case "$name" in check-all.sh) continue ;; esac
    stub "$ROOT/claude/evals/lib/$name" 'exit 0'
done
for f in "$LIB_DIR"/*.mjs; do
    printf '\n' > "$ROOT/claude/evals/lib/$(basename "$f")"
done
# One section sleeps, so a duration printed as a constant is caught, and one
# fails, so a failing section is timed as well as a passing one.
stub "$ROOT/claude/evals/lib/handoff-parity.sh" 'sleep 1.2; exit 0'
stub "$ROOT/claude/evals/lib/roster-contract.sh" 'exit 1'
stub "$ROOT/claude/coder-fleet/hooks/enforce-disabled-agents.sh" 'exit 0'
stub "$ROOT/claude/scripts/gen-glossary-rule.sh" 'exit 0'
stub "$ROOT/claude/scripts/gen-agent-pairs.sh" 'exit 0'
printf 'const x = 1;\n' > "$ROOT/claude/coder-fleet/workflows/stub.js"
printf '{"version":"1.0.0"}\n' > "$ROOT/claude/coder-fleet/.claude-plugin/plugin.json"
printf '{"plugins":[{"name":"coder-fleet","version":"1.0.0"}]}\n' > "$ROOT/.claude-plugin/marketplace.json"
stub "$TMP/bin/bun" 'exit 0'
stub "$TMP/bin/bunx" 'exit 0'

OUT="$TMP/out"
PATH="$TMP/bin:$PATH" bash "$ROOT/claude/evals/lib/check-all.sh" > "$OUT" 2>&1
STATUS=$?

FAILED=0
pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }

if [ "$STATUS" -eq 1 ]; then
    pass 'a failing section makes the run exit 1'
else
    fail "a failing section makes the run exit 1 (got $STATUS)"
fi

headers=0
while IFS= read -r label; do
    headers=$((headers + 1))
    if grep -Eq "^$label: (ok|FAILED|skipped)( .*)? \([0-9]+\.[0-9]s\)\$" "$OUT"; then
        pass "section '$label' prints its duration"
    else
        fail "section '$label' prints its duration"
    fi
done < <(sed -n 's/^=== \(.*\) ===$/\1/p' "$OUT")

if [ "$headers" -ge 20 ]; then
    pass "the run printed $headers section headers"
else
    fail "the run printed only $headers section headers"
fi

if grep -Eq '^roster-contract: FAILED \([0-9]+\.[0-9]s\)$' "$OUT"; then
    pass 'a failing section is timed'
else
    fail 'a failing section is timed'
fi

slept=$(sed -n 's/^handoff-parity: ok (\([0-9]*\.[0-9]\)s)$/\1/p' "$OUT")
if [ -n "$slept" ] && awk -v s="$slept" 'BEGIN { exit !(s >= 1.0 && s < 10) }'; then
    pass "a section that sleeps 1.2 s reports ${slept}s"
else
    fail "a section that sleeps 1.2 s reports its real duration (got '${slept}')"
fi

if grep -Eq '^total: [0-9]+\.[0-9]s$' "$OUT"; then
    pass 'the run ends with its total duration'
else
    fail 'the run ends with its total duration'
fi

if [ "$FAILED" -ne 0 ]; then
    printf '\n--- check-all output ---\n'
    cat "$OUT"
    printf '\ncheck-all-timing: check-all.sh does not time every section.\n'
    exit 1
fi
printf '\ncheck-all-timing: every section of check-all.sh prints its duration, and the run prints its total.\n'
