#!/usr/bin/env bash
#
# memory-state-contract.sh - every agent's memory reaches the state worktree
# and is committed on coder-fleet/state, never on the default branch or a
# feature branch (CF-183.2).
#
# Claude Code writes an agent's memory under its spawn cwd and refuses a tool
# write anywhere else, so hooks/memory-state.sh moves each change: PostToolUse
# merges the written file into the state worktree and commits it there;
# SubagentStart fences an agent worktree's memory out of its own commits and
# hands the agent the state worktree's newer index; SubagentStop and SessionEnd
# carry what a tool call never showed and put the main checkout's copy back.
#
# Everything here is a real repository: a bare remote, its main checkout, the
# state worktree and agent worktrees cut under .claude/worktrees/, the way the
# harness cuts them. No model, no network, no board binary.
#
# Usage:  evals/lib/memory-state-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
PLUGIN_ROOT=$(cd "$LIB_DIR/../../coder-fleet" && pwd)
HOOK="$PLUGIN_ROOT/hooks/memory-state.sh"

for tool in git jq python3; do
    command -v "$tool" >/dev/null 2>&1 || { printf 'memory-state-contract: %s is needed\n' "$tool" >&2; exit 2; }
done

TMP=$(mktemp -d "${TMPDIR:-/tmp}/memory-state.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P)
trap 'rm -rf "$TMP"' EXIT
export CODER_FLEET_STATE_DIR="$TMP/fleet-state"
export BOARD_LOG_FILE="$TMP/hooks.log"
unset CODER_FLEET_BOARD_NO_COMMIT

PASSED=0
FAILED=0
ok() {
    # $1 label, $2 0 for pass, $3 detail on failure
    if [ "$2" -eq 0 ]; then
        PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"
    else
        FAILED=$((FAILED + 1)); printf '  FAIL  %s\n' "$1"; [ -n "${3:-}" ] && printf '        %s\n' "${3:0:400}"
    fi
    return 0
}
g() { git -C "$@"; }

REMOTE="$TMP/remote.git"
MAIN="$TMP/repo"
STATE="$MAIN/.claude/worktrees/coder-fleet-state"
MEM=".claude/agent-memory"

g "$TMP" init -q --bare -b main "$REMOTE"
mkdir -p "$MAIN/.boards/tasks" "$MAIN/$MEM/coder-fleet-coder" "$MAIN/$MEM/coder-fleet-lead"
g "$MAIN" init -q -b main
g "$MAIN" config user.email t@t
g "$MAIN" config user.name t
printf 'project_name: "t"\nauto_commit: true\n' > "$MAIN/.boards/config.yml"
printf -- '- [base](base.md) - from the default branch\n' > "$MAIN/$MEM/coder-fleet-coder/MEMORY.md"
printf -- '- [lead base](base.md)\n' > "$MAIN/$MEM/coder-fleet-lead/MEMORY.md"
printf 'product\n' > "$MAIN/product.txt"
g "$MAIN" add -A
g "$MAIN" commit -q -m base
g "$MAIN" remote add origin "$REMOTE"
g "$MAIN" push -q -u origin main
printf '/.claude/worktrees/\n' >> "$MAIN/.git/info/exclude"
g "$MAIN" worktree add -q -b coder-fleet/state "$STATE" main
BASE_SHA=$(g "$MAIN" rev-parse main)

add_agent() { g "$MAIN" worktree add -q -b "$1" "$MAIN/.claude/worktrees/$1" main; printf '%s' "$MAIN/.claude/worktrees/$1"; }

event() {
    # $1 hook_event_name, $2 agent_type, $3 cwd, $4 tool, $5 file_path
    jq -nc --arg e "$1" --arg a "$2" --arg c "$3" --arg t "$4" --arg f "$5" \
        '{hook_event_name:$e,agent_type:$a,cwd:$c,session_id:"s1",agent_id:"a1"} + (if $t == "" then {} else {tool_name:$t,tool_input:{file_path:$f}} end)'
}
run_hook() {
    # $1 mode, $2 event JSON. Prints the hook's stdout; its exit code is checked.
    local out code
    out=$(printf '%s' "$2" | CLAUDE_PROJECT_DIR="$MAIN" bash "$HOOK" "$1" 2>>"$TMP/hook.err")
    code=$?
    [ "$code" -eq 0 ] || printf 'exit %s for %s\n' "$code" "$1" >> "$TMP/hook.err"
    printf '%s' "$out"
}
state_has() { g "$STATE" show "coder-fleet/state:$1" 2>/dev/null; }
count_line() { grep -cF -- "$2" <<<"$1"; }

# ------------------------------------------------ a coder in its own worktree
A=$(add_agent agent-x)
START_OUT=$(run_hook start "$(event SubagentStart coder-fleet:coder "$A" "" "")")
printf -- '- [base](base.md) - from the default branch\n- [x note](x.md) - learned in agent-x\n' > "$A/$MEM/coder-fleet-coder/MEMORY.md"
printf 'x body\n' > "$A/$MEM/coder-fleet-coder/x.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Edit "$A/$MEM/coder-fleet-coder/MEMORY.md")" >/dev/null
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Write "$A/$MEM/coder-fleet-coder/x.md")" >/dev/null

