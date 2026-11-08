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
printf -- '- [base](base.md) - from the default branch\n' > "$MAIN/$MEM/coder-fleet-coder/MEMORY.md" && printf 'a note from the default branch\n' > "$MAIN/$MEM/coder-fleet-coder/doomed.md"
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

# A hard link pre-created at a predictable temporary name would have its
# target truncated and overwritten: O_NOFOLLOW does not stop a hard link.
PRECIOUS="$TMP/precious.txt"
printf 'precious\n' > "$PRECIOUS"
ln "$PRECIOUS" "$STATE/$MEM/coder-fleet-coder/.x.md.memory-tmp"
printf 'x body\nmore\nlinked\n' > "$A/$MEM/coder-fleet-coder/x.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Edit "$A/$MEM/coder-fleet-coder/x.md")" >/dev/null
ok "a hard link at the temporary name leaves its target untouched" "$([ "$(cat "$PRECIOUS")" = precious ]; echo $?)" "$(cat "$PRECIOUS")"
ok "and no temporary file is committed, so the linked file's content stays off the state branch" "$([ -z "$(g "$STATE" ls-tree -r --name-only coder-fleet/state -- "$MEM" | grep 'memory-tmp')" ]; echo $?)" "$(g "$STATE" ls-tree -r --name-only coder-fleet/state -- "$MEM" | grep 'memory-tmp')"
ok "and while a hard-linked file is in the state tree nothing is carried" "$(! state_has "$MEM/coder-fleet-coder/x.md" | grep -qx linked; echo $?)"
rm -f "$STATE/$MEM/coder-fleet-coder/.x.md.memory-tmp"
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Edit "$A/$MEM/coder-fleet-coder/x.md")" >/dev/null
ok "once it is gone the write lands" "$(state_has "$MEM/coder-fleet-coder/x.md" | grep -qx linked; echo $?)"
# A temporary file a killed run left behind is never committed.
printf 'half\n' > "$STATE/$MEM/coder-fleet-coder/.x.md.0123456789abcdef.memory-tmp"
printf 'x body\nmore\nlinked\nagain\n' > "$A/$MEM/coder-fleet-coder/x.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Edit "$A/$MEM/coder-fleet-coder/x.md")" >/dev/null
ok "a stale temporary file is left out of the commit" "$(state_has "$MEM/coder-fleet-coder/x.md" | grep -qx again && [ -z "$(g "$STATE" ls-tree -r --name-only coder-fleet/state -- "$MEM" | grep 'memory-tmp')" ]; echo $?)" "$(g "$STATE" ls-tree -r --name-only coder-fleet/state -- "$MEM" | grep 'memory-tmp')"
rm -f "$STATE/$MEM/coder-fleet-coder/.x.md.0123456789abcdef.memory-tmp"

# The commit must hold the content the hook checked, not whatever the path
# leads to by the time git reads it. A git shim on PATH swaps the state copy
# for a hard link to an outside file the first time the hook asks git to add
# or hash anything: after every check, before the commit.
SHIM="$TMP/shim"
mkdir -p "$SHIM"
cat > "$SHIM/git" <<EOF
#!/bin/sh
for a in "\$@"; do
    case "\$a" in add|hash-object)
        if [ ! -e "$TMP/swapped" ]; then
            : > "$TMP/swapped"
            rm -f "$STATE/$MEM/coder-fleet-coder/x.md"
            ln "$PRECIOUS" "$STATE/$MEM/coder-fleet-coder/x.md"
        fi ;;
    esac
