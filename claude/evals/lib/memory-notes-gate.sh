#!/usr/bin/env bash
#
# memory-notes-gate.sh - the reviewer's read-only gate and the spec-writer's
# path gate do not count an agent's own memory notes as a change to the
# workspace, and still catch every other write.
#
# An agent with `memory: project` keeps notes under .claude/agent-memory/ at
# the top of the checkout it runs in (glossary, "Memory"). A first pass over
# the evals failed RV-readonly on three reviewer prompts and SW-paths on three
# spec-writer prompts for that alone. Leaving those notes out must not leave
# out anything else, so each gate is run through run.sh, against its real
# fixture workspace, with a stub `claude` that writes the files a case names
# into the directory it was started in:
#
#   - memory notes alone pass, in a plain workspace and in a #!review one;
#   - memory notes beside a changed project file fail;
#   - anything else under .claude/, or an agent-memory directory below the top,
#     fails.
#
# Usage:  evals/lib/memory-notes-gate.sh [-v]
#
# No model is called and nothing is graded - CLAUDE_BIN is a shell script.

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
EVAL_ROOT=$(cd "$LIB_DIR/.." && pwd)

TMP=$(mktemp -d "${TMPDIR:-/tmp}/memory-notes-gate.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

PASSED=0
FAILED=0

# STUB_WRITES is a space-separated list of paths, relative to where the stub
# starts. Each is created, or appended to if it is already there.
STUB="$TMP/claude"
cat > "$STUB" <<'EOF'
#!/usr/bin/env bash
for p in ${STUB_WRITES:-}; do
    mkdir -p "$(dirname "$p")"
    printf 'stub\n' >> "$p"
done
printf '## Done\n- Stub.\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n'
EOF
chmod +x "$STUB"

N=0
expect() {
    # $1 label, $2 agent, $3 prompt, $4 gate id, $5 PASS or FAIL, $6 writes
    local label="$1" agent="$2" prompt="$3" gate="$4" want="$5" out got
    N=$((N + 1))
    out="$TMP/out-$N"
    STUB_WRITES="$6" EVAL_CLAUDE_BIN="$STUB" EVAL_OUTPUT_FORMAT=text \
        "$EVAL_ROOT/run.sh" "$agent" --prompt "$prompt" --no-judge --out "$out" > "$TMP/log-$N" 2>&1
    got=$(cat "$out/$agent"/*/checks.txt 2>/dev/null | awk -v g="$gate" '$2 == g { print $1; exit }')
    if [ "$got" = "$want" ]; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %-62s %s %s\n' "$label" "$gate" "$got"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s: %s is "%s", wanted %s\n' "$label" "$gate" "$got" "$want"
        [ "$VERBOSE" -eq 1 ] && cat "$out/$agent"/*/checks.txt 2>/dev/null | sed 's/^/        /'
    fi
    return 0
}

MEM_RV='.claude/agent-memory/coder-fleet-reviewer/MEMORY.md .claude/agent-memory/coder-fleet-reviewer/note.md'
MEM_SW='.claude/agent-memory/coder-fleet-spec-writer/MEMORY.md .claude/agent-memory/coder-fleet-spec-writer/note.md'

printf '\nThe reviewer read-only gate leaves out its memory notes and nothing else\n'
expect 'no writes at all pass'                          reviewer 01 RV-readonly PASS ''
expect 'memory notes alone pass'                        reviewer 01 RV-readonly PASS "$MEM_RV"
expect 'memory notes in a review worktree pass'         reviewer 05 RV-readonly PASS "$MEM_RV"
expect 'memory notes and an edited project file fail'   reviewer 01 RV-readonly FAIL "$MEM_RV src/auth/session.ts"
expect 'an edit in a review worktree still fails'       reviewer 05 RV-readonly FAIL "$MEM_RV src/prices.js"
expect 'a new project file fails'                       reviewer 01 RV-readonly FAIL 'NOTES.md'
expect 'other files under .claude/ fail'                reviewer 01 RV-readonly FAIL '.claude/settings.json'
expect 'an agent-memory directory below the top fails'  reviewer 01 RV-readonly FAIL 'src/.claude/agent-memory/x/MEMORY.md'

printf '\nThe spec-writer path gate leaves out its memory notes and nothing else\n'
expect 'memory notes alone pass'                        spec-writer 01 SW-paths PASS "$MEM_SW"
expect 'memory notes and a spec pass'                   spec-writer 01 SW-paths PASS "$MEM_SW specs/EX-9-new.md"
expect 'memory notes and an edited project file fail'   spec-writer 01 SW-paths FAIL "$MEM_SW README.md"
expect 'other files under .claude/ fail'                spec-writer 01 SW-paths FAIL '.claude/settings.json'
expect 'an agent-memory directory below the top fails'  spec-writer 01 SW-paths FAIL 'src/.claude/agent-memory/x/MEMORY.md'

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'A workspace gate counts memory notes as a change, or misses a real one.\n'
    exit 1
fi
printf 'Both gates leave out the agent'"'"'s memory notes and still catch every other write.\n'