idx=$(state_has "$MEM/coder-fleet-coder/MEMORY.md")
ok "a worktree agent's edit is committed on the state branch" "$(count_line "$idx" 'learned in agent-x' | grep -qx 1; echo $?)" "$idx"
ok "and its new note too" "$([ "$(state_has "$MEM/coder-fleet-coder/x.md")" = 'x body' ]; echo $?)"
ok "the state worktree is left clean" "$([ -z "$(g "$STATE" status --porcelain)" ]; echo $?)" "$(g "$STATE" status --porcelain)"
subj=$(g "$STATE" log -1 --format='%s%n%b' coder-fleet/state)
ok "with a memory subject and a Board-Writer trailer" "$(grep -q '^Board-Writer: memory' <<<"$subj" && grep -q 'coder-fleet-coder' <<<"$subj"; echo $?)" "$subj"
ok "the default branch has no new commit" "$([ "$(g "$MAIN" rev-parse main)" = "$BASE_SHA" ]; echo $?)"
ok "nor the agent's branch" "$([ "$(g "$MAIN" rev-parse agent-x)" = "$BASE_SHA" ]; echo $?)"
ok "the agent worktree's memory is out of its status" "$([ -z "$(g "$A" status --porcelain)" ]; echo $?)" "$(g "$A" status --porcelain)"
ok "the start hook printed nothing when there was nothing newer" "$([ -z "$START_OUT" ]; echo $?)" "$START_OUT"

# The agent's own git add -A and commit -a must carry no memory.
printf 'product 2\n' > "$A/product.txt"
printf 'new\n' > "$A/feature.txt"
g "$A" add -A
g "$A" commit -q -m "feature"
names=$(g "$A" show --name-only --format= HEAD)
ok "git add -A in the agent worktree stages no memory" "$([ "$(printf '%s\n' "$names" | sort | tr '\n' ' ')" = 'feature.txt product.txt ' ]; echo $?)" "$names"
printf 'more\n' >> "$A/$MEM/coder-fleet-coder/x.md"
printf -- '- [base](base.md) - from the default branch\n- [x note](x.md) - learned in agent-x\n- probe for commit -a\n' > "$A/$MEM/coder-fleet-coder/MEMORY.md"
printf 'product 3\n' > "$A/product.txt"
g "$A" commit -q -a -m "feature 2"
names=$(g "$A" show --name-only --format= HEAD)
ok "git commit -a in the agent worktree commits no memory" "$([ "$names" = 'product.txt' ]; echo $?)" "$names"
ok "the branch carries no memory change against the default branch" "$([ -z "$(g "$A" diff --name-only main HEAD -- "$MEM")" ]; echo $?)" "$(g "$A" diff --name-only main HEAD -- "$MEM")"