done
exec $(command -v git) "\$@"
EOF
chmod +x "$SHIM/git"
printf 'x body\nmore\nlinked\nagain\nswap\n' > "$A/$MEM/coder-fleet-coder/x.md"
printf '%s' "$(event PostToolUse coder-fleet:coder "$A" Edit "$A/$MEM/coder-fleet-coder/x.md")" | PATH="$SHIM:$PATH" CLAUDE_PROJECT_DIR="$MAIN" bash "$HOOK" post >/dev/null 2>&1
ok "the swap ran, so the case below means something" "$([ -e "$TMP/swapped" ]; echo $?)"
ok "a file swapped for a hard link after the check does not reach the commit" "$(! state_has "$MEM/coder-fleet-coder/x.md" | grep -q precious; echo $?)" "$(state_has "$MEM/coder-fleet-coder/x.md")"
ok "and the commit holds the content the hook checked" "$(state_has "$MEM/coder-fleet-coder/x.md" | grep -qx swap; echo $?)" "$(state_has "$MEM/coder-fleet-coder/x.md")"
ok "and the outside file is untouched" "$([ "$(cat "$PRECIOUS")" = precious ]; echo $?)"
rm -f "$STATE/$MEM/coder-fleet-coder/x.md"
g "$STATE" checkout -q -- "$MEM/coder-fleet-coder/x.md"

# A source with more than one link is another file's alias, not a note.
printf 'outside\n' > "$TMP/outside-note.txt"
ln "$TMP/outside-note.txt" "$A/$MEM/coder-fleet-coder/alias.md"
run_hook post "$(event PostToolUse coder-fleet:coder "$A" Write "$A/$MEM/coder-fleet-coder/alias.md")" >/dev/null
ok "a hard-linked source is not carried" "$([ -z "$(state_has "$MEM/coder-fleet-coder/alias.md")" ]; echo $?)"
rm -f "$A/$MEM/coder-fleet-coder/alias.md"

# ------------------------------------- notes that exist only on the state branch
# A note made after the last flush is on the state branch and in no checkout's
# HEAD. An agent handed it at its start, and writing its update where Claude
# Code keeps its memory, edited that copy: the edit is taken, not set beside the
# old line. The base is the state copy the agent started from.
NOTE="$MEM/coder-fleet-coder/shared.md"
printf 'one\ntwo\nthree\n' > "$STATE/$NOTE"
g "$STATE" add -f -- "$NOTE"
g "$STATE" commit -q -m 'Record coder-fleet-coder memory' -- "$NOTE"
E=$(add_agent agent-e)
run_hook start "$(event SubagentStart coder-fleet:coder "$E" "" "")" >/dev/null
printf 'one\nTWO edited\nthree\n' > "$E/$NOTE"
run_hook post "$(event PostToolUse coder-fleet:coder "$E" Write "$E/$NOTE")" >/dev/null
got=$(state_has "$NOTE")
ok "a worktree agent's edit to a state-only note is taken, not doubled" "$([ "$got" = "$(printf 'one\nTWO edited\nthree')" ]; echo $?)" "$got"

# Two agents started from the same state copy edit it at once: both keep their lines.
F=$(add_agent agent-f)
G=$(add_agent agent-g)
run_hook start "$(event SubagentStart coder-fleet:coder "$F" "" "")" >/dev/null
run_hook start "$(event SubagentStart coder-fleet:coder "$G" "" "")" >/dev/null
printf 'one\nTWO edited\nthree\nfour from f\n' > "$F/$NOTE"
printf 'ONE from g\nTWO edited\nthree\n' > "$G/$NOTE"
run_hook post "$(event PostToolUse coder-fleet:coder "$F" Write "$F/$NOTE")" >/dev/null
run_hook post "$(event PostToolUse coder-fleet:coder "$G" Write "$G/$NOTE")" >/dev/null
got=$(state_has "$NOTE")
ok "two agents editing a state-only note at once both keep their lines, once each" "$([ "$got" = "$(printf 'ONE from g\nTWO edited\nthree\nfour from f')" ]; echo $?)" "$got"

