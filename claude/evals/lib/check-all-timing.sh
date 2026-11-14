#!/usr/bin/env bash
#
# check-all-timing.sh - check-all.sh prints how long each of its sections took.
#
# A suite past its budget has to show where the time goes. This runs a copy
# of check-all.sh in a scratch tree where every section
# is a stub, one stub sleeping and one failing, and proves three things: every
# section header gets a closing line carrying its duration, whether it passed
# or failed; the duration is measured rather than printed as a constant; and
# the run ends with the total. The same run proves that a section whose script
# runs no check fails however little is left of it, and that a section on
# check-all's list of the ones that print no count still passes.
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
         "$ROOT/claude/coder-fleet/workflows" "$ROOT/claude/coder-fleet/boards/node_modules" \
         "$ROOT/claude/coder-fleet/.claude-plugin" "$ROOT/claude/scripts" "$ROOT/.claude-plugin" "$TMP/bin"

stub() { # $1 path, $2 body
    printf '#!/usr/bin/env bash\n%s\n' "$2" > "$1"
    chmod +x "$1"
}

cp "$CHECK_ALL" "$ROOT/claude/evals/lib/check-all.sh"
# A stub contract passes the way a real one does: it prints a count.
RAN='printf "1 passed, 0 failed\n"'
for f in "$LIB_DIR"/*.sh; do
    name=$(basename "$f")
    case "$name" in check-all.sh) continue ;; ran-check.sh) cp "$f" "$ROOT/claude/evals/lib/$name"; continue ;; esac
    stub "$ROOT/claude/evals/lib/$name" "$RAN; exit 0"
done
for f in "$LIB_DIR"/*.mjs; do
    printf 'console.log("1 passed, 0 failed");\n' > "$ROOT/claude/evals/lib/$(basename "$f")"
done
# One section sleeps, so a duration printed as a constant is caught, and one
# fails, so a failing section is timed as well as a passing one.
stub "$ROOT/claude/evals/lib/handoff-parity.sh" "sleep 1.2; $RAN; exit 0"
stub "$ROOT/claude/evals/lib/roster-contract.sh" 'exit 1'
# Three slow sections, so a run that waits for each in turn is caught: run at
# once they cost about two seconds, one after another at least six.
stub "$ROOT/claude/evals/lib/worktree-base-contract.sh" "sleep 2; $RAN; exit 0"
stub "$ROOT/claude/evals/lib/scope-hook-contract.sh" "sleep 2; $RAN; exit 0"
stub "$ROOT/claude/evals/lib/disabled-agents-contract.sh" "sleep 2; $RAN; exit 0"
# A section that reads stdin would hang a run started from a hook or a
# terminal; each runs with nothing to read.
stub "$ROOT/claude/evals/lib/task-tools-contract.sh" "if read -r -t 5 _; then echo 'stdin was open'; exit 1; fi; $RAN; exit 0"
# A section whose own shell is killed never writes its rc file, the way an OOM
# kill or a stray signal would leave it. Its parent is that shell.
stub "$ROOT/claude/evals/lib/prune-worktrees-contract.sh" 'kill -9 "$PPID"; exit 0'
# A contract cut down to nothing that checks anything exits 0 having run no
# check, so it must fail, not pass, whatever is left of it: nothing at all, a
# bare shebang, a shebang and `exit 0`, comments, an exit before the first
# check, or a count of nothing.
: > "$ROOT/claude/evals/lib/agents-command-contract.sh"
printf '#!/usr/bin/env bash\n' > "$ROOT/claude/evals/lib/fast-forward-contract.sh"
stub "$ROOT/claude/evals/lib/challenge-gate-contract.sh" 'exit 0'
stub "$ROOT/claude/evals/lib/spec-editor-checks-contract.sh" '# every check was here'
stub "$ROOT/claude/evals/lib/lead-checks-contract.sh" "exit 0; $RAN"
stub "$ROOT/claude/evals/lib/tech-editor-checks-contract.sh" 'printf "0 passed, 0 failed\n"'
stub "$ROOT/claude/coder-fleet/hooks/enforce-disabled-agents.sh" 'exit 0'
stub "$ROOT/claude/scripts/gen-glossary-rule.sh" 'exit 0'
printf 'const x = 1;\n' > "$ROOT/claude/coder-fleet/workflows/stub.js"
printf '{"version":"1.0.0"}\n' > "$ROOT/claude/coder-fleet/.claude-plugin/plugin.json"
printf '{"plugins":[{"name":"coder-fleet","version":"1.0.0"}]}\n' > "$ROOT/.claude-plugin/marketplace.json"
stub "$TMP/bin/bun" 'printf " 1 pass\n"; exit 0'
stub "$TMP/bin/bunx" 'exit 0'

OUT="$TMP/out"
# A serial check-all hands its own setting to this section; the stub run below
# is the parallel one whatever the caller chose.
unset CHECK_ALL_SERIAL
printf 'a line a section must never read\n' | PATH="$TMP/bin:$PATH" bash "$ROOT/claude/evals/lib/check-all.sh" > "$OUT" 2>&1
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

if grep -Eq '^prune-worktrees: FAILED( .*)? \([0-9]+\.[0-9]s\)$' "$OUT" && printf '%s\n' "$(grep '^FAILED: ' "$OUT")" | grep -q ' prune-worktrees\b'; then
    pass 'a section killed before it writes its result counts as failed, and is timed'
else
    fail "a section killed before it writes its result counts as failed, and is timed (got '$(grep '^prune-worktrees: ' "$OUT")')"
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

# The sections run at once: the run takes well under the sum of its sections.
sum=$(sed -nE 's/^.*: (ok|FAILED|skipped)( .*)? \(([0-9]+\.[0-9])s\)$/\3/p' "$OUT" | awk '{ s += $1 } END { printf "%.1f", s }')
total=$(sed -n 's/^total: \([0-9]*\.[0-9]\)s$/\1/p' "$OUT")
if [ -n "$total" ] && awk -v t="$total" -v s="$sum" 'BEGIN { exit !(t + 2.5 < s) }'; then
    pass "sections run at once: ${total}s in total for ${sum}s of sections"
else
    fail "sections run at once (total '${total}'s for ${sum}s of sections)"
fi

# Output stays in the script's order, not the order the sections finished in.
order=$(sed -n 's/^=== \(.*\) ===$/\1/p' "$OUT" | tr '\n' '|')
case "$order" in
    'board install|syntax|'*'|handoff-parity|scope-hook-contract|'*'|versions|')
        pass 'sections print in the order the script lists them' ;;
    *)  fail "sections print in the order the script lists them (got $order)" ;;
esac

for c in 'agents-command:empty' 'fast-forward:a bare shebang' 'challenge-gate:a shebang and exit 0' \
         'spec-editor-checks:comments only' 'lead-checks:an exit before its checks' 'tech-editor-checks:a count of nothing'; do
    label=${c%%:*}; what=${c#*:}
    if grep -Eq "^$label: FAILED \(" "$OUT" && grep -q "^$label ran no check" "$OUT"; then
        pass "a section whose script is $what fails and says it ran no check"
    else
        fail "a section whose script is $what fails and says it ran no check (got '$(grep "^$label: " "$OUT")')"
    fi
done

# A section on check-all's list of the ones that print no count still passes
# with nothing to say: the glossary stub prints nothing.
if grep -Eq '^glossary: ok \(' "$OUT"; then
    pass 'a section exempt from printing a count passes without one'
else
    fail "a section exempt from printing a count passes without one (got '$(grep '^glossary: ' "$OUT")')"
fi

if grep -Eq '^task-tools: ok \(' "$OUT"; then
    pass 'no section is handed the caller'"'"'s stdin'
else
    fail 'no section is handed the caller'"'"'s stdin'
fi

if [ "$FAILED" -ne 0 ]; then
    printf '\n--- check-all output ---\n'
    cat "$OUT"
    printf '\ncheck-all-timing: check-all.sh does not time every section.\n'
    exit 1
fi
printf '\ncheck-all-timing: every section of check-all.sh prints its duration, and the run prints its total.\n'