# A second write of the same file merges, it does not repeat what landed.
printf -- '- [base](base.md) - from the default branch\n- [x note](x.md) - learned in agent-x\n- [x2](x2.md) - second\n' > "$A/$MEM/coder-fleet-coder/MEMORY.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Edit "$A/$MEM/coder-fleet-coder/MEMORY.md")" >/dev/null
idx=$(state_has "$MEM/coder-fleet-coder/MEMORY.md")
ok "a second edit lands once and does not repeat the first" "$([ "$(count_line "$idx" 'learned in agent-x')" = 1 ] && [ "$(count_line "$idx" 'second')" = 1 ]; echo $?)" "$idx"

# A memory file written by a shell command, which no tool hook saw, is carried at stop.
printf 'by shell\n' > "$A/$MEM/coder-fleet-coder/shell.md"
run_hook stop "$(event SubagentStop coder-fleet:coder "$A" "" "")" >/dev/null
ok "the stop hook carries a memory file no tool call wrote" "$([ "$(state_has "$MEM/coder-fleet-coder/shell.md")" = 'by shell' ]; echo $?)"
ok "and the appended line no tool call saw" "$(state_has "$MEM/coder-fleet-coder/x.md" | grep -qx more; echo $?)"

# ------------------------------------------- a parallel coder, same base
B=$(add_agent agent-y)
run_hook start "$(event SubagentStart coder-fleet:coder "$B" "" "")" >/dev/null
printf -- '- [base](base.md) - from the default branch\n- [y note](y.md) - learned in agent-y\n' > "$B/$MEM/coder-fleet-coder/MEMORY.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$B" Edit "$B/$MEM/coder-fleet-coder/MEMORY.md")" >/dev/null
idx=$(state_has "$MEM/coder-fleet-coder/MEMORY.md")
ok "a parallel worktree's edit merges with the first, losing neither" "$(grep -q 'learned in agent-x' <<<"$idx" && grep -q 'learned in agent-y' <<<"$idx" && grep -q 'second' <<<"$idx"; echo $?)" "$idx"
ok "and keeps the default branch's line once" "$([ "$(count_line "$idx" 'from the default branch')" = 1 ]; echo $?)" "$idx"

# Its own directory only.
mkdir -p "$B/$MEM/coder-fleet-scout"
printf 'not yours\n' > "$B/$MEM/coder-fleet-scout/x.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$B" Write "$B/$MEM/coder-fleet-scout/x.md")" >/dev/null
ok "a write into another agent's directory is not carried" "$([ -z "$(state_has "$MEM/coder-fleet-scout/x.md")" ]; echo $?)"

# ------------------------------------- the start hook hands over the newer index
C=$(add_agent agent-z)
ctx=$(run_hook start "$(event SubagentStart coder-fleet:coder "$C" "" "")" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)
ok "a new worktree agent is handed the state worktree's newer index" "$(grep -q 'learned in agent-y' <<<"$ctx" && grep -qF "$STATE/$MEM/coder-fleet-coder" <<<"$ctx"; echo $?)" "$ctx"
evname=$(run_hook start "$(event SubagentStart coder-fleet:coder "$C" "" "")" | jq -r '.hookSpecificOutput.hookEventName // empty' 2>/dev/null)
ok "as SubagentStart context" "$([ "$evname" = SubagentStart ]; echo $?)" "$evname"