# The lead, in the main checkout, whose record its last session's stop removed.
LNOTE="$MEM/coder-fleet-lead/lead-only.md"
printf 'a\nb\nc\n' > "$STATE/$LNOTE"
g "$STATE" add -f -- "$LNOTE"
g "$STATE" commit -q -m 'Record coder-fleet-lead memory' -- "$LNOTE"
run_hook start "$(event SessionStart coder-fleet:lead "$MAIN" "" "")" >/dev/null
printf 'a\nB edited\nc\n' > "$MAIN/$LNOTE"
run_hook post "$(event PostToolUse coder-fleet:lead "$MAIN" Write "$MAIN/$LNOTE")" >/dev/null
got=$(state_has "$LNOTE")
ok "the lead's edit to a state-only note is taken, not doubled" "$([ "$got" = "$(printf 'a\nB edited\nc')" ]; echo $?)" "$got"
run_hook stop "$(event SessionEnd coder-fleet:lead "$MAIN" "" "")" >/dev/null
ok "and its main checkout is put back" "$([ ! -e "$MAIN/$LNOTE" ]; echo $?)"

# A rewrite that keeps fewer than half of an untouched note's lines is still the
# agent's edit of that note: the state copy is the one it started from, so the
# new copy is taken exactly, never set beside the old one.
RNOTE="$MEM/coder-fleet-coder/rewrite.md"
printf 'alpha\nbeta\ngamma\n' > "$STATE/$RNOTE"
g "$STATE" add -f -- "$RNOTE"
g "$STATE" commit -q -m 'Record coder-fleet-coder memory' -- "$RNOTE"
H=$(add_agent agent-h)
run_hook start "$(event SubagentStart coder-fleet:coder "$H" "" "")" >/dev/null
printf 'alpha\nBETA rewritten\nGAMMA rewritten\n' > "$H/$RNOTE"
run_hook post "$(event PostToolUse coder-fleet:coder "$H" Write "$H/$RNOTE")" >/dev/null
got=$(state_has "$RNOTE")
ok "a heavy rewrite of an untouched note is taken exactly" "$([ "$got" = "$(printf 'alpha\nBETA rewritten\nGAMMA rewritten')" ]; echo $?)" "$got"
# Rewritten again, back towards the copy it started from: the state copy is what
# this checkout last handed over, so this one is taken exactly too, though the
# start copy looks more like it.
printf 'alpha\nbeta\nzeta\n' > "$H/$RNOTE"
run_hook post "$(event PostToolUse coder-fleet:coder "$H" Write "$H/$RNOTE")" >/dev/null
got=$(state_has "$RNOTE")
ok "a second rewrite over the agent's own last copy is taken exactly" "$([ "$got" = "$(printf 'alpha\nbeta\nzeta')" ]; echo $?)" "$got"

# The lead prunes a ten-entry index to four. The state copy is its start copy,
# and the default branch's one-line copy shares a line with the pruned one.
LIDX="$MEM/coder-fleet-lead/MEMORY.md"
printf -- '- [lead base](base.md)\n' > "$STATE/$LIDX"
for n in 1 2 3 4 5 6 7 8 9; do printf -- '- [e%s](e%s.md)\n' "$n" "$n" >> "$STATE/$LIDX"; done
g "$STATE" add -f -- "$LIDX"
g "$STATE" commit -q -m 'Record coder-fleet-lead memory' -- "$LIDX"
run_hook start "$(event SessionStart coder-fleet:lead "$MAIN" "" "")" >/dev/null
PRUNED=$(printf -- '- [lead base](base.md)\n- [e2](e2.md)\n- [e5](e5.md)\n- [e9](e9.md)')
printf '%s\n' "$PRUNED" > "$MAIN/$LIDX"
run_hook post "$(event PostToolUse coder-fleet:lead "$MAIN" Edit "$MAIN/$LIDX")" >/dev/null
got=$(state_has "$LIDX")
ok "the lead's prune of an untouched index is taken exactly" "$([ "$got" = "$PRUNED" ]; echo $?)" "$got"
run_hook stop "$(event SessionEnd coder-fleet:lead "$MAIN" "" "")" >/dev/null
got=$(state_has "$LIDX")
ok "and its stop leaves the pruned index on the state branch" "$([ "$got" = "$PRUNED" ]; echo $?)" "$got"

