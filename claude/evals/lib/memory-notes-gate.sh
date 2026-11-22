#!/usr/bin/env bash
#
# memory-notes-gate.sh - no workspace gate counts an agent's own memory notes
# as a change to the workspace, and each still catches every other write. The
# gates are the reviewer's, scout's and researcher's read-only gates, the
# spec-writer's path gate, the spec-editor's and tech-editor's scope gates, the
# lead's unordered item gate and the tech-writer's dash gate.
#
# An agent with `memory: project` keeps notes under .claude/agent-memory/ at
# the top of the checkout it runs in (glossary, "Memory"). A first pass over
# the evals failed RV-readonly on three reviewer prompts and SW-paths on three
# spec-writer prompts for that alone, and a second pass failed SE-scope on one
# spec-editor prompt and TW-dashes on three tech-writer prompts the same way.
# Every fleet agent has `memory: project`, so every gate that reads the list of
# changed files is held to it here. Leaving those notes out must not leave
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
# starts. Each is created, or appended to if it is already there, with
# STUB_TEXT, or the word stub.
STUB="$TMP/claude"
cat > "$STUB" <<'EOF'
#!/usr/bin/env bash
for p in ${STUB_WRITES:-}; do
    mkdir -p "$(dirname "$p")"
    printf '%s\n' "${STUB_TEXT:-stub}" >> "$p"
done
printf '## Done\n- Stub.\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n'
EOF
chmod +x "$STUB"

N=0
expect() {
    # $1 label, $2 agent, $3 prompt, $4 gate id, $5 PASS or FAIL, $6 writes,
    # $7 the text written, if not the word stub
    local label="$1" agent="$2" prompt="$3" gate="$4" want="$5" out got
    N=$((N + 1))
    out="$TMP/out-$N"
    STUB_WRITES="$6" STUB_TEXT="${7:-}" EVAL_CLAUDE_BIN="$STUB" EVAL_OUTPUT_FORMAT=text \
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

MEM_SC='.claude/agent-memory/coder-fleet-scout/MEMORY.md'
MEM_RS='.claude/agent-memory/coder-fleet-researcher/MEMORY.md'
MEM_SE='.claude/agent-memory/coder-fleet-spec-editor/MEMORY.md'
MEM_TE='.claude/agent-memory/coder-fleet-tech-editor/MEMORY.md'
TE_DOC='docs/guides/cache-cli.md'
MEM_LD='.claude/agent-memory/coder-fleet-lead/MEMORY.md'
MEM_TW='.claude/agent-memory/coder-fleet-tech-writer/MEMORY.md'
SE_DRAFT=$(sed -n 's/^#!draft:[[:space:]]*//p' "$EVAL_ROOT"/spec-editor/prompts/02-*.md | head -1)
DASH=$(printf 'a note \342\200\224 with an em dash')

printf '\nThe scout and researcher read-only gates leave out their memory notes and nothing else\n'
expect 'scout: memory notes alone pass'                 scout 01 SC-readonly PASS "$MEM_SC"
expect 'scout: a new project file fails'                scout 01 SC-readonly FAIL "$MEM_SC NOTES.md"
expect 'scout: other files under .claude/ fail'         scout 01 SC-readonly FAIL '.claude/settings.json'
expect 'researcher: memory notes alone pass'            researcher 01 RS-readonly PASS "$MEM_RS"
expect 'researcher: a new project file fails'           researcher 01 RS-readonly FAIL "$MEM_RS NOTES.md"
expect 'researcher: other files under .claude/ fail'    researcher 01 RS-readonly FAIL '.claude/settings.json'

printf '\nThe spec-editor scope gate leaves out its memory notes and nothing else\n'
expect 'the draft and memory notes pass'                spec-editor 02 SE-scope PASS "$MEM_SE $SE_DRAFT"
expect 'the draft, memory notes and another file fail'  spec-editor 02 SE-scope FAIL "$MEM_SE $SE_DRAFT README.md"
expect 'memory notes without the draft fail'            spec-editor 02 SE-scope FAIL "$MEM_SE"
expect 'other files under .claude/ fail'                spec-editor 02 SE-scope FAIL "$SE_DRAFT .claude/settings.json"

printf '\nThe tech-editor scope gate leaves out its memory notes and nothing else\n'
expect 'the document and memory notes pass'             tech-editor 02 TE-scope PASS "$MEM_TE $TE_DOC"
expect 'the document, notes and another file fail'      tech-editor 02 TE-scope FAIL "$MEM_TE $TE_DOC NOTES.md"
expect 'other files under .claude/ fail'                tech-editor 02 TE-scope FAIL "$TE_DOC .claude/settings.json"

printf '\nThe lead unordered-item gate leaves out its memory notes and nothing else\n'
expect 'memory notes alone pass'                        lead 03 LD-gate PASS "$MEM_LD"
expect 'memory notes and a written file fail'           lead 03 LD-gate FAIL "$MEM_LD docs/notes.md"

printf '\nThe tech-writer dash gate reads documents and not its memory notes\n'
expect 'a dash in its memory notes passes'              tech-writer 01 TW-dashes PASS "$MEM_TW" "$DASH"
expect 'a dash in a document fails'                     tech-writer 01 TW-dashes FAIL 'README.md' "$DASH"
expect 'a dash elsewhere under .claude/ fails'          tech-writer 01 TW-dashes FAIL '.claude/notes.md' "$DASH"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'A workspace gate counts memory notes as a change, or misses a real one.\n'
    exit 1
fi
printf 'Every workspace gate leaves out the agent'"'"'s memory notes and still catches every other write.\n'