# --------------------------------------------- agents in the main checkout
mkdir -p "$MAIN/$MEM/coder-fleet-scout"
printf -- '- [paths](paths.md)\n' > "$MAIN/$MEM/coder-fleet-scout/MEMORY.md"
run_hook post "$(event PostToolUse coder-fleet:scout "$MAIN" Write "$MAIN/$MEM/coder-fleet-scout/MEMORY.md")" >/dev/null
printf -- '- [lead base](base.md)\n- [lead new](new.md)\n' > "$MAIN/$MEM/coder-fleet-lead/MEMORY.md"
run_hook post "$(event PostToolUse coder-fleet:lead "$MAIN" Edit "$MAIN/$MEM/coder-fleet-lead/MEMORY.md")" >/dev/null
ok "a main-checkout agent's new note is committed on the state branch" "$(state_has "$MEM/coder-fleet-scout/MEMORY.md" | grep -q paths; echo $?)"
ok "and the lead's edit" "$(state_has "$MEM/coder-fleet-lead/MEMORY.md" | grep -q 'lead new'; echo $?)"
ok "the default branch still has no new commit" "$([ "$(g "$MAIN" rev-parse main)" = "$BASE_SHA" ]; echo $?)"
run_hook stop "$(event SubagentStop coder-fleet:scout "$MAIN" "" "")" >/dev/null
run_hook stop "$(event SessionEnd coder-fleet:lead "$MAIN" "" "")" >/dev/null
ok "at stop the main checkout's memory is back as the default branch has it" "$([ -z "$(g "$MAIN" status --porcelain --untracked-files=all -- "$MEM")" ]; echo $?)" "$(g "$MAIN" status --porcelain --untracked-files=all -- "$MEM")"
ok "and the state branch still has both" "$(state_has "$MEM/coder-fleet-scout/MEMORY.md" | grep -q paths && state_has "$MEM/coder-fleet-lead/MEMORY.md" | grep -q 'lead new'; echo $?)"
ctx=$(run_hook start "$(event SessionStart coder-fleet:lead "$MAIN" "" "")" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)
ok "the lead's next session is handed its newer index" "$(grep -q 'lead new' <<<"$ctx"; echo $?)" "$ctx"

# A change the stop hook could not carry is left where it is.
ok "the emptied memory directory went with its files" "$([ ! -d "$MAIN/$MEM/coder-fleet-scout" ]; echo $?)"
mkdir -p "$MAIN/$MEM/coder-fleet-scout"
printf 'stuck\n' > "$MAIN/$MEM/coder-fleet-scout/stuck.md"
chmod 000 "$STATE/$MEM/coder-fleet-scout" 2>/dev/null
if [ ! -w "$STATE/$MEM/coder-fleet-scout" ]; then
    run_hook stop "$(event SubagentStop coder-fleet:scout "$MAIN" "" "")" >/dev/null
    ok "a main-checkout note the state worktree could not take stays in the main checkout" "$([ -f "$MAIN/$MEM/coder-fleet-scout/stuck.md" ]; echo $?)"
else
    printf '  SKIP  permissions do not bind this process\n'
fi
chmod 755 "$STATE/$MEM/coder-fleet-scout" 2>/dev/null
rm -f "$MAIN/$MEM/coder-fleet-scout/stuck.md"

# ------------------------------------------------ what is not a checkout of ours
PLANTED="$TMP/planted"
mkdir -p "$PLANTED/$MEM/coder-fleet-coder"
printf 'gitdir: %s\n' "$MAIN/.git" > "$PLANTED/.git"
printf 'planted\n' > "$PLANTED/$MEM/coder-fleet-coder/p.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$PLANTED" Write "$PLANTED/$MEM/coder-fleet-coder/p.md")" >/dev/null
ok "a directory with a planted .git file is not carried" "$([ -z "$(state_has "$MEM/coder-fleet-coder/p.md")" ]; echo $?)"

# ------------------------------------- every path under an agent's tree is hostile
# A target spelled in another case than Claude Code's own path matches the
# memory directory only after folding, and would give a relative path with ..
# in it: it is not carried. Only a case-blind disk can show it.
printf 'case\n' > "$A/$MEM/coder-fleet-coder/case.md"
CASED="$A/.CLAUDE/agent-memory/coder-fleet-coder/case.md"
if [ -f "$CASED" ]; then
    run_hook post "$(event PostToolUse coder-fleet:coder "$A" Write "$CASED")" >/dev/null
    ok "a target matching the memory directory only case-folded is not carried" "$([ -z "$(state_has "$MEM/coder-fleet-coder/case.md")" ]; echo $?)"
else
    printf '  SKIP  this disk folds no case, so a case-mismatched path is no path\n'
fi
rm -f "$A/$MEM/coder-fleet-coder/case.md"