# A note no base knows of, made by two agents at once, merges against nothing
# and keeps both.
I=$(add_agent agent-i)
J=$(add_agent agent-j)
run_hook start "$(event SubagentStart coder-fleet:coder "$I" "" "")" >/dev/null
run_hook start "$(event SubagentStart coder-fleet:coder "$J" "" "")" >/dev/null
NEWN="$MEM/coder-fleet-coder/both.md"
printf 'from j\n' > "$J/$NEWN"
run_hook post "$(event PostToolUse coder-fleet:coder "$J" Write "$J/$NEWN")" >/dev/null
printf 'from i\n' > "$I/$NEWN"
run_hook post "$(event PostToolUse coder-fleet:coder "$I" Write "$I/$NEWN")" >/dev/null
got=$(state_has "$NEWN")
ok "a note two agents made at once keeps both, merged against nothing" "$(grep -qx 'from i' <<<"$got" && grep -qx 'from j' <<<"$got"; echo $?)" "$got"

# A note deleted on the state branch stays deleted: an agent whose checkout
# still has it, unchanged, does not put it back when it stops.
DOOMED="$MEM/coder-fleet-coder/doomed.md"
g "$STATE" rm -q -- "$DOOMED"
g "$STATE" commit -q -m 'Forget a note'
D=$(add_agent agent-d)
run_hook start "$(event SubagentStart coder-fleet:coder "$D" "" "")" >/dev/null
run_hook stop "$(event SubagentStop coder-fleet:coder "$D" "" "")" >/dev/null
ok "a note deleted on the state branch is not put back by an agent's stop" "$([ -z "$(state_has "$DOOMED")" ] && [ ! -e "$STATE/$DOOMED" ]; echo $?)"
printf 'a doomed note, changed\n' > "$D/$DOOMED"
run_hook post "$(event PostToolUse coder-fleet:coder "$D" Write "$D/$DOOMED")" >/dev/null
ok "but an agent that changes it brings its change back" "$(state_has "$DOOMED" | grep -q changed; echo $?)"


# ------------------------------------------------ one lock with board commits
# A memory commit takes board.lock, the lock every board commit takes and the
# flush holds from reading the state branch's head to resetting it, so it can
# never land between those two and be reset away.
LOCK="$MAIN/.git/coder-fleet/board.lock"
mkdir -p "$LOCK"
printf '%s\n' "$$" > "$LOCK/pid"
before=$(g "$MAIN" rev-parse coder-fleet/state)
printf 'while locked\n' > "$A/$MEM/coder-fleet-coder/locked.md"
( run_hook post "$(event PostToolUse coder-fleet:coder "$A" Write "$A/$MEM/coder-fleet-coder/locked.md")" >/dev/null ) &
held=$!
sleep 2
ok "a memory commit waits while the board lock is held" "$([ "$(g "$MAIN" rev-parse coder-fleet/state)" = "$before" ]; echo $?)"
rm -rf "$LOCK"
wait "$held"
ok "and lands once it is free" "$([ "$(state_has "$MEM/coder-fleet-coder/locked.md")" = 'while locked' ]; echo $?)"
ok "and leaves no lock behind" "$([ ! -e "$LOCK" ]; echo $?)"

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

# The lock itself: breaking it, refusing a path that is no lock, releasing only
# its own. memory-lock-test.py drives the class directly, one line per case.
while IFS= read -r line; do
    case "$line" in
        "  ok "*) PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '%s\n' "$line" ;;
        "  FAIL"*) FAILED=$((FAILED + 1)); printf '%s\n' "$line" ;;
        "        "*) printf '%s\n' "$line" ;;
    esac
done <<EOF
$(python3 "$LIB_DIR/memory-lock-test.py" "$PLUGIN_ROOT/hooks/lib/memory-state.py" 2>&1 || printf '  FAIL  memory-lock-test.py exited non-zero\n')
EOF

ok "no hook call exited non-zero" "$([ ! -s "$TMP/hook.err" ] || ! grep -q '^exit ' "$TMP/hook.err"; echo $?)" "$(cat "$TMP/hook.err" 2>/dev/null)"

printf '%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
