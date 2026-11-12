#!/usr/bin/env bash
#
# spec-state-contract.sh - a spec under the main checkout's docs/specs/ is
# committed on coder-fleet/state by hooks/memory-state.sh, never on the default
# branch, and a local copy is never overwritten (CF-201.1).
#
# A project that keeps docs/specs/ out of its history (CF-201) has its specs in
# the main checkout alone. The memory hook's three modes carry them: post on a
# Write or Edit there, from any session or agent; start and stop on every
# session and spawn boundary, which catches the human's own edits and a spec
# removed once its item is Done. The board's own restore on adoption is in
# board/src/test/excluded-board.test.ts, and the push in state-push-contract.sh.
#
# Case names:
#   carried      S01 spec-writer's Write, S02 the lead's Edit with no agent
#                type, S03 a spec editor's Edit, S05 a human's edit at the next
#                SessionStart, SessionEnd or SubagentStart
#   left alone   S04 a write outside docs/specs/, S06 nothing changed, S13 a
#                symlink, S14 a linked worktree's docs/specs/, S15 commits off
#   removed      S07 a spec removed in the main checkout; S08 one the state
#                branch has from elsewhere is never removed or written here
#   never lost   S09 a newer state copy is kept and the unchanged local one left;
#                S10 a local edit newer than both is carried; S11 a local copy
#                older than the state copy is not carried and not rewritten;
#                S12 one newer is carried
#   refused      S17 only .md files are carried, and no name with a leading dot,
#                a .git in any case, a trailing ~, a control character or a
#                backslash
#   not migrated S16 specs tracked on the default branch: nothing, and a log line
#
# Everything is a real repository: a bare remote, the main checkout, its state
# worktree and an agent worktree. No model, no network, no board binary.
#
# Usage:  claude/evals/lib/spec-state-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
PLUGIN_ROOT=$(cd "$LIB_DIR/../../coder-fleet" && pwd)
HOOK="$PLUGIN_ROOT/hooks/memory-state.sh"
EXCLUDE="$PLUGIN_ROOT/scripts/fleet-exclude.py"

for tool in git jq python3; do
    command -v "$tool" >/dev/null 2>&1 || { printf 'spec-state-contract: %s is needed\n' "$tool" >&2; exit 2; }
done