# A source directory reached through a symlink: an agent worktree whose
# .claude/agent-memory leads elsewhere has nothing of its own to carry.
W=$(add_agent agent-w)
VICTIM="$TMP/victim"
mkdir -p "$VICTIM/coder-fleet-coder"
printf 'victim\n' > "$VICTIM/coder-fleet-coder/v.md"
rm -rf "$W/$MEM"
ln -s "$VICTIM" "$W/$MEM"
run_hook stop "$(event SubagentStop coder-fleet:coder "$W" "" "")" >/dev/null
run_hook post "$(event PostToolUse coder-fleet:coder "$W" Write "$W/$MEM/coder-fleet-coder/v.md")" >/dev/null
ok "a memory tree reached through a symlink is not read into the state branch" "$([ -z "$(state_has "$MEM/coder-fleet-coder/v.md")" ]; echo $?)"

# The same in the main checkout, where the stop hook would put files back: a
# file reached through a symlinked .claude/agent-memory is neither carried nor deleted.
mv "$MAIN/$MEM" "$TMP/main-memory-saved"
VICTIM2="$TMP/victim2"
mkdir -p "$VICTIM2/coder-fleet-scout"
printf 'keep\n' > "$VICTIM2/coder-fleet-scout/keep.md"
ln -s "$VICTIM2" "$MAIN/$MEM"
run_hook stop "$(event SubagentStop coder-fleet:scout "$MAIN" "" "")" >/dev/null
ok "a file reached through a symlinked main-checkout memory tree is not deleted" "$([ -f "$VICTIM2/coder-fleet-scout/keep.md" ]; echo $?)"
ok "nor carried" "$([ -z "$(state_has "$MEM/coder-fleet-scout/keep.md")" ]; echo $?)"
rm "$MAIN/$MEM"
mv "$TMP/main-memory-saved" "$MAIN/$MEM"

# A symlinked directory inside the state worktree's memory tree would send a
# write outside it, so while one is there nothing is carried at all.
OUTSIDE="$TMP/outside"
mkdir -p "$OUTSIDE" "$A/$MEM/coder-fleet-coder/sub"
ln -s "$OUTSIDE" "$STATE/$MEM/coder-fleet-coder/sub"
printf 'escape\n' > "$A/$MEM/coder-fleet-coder/sub/evil.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Write "$A/$MEM/coder-fleet-coder/sub/evil.md")" >/dev/null
ok "a symlinked directory in the state worktree takes no write outside it" "$([ ! -e "$OUTSIDE/evil.md" ]; echo $?)" "$(ls "$OUTSIDE")"
printf 'plain\n' > "$A/$MEM/coder-fleet-coder/plain.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Write "$A/$MEM/coder-fleet-coder/plain.md")" >/dev/null
ok "and while it is there nothing else is carried either" "$([ -z "$(state_has "$MEM/coder-fleet-coder/plain.md")" ]; echo $?)"
ctx=$(run_hook start "$(event SubagentStart coder-fleet:coder "$C" "" "")")
ok "nor is any index handed over from it" "$([ -z "$ctx" ]; echo $?)" "$ctx"
rm "$STATE/$MEM/coder-fleet-coder/sub"

# ----------------------------------------------- a project with no state worktree
LONE="$TMP/lone"
mkdir -p "$LONE/$MEM/coder-fleet-coder"
g "$LONE" init -q -b main
printf 'x\n' > "$LONE/a.txt"
g "$LONE" add -A
g "$LONE" -c user.email=t@t -c user.name=t commit -q -m base
printf 'note\n' > "$LONE/$MEM/coder-fleet-coder/n.md"
out=$(printf '%s' "$(event PostToolUse coder-fleet:coder "$LONE" Write "$LONE/$MEM/coder-fleet-coder/n.md")" | CLAUDE_PROJECT_DIR="$LONE" bash "$HOOK" post 2>/dev/null; echo "exit=$?")
ok "with no state worktree the hook leaves memory where it is and exits 0" "$([ -f "$LONE/$MEM/coder-fleet-coder/n.md" ] && grep -q 'exit=0' <<<"$out"; echo $?)" "$out"

ok "no hook call exited non-zero" "$([ ! -s "$TMP/hook.err" ] || ! grep -q '^exit ' "$TMP/hook.err"; echo $?)" "$(cat "$TMP/hook.err" 2>/dev/null)"

printf '%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