TMP=$(mktemp -d "${TMPDIR:-/tmp}/spec-state.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P)
trap 'rm -rf "$TMP"' EXIT
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR CODER_FLEET_BOARD_NO_COMMIT
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export CODER_FLEET_STATE_DIR="$TMP/fleet-state"
export BOARD_LOG_FILE="$TMP/hooks.log"
# The push has its own contract; here it would only log a refused path remote.
export CODER_FLEET_STATE_PUSH=off

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

# fixture <dir> [tracked]: a bare remote, a main checkout excluded as /init
# leaves it, and a state worktree with one board commit. With "tracked" the
# default branch still tracks docs/specs/, as a project not yet migrated does.
fixture() {
    local d="$1"
    mkdir -p "$d/main/docs/specs"
    g "$d" init -q --bare -b main "$d/remote.git"
    g "$d/main" init -q -b main
    printf 'product\n' > "$d/main/README.md"
    if [ "${2:-}" = tracked ]; then printf 'tracked spec\n' > "$d/main/docs/specs/OLD-1.md"; fi
    g "$d/main" add -A
    g "$d/main" commit -q -m base
    g "$d/main" remote add origin "$d/remote.git"
    g "$d/main" push -q origin main
    if [ "${2:-}" != tracked ]; then (cd "$d/main" && python3 -I "$EXCLUDE" write) >/dev/null; fi
    printf '/.claude/worktrees/\n' >> "$d/main/.git/info/exclude"
    g "$d/main" worktree add -q -b coder-fleet/state "$d/main/.claude/worktrees/coder-fleet-state" main
    mkdir -p "$d/main/.claude/worktrees/coder-fleet-state/.boards"
    printf 'project_name: "t"\nauto_commit: true\n' > "$d/main/.claude/worktrees/coder-fleet-state/.boards/config.yml"
    g "$d/main/.claude/worktrees/coder-fleet-state" add -f .boards
    g "$d/main/.claude/worktrees/coder-fleet-state" commit -q -m "a board write"
}

D="$TMP/a"
fixture "$D"
MAIN="$D/main"
STATE="$MAIN/.claude/worktrees/coder-fleet-state"
SPECS="$MAIN/docs/specs"
BASE_SHA=$(g "$MAIN" rev-parse main)

event() {
    # $1 hook_event_name, $2 agent_type ("" for the lead's own session), $3 cwd, $4 tool, $5 file_path
    jq -nc --arg e "$1" --arg a "$2" --arg c "$3" --arg t "$4" --arg f "$5" \
        '{hook_event_name:$e,cwd:$c,session_id:"s1"} + (if $a == "" then {} else {agent_type:$a,agent_id:"a1"} end)
         + (if $t == "" then {} else {tool_name:$t,tool_input:{file_path:$f}} end)'
}
run_hook() { # $1 main checkout, $2 mode, $3 event JSON
    printf '%s' "$3" | (cd "$TMP" && CLAUDE_PROJECT_DIR="$1" bash "$HOOK" "$2") >/dev/null 2>>"$TMP/hook.err" \
        || printf 'exit %s for %s\n' "$?" "$2" >> "$TMP/hook.err"
}
tip() { g "$MAIN" rev-parse coder-fleet/state; }
on_state() { g "$MAIN" show "coder-fleet/state:docs/specs/$1" 2>/dev/null; }
state_lacks() { ! g "$MAIN" cat-file -e "coder-fleet/state:docs/specs/$1" 2>/dev/null; }
# A commit made on the state branch by some other machine, as board state --from brings one in. $1 name, $2 text, $3 committer date or "".
elsewhere() {
    mkdir -p "$STATE/docs/specs"
    printf '%s' "$2" > "$STATE/docs/specs/$1"
    g "$STATE" add -f "docs/specs/$1"
    if [ -n "$3" ]; then GIT_COMMITTER_DATE="$3" g "$STATE" commit -q -m "elsewhere: $1"; else g "$STATE" commit -q -m "elsewhere: $1"; fi
}

# ------------------------------------------------------------------ carried
printf '# CF-1\n\nfirst draft\n' > "$SPECS/CF-1.md"
run_hook "$MAIN" post "$(event PostToolUse coder-fleet:spec-writer "$MAIN" Write "$SPECS/CF-1.md")"
ok "S01 spec-writer's Write is committed on the state branch" "$([ "$(on_state CF-1.md)" = "$(cat "$SPECS/CF-1.md")" ]; echo $?)" "$(on_state CF-1.md)"
msg=$(g "$MAIN" log -1 --format='%s%n%b' coder-fleet/state)
ok "S01 with a specs subject and a Board-Writer: specs trailer" "$(grep -q '^Board-Writer: specs' <<<"$msg" && grep -qi 'spec' <<<"$(head -1 <<<"$msg")"; echo $?)" "$msg"
ok "S01 the default branch gains no commit" "$([ "$(g "$MAIN" rev-parse main)" = "$BASE_SHA" ]; echo $?)"
ok "S01 and tracks no spec" "$([ -z "$(g "$MAIN" ls-files -- docs/specs)" ] && [ -z "$(g "$MAIN" ls-tree -r --name-only main -- docs/specs)" ]; echo $?)"
ok "S01 the main checkout's status stays clean" "$([ -z "$(g "$MAIN" status --porcelain --untracked-files=all)" ]; echo $?)" "$(g "$MAIN" status --porcelain --untracked-files=all)"
ok "S01 the state worktree is left clean, holding the same copy" "$([ -z "$(g "$STATE" status --porcelain --untracked-files=all)" ] && cmp -s "$SPECS/CF-1.md" "$STATE/docs/specs/CF-1.md"; echo $?)" "$(g "$STATE" status --porcelain --untracked-files=all)"
ok "S01 the main checkout's spec is not rewritten" "$([ "$(cat "$SPECS/CF-1.md")" = "$(printf '# CF-1\n\nfirst draft')" ]; echo $?)"

printf '# CF-1\n\nafter the interview\n' > "$SPECS/CF-1.md"
run_hook "$MAIN" post "$(event PostToolUse "" "$MAIN" Edit "$SPECS/CF-1.md")"
ok "S02 the lead's own Edit, with no agent type, is carried" "$(on_state CF-1.md | grep -qx 'after the interview'; echo $?)" "$(on_state CF-1.md)"

printf '# CF-1\n\nafter the interview\n\n## Challenges (spec-editor)\n' > "$SPECS/CF-1.md"
run_hook "$MAIN" post "$(event PostToolUse coder-fleet:spec-editor-fable "$MAIN" Edit "$SPECS/CF-1.md")"
ok "S03 a spec editor's Edit is carried" "$(on_state CF-1.md | grep -q 'Challenges'; echo $?)" "$(on_state CF-1.md)"

before=$(tip)
printf 'not a spec\n' > "$MAIN/notes.md"
run_hook "$MAIN" post "$(event PostToolUse "" "$MAIN" Write "$MAIN/notes.md")"
ok "S04 a write outside docs/specs/ makes no commit" "$([ "$(tip)" = "$before" ]; echo $?)"
rm -f "$MAIN/notes.md"

printf '# CF-1\n\nthe human edited this in an editor\n' > "$SPECS/CF-1.md"
run_hook "$MAIN" start "$(event SessionStart "" "$MAIN" "" "")"
ok "S05 a human's edit is carried at the next SessionStart" "$(on_state CF-1.md | grep -q 'in an editor'; echo $?)" "$(on_state CF-1.md)"
printf '# CF-1\n\nand again before the session ended\n' > "$SPECS/CF-1.md"
run_hook "$MAIN" stop "$(event SessionEnd "" "$MAIN" "" "")"
ok "S05 and at SessionEnd" "$(on_state CF-1.md | grep -q 'before the session ended'; echo $?)" "$(on_state CF-1.md)"
g "$MAIN" worktree add -q -b agent-x "$MAIN/.claude/worktrees/agent-x" main
AGENT="$MAIN/.claude/worktrees/agent-x"
printf '# CF-1\n\nedited while a coder ran\n' > "$SPECS/CF-1.md"
run_hook "$MAIN" start "$(event SubagentStart coder-fleet:coder "$AGENT" "" "")"
ok "S05 and at a SubagentStart in a worktree" "$(on_state CF-1.md | grep -q 'while a coder ran'; echo $?)" "$(on_state CF-1.md)"

before=$(tip)
run_hook "$MAIN" start "$(event SessionStart "" "$MAIN" "" "")"
run_hook "$MAIN" stop "$(event SubagentStop coder-fleet:coder "$AGENT" "" "")"
ok "S06 nothing changed makes no commit" "$([ "$(tip)" = "$before" ]; echo $?)" "$(g "$MAIN" log --oneline -3 coder-fleet/state)"

# ------------------------------------------------------------------ removed
rm "$SPECS/CF-1.md"
run_hook "$MAIN" stop "$(event SessionEnd "" "$MAIN" "" "")"
ok "S07 a spec removed in the main checkout is removed from the state branch" "$(state_lacks CF-1.md; echo $?)"
ok "S07 and from the state worktree, left clean" "$([ ! -e "$STATE/docs/specs/CF-1.md" ] && [ -z "$(g "$STATE" status --porcelain --untracked-files=all)" ]; echo $?)" "$(g "$STATE" status --porcelain --untracked-files=all)"

elsewhere OTHER-1.md 'from another machine
' ""
run_hook "$MAIN" stop "$(event SessionEnd "" "$MAIN" "" "")"
ok "S08 a spec only the state branch has is never removed by a sweep" "$(on_state OTHER-1.md | grep -q 'another machine'; echo $?)"
ok "S08 nor written into the main checkout by the hook" "$([ ! -e "$SPECS/OTHER-1.md" ]; echo $?)"

# ------------------------------------------------------------------ never lost
printf 'v1 from here\n' > "$SPECS/CF-2.md"
run_hook "$MAIN" post "$(event PostToolUse coder-fleet:spec-writer "$MAIN" Write "$SPECS/CF-2.md")"
elsewhere CF-2.md 'v2 from another machine
' '2001-01-01T00:00:00Z'
before=$(tip)
run_hook "$MAIN" start "$(event SessionStart "" "$MAIN" "" "")"
ok "S09 a newer state copy is kept when the local one is unchanged since it was carried" "$([ "$(tip)" = "$before" ] && on_state CF-2.md | grep -q 'v2'; echo $?)" "$(on_state CF-2.md)"
ok "S09 and the local copy is left as it is" "$(grep -qx 'v1 from here' "$SPECS/CF-2.md"; echo $?)"
ok "S09 and the log says so" "$(grep -q 'CF-2.md' "$BOARD_LOG_FILE"; echo $?)" "$(tail -3 "$BOARD_LOG_FILE" 2>/dev/null)"
printf 'v3 edited here after both\n' > "$SPECS/CF-2.md"
run_hook "$MAIN" stop "$(event SessionEnd "" "$MAIN" "" "")"
ok "S10 a local edit newer than the state copy is carried" "$(on_state CF-2.md | grep -q 'v3'; echo $?)" "$(on_state CF-2.md)"

elsewhere CF-3.md 'state copy, written today
' ""
printf 'an old local copy\n' > "$SPECS/CF-3.md"
touch -t 200101010000 "$SPECS/CF-3.md"
before=$(tip)
run_hook "$MAIN" start "$(event SessionStart "" "$MAIN" "" "")"
ok "S11 a local copy older than the state copy is not carried" "$([ "$(tip)" = "$before" ] && on_state CF-3.md | grep -q 'written today'; echo $?)" "$(on_state CF-3.md)"
ok "S11 and is not rewritten" "$(grep -qx 'an old local copy' "$SPECS/CF-3.md"; echo $?)"

elsewhere CF-4.md 'an old state copy
' '2001-01-01T00:00:00Z'
printf 'a newer local copy\n' > "$SPECS/CF-4.md"
run_hook "$MAIN" start "$(event SessionStart "" "$MAIN" "" "")"
ok "S12 a local copy newer than the state copy is carried" "$(on_state CF-4.md | grep -q 'newer local'; echo $?)" "$(on_state CF-4.md)"

# ------------------------------------------------------------------ left alone
printf 'a secret outside the specs\n' > "$TMP/outside.txt"
ln -s "$TMP/outside.txt" "$SPECS/LINK-1.md"
before=$(tip)
run_hook "$MAIN" start "$(event SessionStart "" "$MAIN" "" "")"
ok "S13 a symlink under docs/specs/ is never followed or carried" "$(state_lacks LINK-1.md && ! g "$MAIN" grep -q 'a secret' coder-fleet/state -- docs/specs; echo $?)"
rm -f "$SPECS/LINK-1.md"

mkdir -p "$AGENT/docs/specs"
printf 'written in a worktree\n' > "$AGENT/docs/specs/WT-1.md"
run_hook "$MAIN" post "$(event PostToolUse coder-fleet:coder "$AGENT" Write "$AGENT/docs/specs/WT-1.md")"
ok "S14 a linked worktree's docs/specs/ is not the spec home and is not carried" "$(state_lacks WT-1.md; echo $?)"

printf 'with commits off\n' > "$SPECS/CF-5.md"
printf '%s' "$(event PostToolUse "" "$MAIN" Write "$SPECS/CF-5.md")" \
    | (cd "$TMP" && CODER_FLEET_BOARD_NO_COMMIT=1 CLAUDE_PROJECT_DIR="$MAIN" bash "$HOOK" post) >/dev/null 2>>"$TMP/hook.err"
ok "S15 with board commits off nothing is carried" "$(state_lacks CF-5.md && [ ! -e "$STATE/docs/specs/CF-5.md" ]; echo $?)"
rm -f "$SPECS/CF-5.md"

mkdir -p "$SPECS/x/.GIT" "$SPECS/CF-9"
printf 'run me\n' > "$SPECS/evil.sh"
printf 'notes\n' > "$SPECS/notes.txt"
printf 'hook\n' > "$SPECS/x/.GIT/pre-commit.md"
printf 'backup\n' > "$SPECS/CF-9.md~"
printf 'tab\n' > "$SPECS/$(printf 'a\tb.md')"
printf 'back\n' > "$SPECS/a\\b.md"
printf 'a picture caption\n' > "$SPECS/CF-9/caption.md"
printf '# CF-9\n' > "$SPECS/CF-9.md"
run_hook "$MAIN" start "$(event SessionStart "" "$MAIN" "" "")"
ok "S17 a .md spec, nested or not, is carried" "$(on_state CF-9.md | grep -qx '# CF-9' && on_state CF-9/caption.md | grep -q caption; echo $?)"
ok "S17 a non-.md file, a .GIT component, an editor backup, a tab or a backslash in a name is never carried" \
    "$([ -z "$(g "$MAIN" ls-tree -r --name-only coder-fleet/state -- docs/specs | grep -E 'evil|notes\.txt|GIT|~$|"')" ]; echo $?)" \
    "$(g "$MAIN" ls-tree -r --name-only coder-fleet/state -- docs/specs)"
rm -rf "$SPECS/x" "$SPECS/evil.sh" "$SPECS/notes.txt" "$SPECS/CF-9.md~" "$SPECS/$(printf 'a\tb.md')" "$SPECS/a\\b.md"

# ------------------------------------------------------------------ not migrated
T="$TMP/t"
fixture "$T" tracked
TMAIN="$T/main"
# Excluded as well, so the tracking alone is what keeps the hook out.
printf '/docs/specs/\n' >> "$TMAIN/.git/info/exclude"
TBEFORE=$(g "$TMAIN" rev-parse coder-fleet/state)
printf 'a new spec in a project not migrated\n' > "$TMAIN/docs/specs/NEW-1.md"
: > "$BOARD_LOG_FILE"
run_hook "$TMAIN" post "$(event PostToolUse coder-fleet:spec-writer "$TMAIN" Write "$TMAIN/docs/specs/NEW-1.md")"
run_hook "$TMAIN" start "$(event SessionStart "" "$TMAIN" "" "")"
ok "S16 in a project whose default branch tracks docs/specs/ nothing is carried" "$([ "$(g "$TMAIN" rev-parse coder-fleet/state)" = "$TBEFORE" ]; echo $?)" "$(g "$TMAIN" log --oneline -2 coder-fleet/state)"
ok "S16 and the log says it still tracks docs/specs/ and is not migrated" "$(grep -q 'still tracks docs/specs/.*not migrated' "$BOARD_LOG_FILE"; echo $?)" "$(cat "$BOARD_LOG_FILE" 2>/dev/null)"

ok "the hook exited 0 every time" "$([ ! -s "$TMP/hook.err" ] || ! grep -q '^exit ' "$TMP/hook.err"; echo $?)" "$(cat "$TMP/hook.err")"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'A spec may not reach the state branch, or may reach the default branch, or a local copy may be lost.\n'
    exit 1
fi
printf 'Specs are carried to coder-fleet/state and nowhere else, and no local copy is lost.\n'
