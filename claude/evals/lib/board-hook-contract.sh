#!/usr/bin/env bash
#
# board-hook-contract.sh - hold the board hooks to the runtime's actual event
# shapes, and to the rule that a hook may move a card only on evidence.
#
# Every field asserted here was read out of the shipped CLI's own zod schemas
# rather than the docs pages, which truncate:
#
#   TaskCompleted   task_id, task_subject, task_description?, teammate_name?,
#                   team_name?                    (no task_title, no task_name)
#   SubagentStart   agent_id, agent_type          (no spawn prompt of any name)
#   SubagentStop    stop_hook_active, agent_id, agent_transcript_path,
#                   agent_type, last_assistant_message?, background_tasks?
#                                                 (no status, no completion_reason)
#
# Three of the fleet's hooks were reading fields from that "no" column. A hook
# that reads a field which does not exist does not fail loudly - it silently
# takes its fallback path forever, and the fallback looked like normal
# operation. These cases exist so that never goes unnoticed again.
#
# R17 holds SubagentStart to the resume rule: a second start for the same agent
# id keeps the item its first start bound, whatever the focus says by then, and
# moves it back to In Progress unless it is Done. Its cases drive the hooks
# against the stub board, with run_stub keeping one state directory across a
# start, a resume and a stop, and one live case re-fires a start on the real
# binary to move an item out of Blocked by human.
#
# R18 holds a refused move to one card comment per session, item and column,
# naming the override that produced the column, and never a column write; any
# other failure stays in the log. R19 holds board-env-check.sh, the SessionStart
# hook, to naming each BOARD_COL_* override the config does not list, being
# silent and starting nothing without one, and printing nothing else from
# board.env.
#
# R20 holds the Actions for Human route (CF-25): each Blocker line is added to
# the card verbatim in a `task edit --action=<text>` call of its own, after the
# move and any refused-move note and before the unchanged Blocker comment, and
# SubagentStart leaves a Blocked by human card with an open action where it is,
# on a first start and a resume, reading both from one `task view --json`. Its
# live cases prove the hooks and the checkout's binary together: the question at
# the top of a real card, the hold, the append, and the archive on the move out.
#
# R21 holds a run that ends without SubagentStop to one card comment (CF-64):
# SubagentStop leaves a stopped marker on every path, exit 2 included, and
# board-agent-return.sh, on the Agent tool's PostToolUse, comments once on a
# bound fleet agent's card when a completed run has no marker - naming the turn
# cap when the runtime's note says so - and never moves a column.
#
# Usage:  evals/lib/board-hook-contract.sh [-v]
#
# Nothing here touches a real board: CODER_FLEET_BOARD=off for the offline
# cases, a throwaway config and state directory, and the live pass below runs
# against a board root created under $TMP.

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)
HOOKS="$PLUGIN_ROOT/hooks"

command -v jq >/dev/null 2>&1 || {
    printf 'board-hook-contract: jq is needed to drive the hooks\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/board-hook-contract.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

export CODER_FLEET_CONFIG_DIR="$TMP/config"
export CODER_FLEET_STATE_DIR="$TMP/state"
export CODER_FLEET_BOARD=off
# The library defaults the board root to $HOME/.memory. Nothing offline here
# ever spawns the binary, but the default is not something a test suite should
# be one bug away from writing into: point it at the throwaway tree instead.
export CODER_FLEET_BOARD_ROOT="$TMP/no-board"
# board.env is never read from the throwaway config directory, but a column
# override exported in the shell that runs this suite would still reach every
# hook. Clear all five so every case sees the library's own defaults.
unset BOARD_COL_TODO BOARD_COL_DOING BOARD_COL_BLOCKED BOARD_COL_BLOCKED_HUMAN BOARD_COL_DONE
# The same goes for the test gate. Claude Code hands a project's settings env to
# every Bash call and hook, and this repository's own settings set a strict gate
# that runs check-all.sh (CF-57), so a run of this suite from inside a session,
# or from inside that gate, would otherwise hand those values to the
# TaskCompleted cases and fail them.
unset CODER_FLEET_TEST_COMMAND CODER_FLEET_TEST_GATE CODER_FLEET_TEST_TIMEOUT CODER_FLEET_TEST_STATUS_FILE CODER_FLEET_TEST_STATUS_MAX_AGE
mkdir -p "$CODER_FLEET_CONFIG_DIR" "$CODER_FLEET_STATE_DIR"

# Board items are the plugin's own task ids, not UUIDs. The hooks uppercase a
# ref before logging, so assertions match the resolved id rather than the text
# that happened to be in the task subject.
PAGE_A=BD-1
PAGE_B=BD-2

PASSED=0
FAILED=0

# run <hook> <json> -> writes exit code to $RC, hook log to $LOG
run_hook() {
    local hook="$1" json="$2"
    LOG="$TMP/log.$$"
    : > "$LOG"
    RC=0
    printf '%s' "$json" | BOARD_LOG_FILE="$LOG" "$HOOKS/$hook" >"$TMP/out" 2>"$TMP/err" || RC=$?
}

check() {
    # $1 case name, $2 description of the requirement, $3 predicate result (0 ok)
    if [ "$3" -eq 0 ]; then
        PASSED=$((PASSED + 1))
        printf '  ok    %-42s %s\n' "$1" "$2"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %-42s %s\n' "$1" "$2"
        if [ "$VERBOSE" -eq 1 ]; then
            printf '        exit=%s\n' "$RC"
            sed 's/^/        log: /' "$LOG" 2>/dev/null | head -10
        fi
    fi
}

log_has() { grep -qF "$1" "$LOG" 2>/dev/null; }

printf '\nTaskCompleted: the documented subject field\n'

# R05. The runtime sends task_subject. A marker in it must bind the item.
run_hook board-task-completed.sh \
    "$(jq -nc --arg s "Ship the refresh [board:$PAGE_A]" --arg c "$TMP" \
        '{session_id:"s1",cwd:$c,task_id:"t1",task_subject:$s}')"
log_has "names board item $PAGE_A"; check task_subject-binds "a [board:] marker in task_subject resolves the item" $?

# The legacy names stay readable, so an older build is not broken by the fix.
run_hook board-task-completed.sh \
    "$(jq -nc --arg s "Ship the refresh [board:$PAGE_A]" --arg c "$TMP" \
        '{session_id:"s1",cwd:$c,task_id:"t1",task_title:$s}')"
log_has "names board item $PAGE_A"; check task_title-fallback "the legacy task_title is still read as a fallback" $?

# Subject wins when both are present and disagree.
run_hook board-task-completed.sh \
    "$(jq -nc --arg a "Real [board:$PAGE_A]" --arg b "Stale [board:$PAGE_B]" --arg c "$TMP" \
        '{session_id:"s1",cwd:$c,task_id:"t1",task_subject:$a,task_title:$b}')"
log_has "names board item $PAGE_A" && ! log_has "$PAGE_B"; check subject-wins "task_subject wins over a conflicting task_title" $?

# A ref is a BD id in any case, a sub-task id, or a task file path. A
# tracker URL and a UUID are not refs.
run_hook board-task-completed.sh \
    "$(jq -nc --arg s "Ship the refresh [board:bd-12]" --arg c "$TMP" \
        '{session_id:"s1",cwd:$c,task_id:"t1",task_subject:$s}')"
log_has "names board item BD-12"; check identifier-binds "a lower-case id resolves, uppercased" $?

run_hook board-task-completed.sh \
    "$(jq -nc --arg s "Ship [board:BD-12.3]" --arg c "$TMP" \
        '{session_id:"s1",cwd:$c,task_id:"t1",task_subject:$s}')"
log_has "names board item BD-12.3"; check subtask-binds "a sub-task id resolves" $?

run_hook board-task-completed.sh \
    "$(jq -nc --arg s "Ship [board:/home/x/.memory/board/tasks/BD-12 - Ship-the-refresh.md]" --arg c "$TMP" \
        '{session_id:"s1",cwd:$c,task_id:"t1",task_subject:$s}')"
log_has "names board item BD-12" && ! log_has "SHIP"; check path-binds "a task file path resolves to its id, not its title" $?

run_hook board-task-completed.sh \
    "$(jq -nc --arg s "Ship [board:https://tracker.example/team/issue/ABC-123/fix-thing-2]" --arg c "$TMP" \
        '{session_id:"s1",cwd:$c,task_id:"t1",task_subject:$s}')"
! log_has "names board item"; check url-is-not-a-ref "a tracker URL is not a ref" $?

run_hook board-task-completed.sh \
    "$(jq -nc --arg s "Ship [board:11111111-1111-1111-1111-111111111111]" --arg c "$TMP" \
        '{session_id:"s1",cwd:$c,task_id:"t1",task_subject:$s}')"
! log_has "names board item"; check uuid-is-not-a-ref "a UUID is no longer a ref" $?

printf '\nTaskCompleted: only an explicit issue task closes an issue\n'

# R06. Bind two items in the session, then complete an unmarked task. Neither
# item may move: the old code picked whichever was touched most recently.
mkdir -p "$CODER_FLEET_STATE_DIR/sessions/s2"
printf '%s\n' "$PAGE_A" > "$CODER_FLEET_STATE_DIR/sessions/s2/last-item"
printf '%s\n' "$PAGE_B" > "$CODER_FLEET_STATE_DIR/sessions/s2/last-item"
run_hook board-task-completed.sh \
    "$(jq -nc --arg c "$TMP" '{session_id:"s2",cwd:$c,task_id:"t2",task_subject:"Fix the parser"}')"
! log_has "$PAGE_A" && ! log_has "$PAGE_B"; check unmarked-moves-nothing "an unmarked execution task moves no card" $?
log_has "no column moves"; check unmarked-explains "and says why, rather than failing silently" $?

# The environment binding must not close an issue either. It says which item is
# in flight, never that this task finished it.
run_hook board-task-completed.sh \
    "$(CODER_FLEET_BOARD_PAGE_ID=$PAGE_A jq -nc --arg c "$TMP" \
        '{session_id:"s3",cwd:$c,task_id:"t3",task_subject:"Partial work"}')"
! log_has "$PAGE_A"; check env-does-not-close "CODER_FLEET_BOARD_PAGE_ID alone does not close an issue" $?

printf '\nTaskCompleted: the gate tests the checkout that did the work\n'

# R03. Parent tree passes, worktree fails. The hook is told cwd=worktree and
# CLAUDE_PROJECT_DIR=parent, which is exactly what an isolated coder produces.
mkdir -p "$TMP/parent/.claude" "$TMP/worktree/.claude"
printf 'pass\n' > "$TMP/parent/.claude/test-status"
printf 'fail\nassertion failed in session.test.ts\n' > "$TMP/worktree/.claude/test-status"
RC=0
printf '%s' "$(jq -nc --arg c "$TMP/worktree" \
    '{session_id:"s4",cwd:$c,task_id:"t4",task_subject:"done"}')" \
    | CLAUDE_PROJECT_DIR="$TMP/parent" BOARD_LOG_FILE="$TMP/log.$$" \
      "$HOOKS/board-task-completed.sh" >"$TMP/out" 2>"$TMP/err" || RC=$?
LOG="$TMP/log.$$"
[ "$RC" -eq 2 ]; check worktree-is-tested "a failing worktree blocks even when the parent passes" $?

# R03, the other half: a pass that predates the code it approves is not evidence.
mkdir -p "$TMP/stale/.claude"
printf 'pass\n' > "$TMP/stale/.claude/test-status"
sleep 1
printf 'console.log("edited after the tests ran")\n' > "$TMP/stale/app.js"
run_hook board-task-completed.sh \
    "$(jq -nc --arg c "$TMP/stale" '{session_id:"s5",cwd:$c,task_id:"t5",task_subject:"done"}')"
log_has "has been modified since"; check stale-pass-ignored "a pass older than the tree is not treated as a pass" $?

# A fresh pass on an untouched tree still works, or the gate is just broken.
mkdir -p "$TMP/fresh/.claude"
printf 'console.log("code")\n' > "$TMP/fresh/app.js"
sleep 1
printf 'pass\n' > "$TMP/fresh/.claude/test-status"
run_hook board-task-completed.sh \
    "$(jq -nc --arg c "$TMP/fresh" '{session_id:"s6",cwd:$c,task_id:"t6",task_subject:"done"}')"
[ "$RC" -eq 0 ] && log_has "tests pass; moving to"; check fresh-pass-honoured "a pass newer than the tree is still honoured" $?

# A missing cwd means there is no checkout to verify, so it must refuse.
run_hook board-task-completed.sh \
    '{"session_id":"s7","cwd":"/nonexistent/nowhere","task_id":"t7","task_subject":"done"}'
[ "$RC" -eq 2 ]; check absent-cwd-blocks "an unusable cwd blocks rather than testing \$PWD" $?

printf '\nSubagentStart: binding without a spawn prompt\n'

# R07. The documented event carries agent identity only. With a session
# binding it must record the item; without one it must do nothing and say so.
run_hook board-subagent-start.sh \
    '{"session_id":"s8","agent_id":"a1","agent_type":"coder-fleet:coder"}'
log_has "nothing is focused"; check start-unbound-noop "a documented-shape start event with no binding moves nothing" $?

RC=0
printf '%s' '{"session_id":"s9","agent_id":"a2","agent_type":"coder-fleet:coder"}' \
    | CODER_FLEET_BOARD_PAGE_ID="$PAGE_A" BOARD_LOG_FILE="$TMP/log.$$" \
      "$HOOKS/board-subagent-start.sh" >"$TMP/out" 2>"$TMP/err" || RC=$?
LOG="$TMP/log.$$"
log_has "picked up $PAGE_A"; check start-env-binds "an explicit session binding is recorded" $?

printf '\nSubagentStop: no status field exists\n'

# R15. The runtime sends no status and no completion_reason, so the hook reads
# neither. Blocked is written by TaskCompleted only. A payload that carries one
# anyway changes nothing: a failure status does not route around the handoff
# check, and a cancelled reason does not replace the normal no-blocker log.
#
# Both cases run with an item bound and the board on in dry run, because with
# no item a Blocked write logs "nothing to move" rather than naming a column,
# and an unbound case cannot see the write it exists to forbid. The variables
# are scoped to the one hook invocation, as start-env-binds does above, so
# nothing leaks into the offline cases that follow.
run_hook_bound() {
    local hook="$1" json="$2"
    LOG="$TMP/log.$$"
    : > "$LOG"
    RC=0
    printf '%s' "$json" \
      | CODER_FLEET_BOARD=on BOARD_DRY_RUN=1 CODER_FLEET_BOARD_PAGE_ID="$PAGE_A" \
        BOARD_LOG_FILE="$LOG" "$HOOKS/$hook" >"$TMP/out" 2>"$TMP/err" || RC=$?
}

# A move to Blocked, and never a move to Blocked by human: the dry-run line ends
# at the column name or at " with a comment".
log_moved_to_blocked() {
    grep -qE "would move $PAGE_A to Blocked( with a comment)?\$" "$LOG" 2>/dev/null
}

run_hook_bound board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s10",agent_id:"a3",agent_type:"coder-fleet:scout",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                status:"failure",last_assistant_message:"I gave up."}')"
[ "$RC" -eq 2 ] && ! log_has "finished with status" && ! log_moved_to_blocked
check stop-status-failure-ignored "a status field does not bypass the handoff check or write Blocked" $?

run_hook_bound board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s10b",agent_id:"a3b",agent_type:"coder-fleet:scout",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                status:"failure",completion_reason:"cancelled",
                last_assistant_message:"## Done\n- x\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n"}')"
[ "$RC" -eq 0 ] && log_has "succeeded with no blockers" && ! log_has "finished with status" && ! log_moved_to_blocked
check stop-completion-reason-ignored "a failure status and a cancelled reason on a valid handoff change nothing" $?

printf '\nSubagentStop: the board writes, item-bound in dry run\n'

# These dry-run cases prove the calls are made, on every machine. The live
# SubagentStop cases further down run against the binary and skip where neither
# bun nor an installed board resolves through the shim, and they cover the
# Blocker route only: that the item moves to Blocked by human, that a comment
# holding the blocker line lands, and that the comment is its own commit. No live
# case covers the Done comment, and nothing checks the rest of either comment's
# text - headline, layout, the Done items; a board item tracks that gap. Each
# dry-run case asserts the dry-run line board.sh writes at the
# moment of the call, not the hook's own log line before it, so a call that was
# dropped or pointed at the wrong column cannot pass on the log line alone.

# A clean finish comments "## Done" on the card and moves nothing.
run_hook_bound board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s16",agent_id:"a16",agent_type:"coder-fleet:coder",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                last_assistant_message:"## Done\n- Shipped the refresh\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n"}')"
[ "$RC" -eq 0 ] && log_has "would comment on $PAGE_A" && ! log_has "would move $PAGE_A"
check stop-done-comment-posted "a valid no-blocker handoff comments on the item and moves no column" $?

# A Blocker: line moves the item to Blocked by human, carrying the blocker text
# as the comment. board_write takes the comment as its fourth argument, so the
# dry-run line for this route is the move line with " with a comment" on it.
run_hook_bound board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s17",agent_id:"a17",agent_type:"coder-fleet:coder",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                last_assistant_message:"## Done\n- Half the refresh\n\n## Not done\n- The rest\n\n## Unverified\n- None\n\n## Decisions needed\n- Blocker: which key?\n"}')"
[ "$RC" -eq 0 ] && log_has "would move $PAGE_A to Blocked by human"
check stop-blocker-moves-to-human "a Blocker: line moves the item to Blocked by human" $?
[ "$RC" -eq 0 ] && log_has "would move $PAGE_A to Blocked by human with a comment" && ! log_moved_to_blocked
check stop-blocker-comments "and the move carries the blocker comment, never a move to Blocked" $?

printf '\nSubagentStop: a structured-output run carries no handoff\n'

# Measured against Claude Code 2.1.236 with a live probe, not read from docs: a
# subagent spawned from a workflow with a schema is forced through
# StructuredOutput, and its SubagentStop payload OMITS last_assistant_message
# entirely. Not JSON in that field, not an empty string - the key is absent.
#
# The hook read it as `// ""`, went down the ordinary stop path, and failed
# validate_handoff with "the final message is empty", exiting 2. Every workflow
# spawns fleet agents with schemas - scout and reviewer in review-round,
# researcher in deep-research, scout and spec-writer in spec-to-card - and the
# SubagentStop matcher covers all ten fleet names, so the gate had been
# refusing to let those runs stop. Scoping the matcher (README item 12) fixed
# this for the lanes Claude Code's built-in agents ran; it cannot help when the
# schema-carrying agent is itself a fleet agent.
#
# A run with no handoff field is not a malformed handoff. It is a run that was
# never asked for one.
run_hook board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s11",agent_id:"a4",agent_type:"coder-fleet:scout",
                stop_hook_active:false,agent_transcript_path:"/dev/null"}')"
[ "$RC" -eq 0 ]; check stop-structured-run-passes "a schema-spawned run with no handoff field is not a malformed handoff" $?

# A guard on the validator, NOT coverage of the empty-handoff case. The runtime
# builds the field as `.trim() || void 0`, so `last_assistant_message: ""` never
# actually arrives - an empty handoff drops the key instead, and the transcript
# section below is what catches it. This case stays because it stops a future
# reader from deciding that empty is close enough to absent, but it should not
# be counted as proof that an empty handoff is refused.
run_hook board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s12",agent_id:"a5",agent_type:"coder-fleet:scout",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                last_assistant_message:""}')"
[ "$RC" -eq 2 ]; check stop-empty-message-blocks "an empty final message is still a malformed handoff" $?

# And prose in place of the four headings stays refused, so the fix cannot be a
# blanket softening of the gate.
run_hook board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s13",agent_id:"a6",agent_type:"coder-fleet:scout",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                last_assistant_message:"I fixed it. Looks good to me."}')"
[ "$RC" -eq 2 ]; check stop-prose-blocks "prose in place of a handoff is still refused" $?

# A stop with no agent_type at all is not a fleet agent. It never had the
# handoff skill preloaded and never agreed to the contract, so there is nothing
# to validate and no re-emit will ever produce the four headings. Issue 8: this
# case was exit 2 on every untyped spawn, 2562 log lines in nine days, burying
# the real malformed handoffs 67 to 1. The log line has to name the case too.
run_hook board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s14",agent_id:"a7",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                last_assistant_message:"I fixed it. Looks good to me."}')"
[ "$RC" -eq 0 ]; check stop-untyped-stands-down "a stop with no agent_type owes no handoff and is let go" $?
grep -q "untyped" "$LOG"; check stop-untyped-is-named "and the log says the type was missing, not that a role called agent failed" $?

run_hook board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s15",agent_id:"a8",agent_type:"",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                last_assistant_message:"I fixed it. Looks good to me."}')"
[ "$RC" -eq 0 ]; check stop-empty-type-stands-down "an empty agent_type is the same missing type" $?

printf '\nSubagentStop: absent means ask the transcript\n'

# The runtime builds the field as `xd(content).trim() || void 0`, so a final
# message that is empty or whitespace becomes undefined and drops out of the
# payload entirely. Two very different runs therefore arrive here IDENTICAL:
# a schema spawn, which was never asked for a handoff, and a fleet agent that
# was asked and produced nothing - which is the exact thing the gate exists to
# catch. `last_assistant_message: ""` is unreachable, so no test of it can
# cover this.
#
# agent_transcript_path is what tells them apart, and both shapes below were
# read off real transcripts from the 10 September probe: the schema run's last
# assistant content block is a StructuredOutput tool_use, the other's is text.

mk_transcript() {
    # $1 file, $2 "structured" | "text" | "emptytext" | "none"
    case "$2" in
      structured) printf '%s\n' \
        '{"type":"assistant","message":{"content":[{"type":"text","text":"working"}]}}' \
        '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"StructuredOutput","input":{"verdict":"approve"}}]}}' > "$1" ;;
      text) printf '%s\n' \
        '{"type":"assistant","message":{"content":[{"type":"text","text":"## Done\n- x\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None"}]}}' > "$1" ;;
      emptytext) printf '%s\n' \
        '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{}}]}}' \
        '{"type":"assistant","message":{"content":[{"type":"text","text":"   "}]}}' > "$1" ;;
      none) printf '%s\n' '{"type":"user","message":{"content":[]}}' > "$1" ;;
    esac
}

stop_absent() {
    # $1 transcript path (may not exist)
    jq -nc --arg t "$1" '{session_id:"s20",agent_id:"a20",agent_type:"coder-fleet:scout",
                          stop_hook_active:false,agent_transcript_path:$t}'
}

mk_transcript "$TMP/t-structured.jsonl" structured
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-structured.jsonl")"
[ "$RC" -eq 0 ] && log_has "StructuredOutput"; check stop-transcript-structured-passes "a StructuredOutput final block is a run that owed no handoff" $?

# The case the gate exists for, and the one it had stopped catching.
mk_transcript "$TMP/t-empty.jsonl" emptytext
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-empty.jsonl")"
[ "$RC" -eq 2 ]; check stop-transcript-empty-handoff-blocks "a fleet agent that was asked and said nothing still fails" $?

# A text block that IS a handoff can only reach here if the runtime dropped a
# field it should have sent; recover it rather than guess.
mk_transcript "$TMP/t-text.jsonl" text
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-text.jsonl")"
[ "$RC" -eq 0 ]; check stop-transcript-recovers-a-handoff "a recoverable handoff is read rather than refused" $?

# Cannot tell is not the same as either answer, and it must not deadlock a run.
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/nonexistent.jsonl")"
[ "$RC" -eq 0 ] && log_has "could not be read"; check stop-transcript-unreadable-passes "an unreadable transcript says so and lets the run stop" $?

run_hook board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s21",agent_id:"a21",agent_type:"coder-fleet:scout",stop_hook_active:false}')"
[ "$RC" -eq 0 ]; check stop-no-transcript-path-passes "and so does an event carrying no transcript path at all" $?

mk_transcript "$TMP/t-none.jsonl" none
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-none.jsonl")"
[ "$RC" -eq 0 ]; check stop-transcript-no-assistant-passes "a transcript with no assistant content decides nothing" $?

# `last` was taken over a list already filtered to StructuredOutput-or-text, so
# a final block that is neither - an ordinary tool call with no closing prose -
# was invisible and the reader reached back to an EARLIER text block and called
# it the final message. That re-created the original failure: exit 2, telling an
# agent to re-emit a handoff, quoting text that was never one.
printf '%s\n' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Let me check the config file."}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}' \
  > "$TMP/t-trailing-tool.jsonl"
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-trailing-tool.jsonl")"
[ "$RC" -eq 0 ]; check stop-transcript-trailing-tool-passes "a transcript ending in a tool call is not a handoff to validate" $?
log_has "ends in text"; [ $? -ne 0 ]; check stop-transcript-does-not-claim-text "and the hook does not claim it ended in text" $?

# The discriminator has to discriminate: any tool_use last must not read as a
# StructuredOutput one, or the load-bearing test of the whole fix proves nothing.
printf '%s\n' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"StructuredOutput","input":{"a":1}}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","input":{}}]}}' \
  > "$TMP/t-tool-after-structured.jsonl"
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-tool-after-structured.jsonl")"
log_has "StructuredOutput"; [ $? -ne 0 ]; check stop-transcript-tool-is-not-structured "a later ordinary tool call is not read as structured output" $?

# Only assistant turns speak for the agent.
printf '%s\n' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"## Done\n- x\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None"}]}}' \
  '{"type":"user","message":{"content":[{"type":"text","text":"not the agent talking"}]}}' \
  > "$TMP/t-user-last.jsonl"
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-user-last.jsonl")"
[ "$RC" -eq 0 ]; check stop-transcript-ignores-user-turns "a user turn after the agent's does not become the handoff" $?

# The `!= yes` hardening: a payload jq cannot read must not fall through and be
# validated as an empty handoff.
RC=0
printf '' | BOARD_LOG_FILE="$TMP/log.$$" "$HOOKS/board-subagent-stop.sh" >"$TMP/out" 2>"$TMP/err" || RC=$?
[ "$RC" -eq 0 ]; check stop-empty-stdin-does-not-block "empty stdin is not a malformed handoff" $?

printf '\nSubagentStop: the matcher covers the whole roster\n'

# The matcher is what decides whether an agent's handoff is checked at all, so
# an agent missing from it fails open and silently: no format gate, no card
# comment, and no route to the human queue for its blockers.
MATCHER=$(jq -r '.hooks.SubagentStop[0].matcher' "$HOOKS/hooks.json")
for agent in lead scout spec-writer coder reviewer ui-designer tech-writer researcher fleet-steward refuter; do
    printf '%s' "$MATCHER" | grep -q "[(|]$agent[|)]"
    check "matcher-$agent" "the matcher names $agent" $?
done

printf '\nhooks.json: the plugin-root placeholder must survive to the runtime\n'

# ${CLAUDE_PLUGIN_ROOT} is resolved after the command string reaches a shell,
# and single quotes are precisely the quoting that forbids expansion: the
# session looks for a file literally named ${CLAUDE_PLUGIN_ROOT}/... and every
# hook fails open, non-blocking, on every tool call - the board writes and the
# scope guard together. Found live on 11 September 2026, not by this suite,
# because the suite runs the hook scripts directly by path and so validated
# everything about them except whether a session could find them.
RC=0
jq -r '.hooks[][].hooks[].command' "$HOOKS/hooks.json" | grep -qF "'\${CLAUDE_PLUGIN_ROOT}" && RC=1
check commands-not-single-quoted "no command single-quotes the plugin-root placeholder" $RC

RC=0
jq -r '.hooks[][].hooks[].command' "$HOOKS/hooks.json" | grep -qvF '${CLAUDE_PLUGIN_ROOT}' && RC=1
check commands-use-plugin-root "every command locates its script by the plugin root" $RC

printf '\nThe library: an empty comment never reaches the binary\n'

# board_comment already refuses a whitespace-only text, but board_comment_raw is
# the other public entry point and had no guard of its own: a caller reaching it
# directly could post a card comment that says nothing at all. Not reachable
# from the three hooks, so the library is called directly here. Nothing leaves
# the process either way: board_comment_raw never consults the enable switch,
# so the guard is the only thing that can stop the call reaching the shim.
RC=0
LOG="$TMP/log.raw"
: > "$LOG"
(
    BOARD_LOG_FILE="$LOG"
    CODER_FLEET_BOARD=on
    unset BOARD_DRY_RUN
    # shellcheck source=/dev/null
    . "$HOOKS/lib/board.sh"
    board_comment_raw probe BD-1 "   "
) >"$TMP/out" 2>"$TMP/err" || RC=$?
[ "$RC" -ne 0 ] && log_has "nothing posted"; check comment-raw-refuses-empty "board_comment_raw refuses a whitespace-only comment" $?

printf '\nSubagentStart: the in-progress column follows the board config\n'

# R16. The fleet's second column is "In Progress", and a board not yet renamed
# still says "Doing". With no override, SubagentStart asks the board which of
# the two its config lists and writes that one; with neither it moves nothing
# and says why; an explicit BOARD_COL_DOING wins and is logged. CI has no bun,
# so these cases drive the hook against a stub binary through BOARD_SHIM, which
# answers the status probe the way the real one does. live-start-doing-board,
# in the live pass below, checks that wording against the real binary.
STUB="$TMP/stub-board"
STUB_CALLS="$TMP/stub-calls"
cat > "$STUB" <<'STUB_EOF'
#!/usr/bin/env bash
# Every call is recorded as "call: <args>"; a status edit the config accepts is
# recorded again as "edit <id> <the config's spelling>", and a comment edit as
# "comment <id>", with its body appended to $STUB_CALLS.body. STUB_FOCUS is what
# the focus file holds (BD-1 when unset, nothing when empty), STUB_FOCUS_FAIL
# makes the focus read itself fail, STUB_STATUS is the status every item
# reports (To Do when unset), STUB_EDIT_FAIL fails every edit with "no board
# here", and STUB_COMMENT_FAIL fails every comment edit. An edit carrying
# --action=<text> records "action <id> <text>" once per action, and a bare
# --action records "action-bare <id> <next argument>", which no case expects;
# STUB_ACTION_FAIL fails such an edit as a binary older than the flag does.
# STUB_ACTIONS is the JSON array every item reports as actionsForHuman ([] when
# unset), and STUB_ACTIONS=omit leaves the key out, as an old binary does.
printf 'call: %s\n' "$*" >> "$STUB_CALLS"
norm() { printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -d ' '; }
canon() {
    want="$(norm "$1")"
    old_ifs="$IFS"; IFS='|'
    for s in $STUB_STATUSES; do
        if [ "$(norm "$s")" = "$want" ]; then IFS="$old_ifs"; printf '%s' "$s"; return 0; fi
    done
    IFS="$old_ifs"
    printf 'invalid status "%s". Configured statuses: %s\n' "$1" "$(printf '%s' "$STUB_STATUSES" | sed 's/|/, /g')" >&2
    return 1
}
case "$1 ${2:-}" in
    "focus --show")
        if [ -n "${STUB_FOCUS_FAIL:-}" ]; then printf 'stub: focus read asked to fail\n' >&2; exit 1; fi
        if [ -n "${STUB_FOCUS-BD-1}" ]; then printf '%s\n' "${STUB_FOCUS-BD-1}"; fi ;;
    "task view")
        if [ -n "${STUB_VIEW_FAIL_ONCE:-}" ] && [ ! -e "$STUB_CALLS.view-failed" ]; then
            : > "$STUB_CALLS.view-failed"; printf 'stub: first view asked to time out\n' >&2; exit 124
        fi
        if [ "${STUB_ACTIONS:-}" = omit ]; then
            printf '{"task":{"id":"%s","status":"%s"}}\n' "$3" "${STUB_STATUS:-To Do}"
        else
            printf '{"task":{"id":"%s","status":"%s","actionsForHuman":%s}}\n' "$3" "${STUB_STATUS:-To Do}" "${STUB_ACTIONS:-[]}"
        fi ;;
    "task list")
        if [ -n "${STUB_LIST_FAIL:-}" ]; then printf 'no board here: stub asked to fail\n' >&2; exit 1; fi
        if [ -n "${STUB_LIST_FAIL_ON:-}" ] && [ "$(norm "$4")" = "$(norm "$STUB_LIST_FAIL_ON")" ]; then
            printf 'no board here: stub asked to fail on %s\n' "$4" >&2; exit 1
        fi
        canon "$4" >/dev/null || exit 1 ;;
    "task edit")
        if [ -n "${STUB_EDIT_FAIL:-}" ]; then printf 'no board here: stub asked to fail\n' >&2; exit 1; fi
        id="$3"; is_action=""
        for a in "$@"; do case "$a" in --action|--action=*) is_action=1 ;; esac; done
        if [ -n "$is_action" ]; then
            if [ -n "${STUB_ACTION_FAIL:-}" ]; then printf "error: unknown option '--action'\n" >&2; exit 1; fi
            shift 3
            while [ $# -gt 0 ]; do
                case "$1" in
                    --action=*) printf 'action %s %s\n' "$id" "${1#--action=}" >> "$STUB_CALLS" ;;
                    --action) printf 'action-bare %s %s\n' "$id" "${2:-}" >> "$STUB_CALLS"; [ $# -gt 1 ] && shift ;;
                esac
                shift
            done
            exit 0
        fi
        if [ -n "${STUB_COMMENT_FAIL:-}" ] && [ "${4:-}" != "-s" ]; then printf 'stub: comment asked to fail\n' >&2; exit 1; fi
        if [ "${4:-}" = "-s" ]; then
            c="$(canon "$5")" || exit 1
            printf 'edit %s %s\n' "$3" "$c" >> "$STUB_CALLS"
        else
            printf 'comment %s\n' "$3" >> "$STUB_CALLS"
            printf '%s\n' "${5:-}" >> "$STUB_CALLS.body"
        fi ;;
    *) printf 'stub: unexpected call: %s\n' "$*" >&2; exit 1 ;;
esac
STUB_EOF
chmod +x "$STUB"

# run_start_stub STATUSES [VAR=value ...] -> $RC, $LOG, and the calls in $STUB_CALLS
START_N=0
run_start_stub() {
    local statuses="$1"; shift
    START_N=$((START_N + 1))
    LOG="$TMP/log.$$"
    : > "$LOG"
    : > "$STUB_CALLS"
    RC=0
    jq -nc --arg c "$TMP" --arg s "col-$START_N" \
        '{session_id:$s,agent_id:"a-col",agent_type:"coder-fleet:coder",cwd:$c}' \
      | env CODER_FLEET_BOARD=on BOARD_SHIM="$STUB" STUB_CALLS="$STUB_CALLS" \
            STUB_STATUSES="$statuses" BOARD_LOG_FILE="$LOG" "$@" \
            "$HOOKS/board-subagent-start.sh" >"$TMP/out" 2>"$TMP/err" || RC=$?
}
calls_has() { grep -qxF "$1" "$STUB_CALLS" 2>/dev/null; }
calls_count() { grep -c "^call: $1" "$STUB_CALLS" 2>/dev/null || true; }
no_edit() { ! grep -q '^edit ' "$STUB_CALLS" 2>/dev/null; }

# run_stub HOOK JSON [VAR=value ...] -> $RC, and this call's log in $LOG
# Unlike run_start_stub, the session and agent ids are the caller's, and
# $STUB_CALLS is not cleared, so a case can run several events in a row against
# one state directory and read every call they made. stub_reset clears it.
run_stub() {
    local hook="$1" json="$2"; shift 2
    LOG="$TMP/log.$$"
    : > "$LOG"
    RC=0
    printf '%s' "$json" \
      | env -u CODER_FLEET_BOARD_PAGE_ID CODER_FLEET_BOARD=on BOARD_SHIM="$STUB" STUB_CALLS="$STUB_CALLS" \
            STUB_STATUSES="To Do|In Progress|Blocked|Blocked by human|Done" BOARD_LOG_FILE="$LOG" "$@" \
            "$HOOKS/$hook" >"$TMP/out" 2>"$TMP/err" || RC=$?
}
stub_reset() { : > "$STUB_CALLS"; : > "$STUB_CALLS.body"; rm -f "$STUB_CALLS.view-failed"; }
# The line number of the first or last exact match of $2 in $STUB_CALLS, or 0.
calls_line() {
    local n
    if [ "$1" = first ]; then n="$(grep -nxF "$2" "$STUB_CALLS" 2>/dev/null | head -1 | cut -d: -f1)"
    else n="$(grep -nxF "$2" "$STUB_CALLS" 2>/dev/null | tail -1 | cut -d: -f1)"; fi
    printf '%s\n' "${n:-0}"
}

run_start_stub "To Do|In Progress|Blocked|Blocked by human|Done"
calls_has "edit BD-1 In Progress"
check start-col-in-progress "a board listing In Progress gets its item moved to In Progress" $?

run_start_stub "To Do|Doing|Blocked|Blocked by human|Done"
calls_has "edit BD-1 Doing" && ! log_has "board task list failed"
check start-col-doing "a board still on Doing gets Doing, and the probe that missed logs nothing" $?

run_start_stub "to do|in progress|done"
calls_has "edit BD-1 in progress"
check start-col-case "the config's spelling is matched ignoring case and spaces" $?

run_start_stub "To Do|Doing|In Progress|Done"
calls_has "edit BD-1 In Progress" && [ "$(calls_count 'task list')" -eq 1 ]
check start-col-both "a board listing both gets In Progress, with one probe" $?

# No edit at all, accepted or rejected: a resolver that fell back to a default
# here would try an edit the stub refuses, which no_edit alone cannot see.
run_start_stub "To Do|Active|Done"
[ "$RC" -eq 0 ] && [ "$(calls_count 'task edit')" -eq 0 ] && log_has 'neither "In Progress" nor "Doing"'
check start-col-neither "a board listing neither attempts no edit and says why" $?

printf 'BOARD_COL_DOING=Active\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_start_stub "To Do|Active|In Progress|Done"
calls_has "edit BD-1 Active" && [ "$(calls_count 'task list')" -eq 0 ] && log_has "BOARD_COL_DOING is set"
check start-col-override "an explicit BOARD_COL_DOING wins, unprobed, and the log names it" $?
rm -f "$CODER_FLEET_CONFIG_DIR/board.env"

# A dry run reads no card, so it cannot know whether an open action for the
# human holds the item (R20), and reports In Progress without claiming a move.
run_start_stub "To Do|In Progress|Done" BOARD_DRY_RUN=1
[ "$(calls_count 'task list')" -eq 0 ] && [ "$(calls_count 'task edit')" -eq 0 ] \
  && log_has "would go to In Progress" && ! log_has "would move BD-1"
check start-col-dry-run "a dry run starts no probe and reports In Progress" $?

run_start_stub "To Do|Doing|Done" STUB_LIST_FAIL=1
[ "$RC" -eq 0 ] && [ "$(calls_count 'task list')" -eq 1 ] && [ "$(calls_count 'task edit')" -eq 0 ]
check start-col-probe-error "a probe that fails for another reason attempts no edit and stops probing" $?

# The first probe's "invalid status" must not carry into the second: a Doing
# probe that fails for another reason is a failure, logged as one, never read
# as "not listed" and reported as neither.
run_start_stub "To Do|Doing|Done" STUB_LIST_FAIL_ON=Doing
[ "$RC" -eq 0 ] && [ "$(calls_count 'task edit')" -eq 0 ] && log_has "no board here" \
  && ! log_has 'neither "In Progress" nor "Doing"'
check start-col-second-probe-error "a second probe failing after an invalid-status first is a failure, not neither" $?

# Quiet mode is the probe's alone. An override naming a column the board does
# not list fails on the edit, and that failure is logged (hooks/README.md).
printf 'BOARD_COL_DOING=Nope\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_start_stub "To Do|In Progress|Done"
log_has "board task edit failed"
check start-col-override-unlisted-logged "an override the board does not list logs its failed edit" $?

# And an exported BOARD_CLI_QUIET_INVALID_STATUS cannot silence it: the library
# clears the flag when it loads.
run_start_stub "To Do|In Progress|Done" BOARD_CLI_QUIET_INVALID_STATUS=1
log_has "board task edit failed"
check start-col-quiet-not-inherited "an exported quiet flag does not silence the failed edit" $?
rm -f "$CODER_FLEET_CONFIG_DIR/board.env"

printf '\nSubagentStart: a resume keeps the item it started on\n'

# R17. Resuming a subagent with SendMessage re-fires SubagentStart for the same
# agent id (hooks/README.md, the refuter clock notes). The hook used to read the
# focus again and rewrite the agent's record, so a lead that had refocused since
# the first start sent the resumed agent's Blocker to the wrong card. A resume
# keeps the record its first start wrote, and reads the focus only to log it.
# Every case runs session s-r from an empty state; a-r is the agent unless the
# case names another.
R17_START_A='{"session_id":"s-r","agent_id":"a-r","agent_type":"coder-fleet:coder","cwd":"'"$TMP"'"}'
R17_STOP_A_BLOCKER="$(jq -nc --arg c "$TMP" '{session_id:"s-r",agent_id:"a-r",agent_type:"coder-fleet:coder",cwd:$c,
    stop_hook_active:false,agent_transcript_path:"/dev/null",
    last_assistant_message:"## Done\n- Half of it\n\n## Not done\n- The rest\n\n## Unverified\n- None\n\n## Decisions needed\n- Blocker: which key?\n"}')"
r17_reset() { stub_reset; rm -rf "$CODER_FLEET_STATE_DIR/sessions/s-r"; }

r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-2
[ "$(grep -cxF 'edit BD-1 In Progress' "$STUB_CALLS")" -eq 2 ] && ! grep -q '^edit BD-2' "$STUB_CALLS"
check resume-keeps-first-binding "a resume after a refocus moves the item it started on, not the focus" $?
log_has "keeping BD-1" && log_has "focus is now BD-2"
check resume-logs-focus-mismatch "and logs that it kept BD-1 while the focus is now BD-2" $?

# Same state: a second agent in the session is a first start, not a resume, so
# it takes the focus. Guards against keying the record by session.
stub_reset
run_stub board-subagent-start.sh \
    '{"session_id":"s-r","agent_id":"a-r2","agent_type":"coder-fleet:coder","cwd":"'"$TMP"'"}' STUB_FOCUS=BD-2
calls_has "edit BD-2 In Progress"
check first-start-other-agent-reads-focus "a new agent in the same session is bound by the focus" $?

# Criterion 2: bind to BD-1, refocus to BD-2, resume, then a Blocker stop. The
# stop reads the record, so the Blocker lands on BD-1 and nothing touches BD-2.
r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-2
stub_reset
run_stub board-subagent-stop.sh "$R17_STOP_A_BLOCKER" STUB_FOCUS=BD-2
[ "$RC" -eq 0 ] && calls_has "edit BD-1 Blocked by human" && calls_has "comment BD-1" && ! grep -q 'BD-2' "$STUB_CALLS"
check resume-blocker-comments-first "a Blocker after a refocused resume moves and comments on the first item only" $?

r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
log_has "keeping BD-1" && ! log_has "focus is now"
check resume-same-focus-no-mismatch "a resume with the focus unchanged logs no mismatch" $?

r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-2
no_edit && log_has "started with no item"
check resume-unbound-stays-unbound "an agent that started with no item stays unbound on a resume, whatever the focus" $?

r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1 STUB_STATUS=Done
[ "$(grep -c '^edit ' "$STUB_CALLS")" -eq 1 ] && log_has "which is Done"
check resume-done-left "a resume on a Done item leaves it in Done and says so" $?

# GitHub issue 10: a resume after a Blocker moves the card out of Blocked by
# human. Expected green on the hook before this change, which re-wrote In
# Progress on every start; this case keeps it that way.
r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
run_stub board-subagent-stop.sh "$R17_STOP_A_BLOCKER" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human"
bh="$(calls_line first 'edit BD-1 Blocked by human')"; ip="$(calls_line last 'edit BD-1 In Progress')"
[ "$bh" -gt 0 ] && [ "$ip" -gt "$bh" ]
check resume-moves-blocked-human "a resume moves a Blocked by human item back to In Progress" $?

# The record is write-once in the library itself, not only because the resume
# branch exits before a second bind. Called directly, a second bind for the
# same agent returns 3, and the record does not change. No session-level
# last-item pointer is written (CF-48): nothing reads one any more.
LOG="$TMP/log.bind"
: > "$LOG"
BIND_STATE="$TMP/bind-state"
BIND_RCS="$(
    CODER_FLEET_STATE_DIR="$BIND_STATE"
    BOARD_LOG_FILE="$LOG"
    # shellcheck source=/dev/null
    . "$HOOKS/lib/board.sh"
    r1=0; state_bind_agent s x BD-1 t || r1=$?
    r2=0; state_bind_agent s x BD-2 t || r2=$?
    printf '%s %s\n' "$r1" "$r2"
)"
[ "$BIND_RCS" = "0 3" ] \
  && [ "$(sed -n 's/^page_id=//p' "$BIND_STATE/sessions/s/agents/x")" = "BD-1" ] \
  && [ ! -e "$BIND_STATE/sessions/s/last-item" ]
check bind-is-write-once "a second state_bind_agent for one agent returns 3, keeps the record, and writes no last-item" $?

# No agent_id on the event: nothing to key a record by, so none is written.
# Every such start sharing one "unknown-agent" record would send each later
# start's stop to the first one's item.
R17_START_NOID='{"session_id":"s-r","agent_type":"coder-fleet:coder","cwd":"'"$TMP"'"}'
r17_reset
run_stub board-subagent-start.sh "$R17_START_NOID" STUB_FOCUS=BD-1
NOID_LOG1="$(cat "$LOG")"
run_stub board-subagent-start.sh "$R17_START_NOID" STUB_FOCUS=BD-2
[ ! -e "$CODER_FLEET_STATE_DIR/sessions/s-r/agents/unknown-agent" ] \
  && ! printf '%s\n' "$NOID_LOG1" | grep -qF "binding stands" && ! log_has "binding stands" \
  && calls_has "edit BD-2 In Progress"
check start-no-agent-id-records-nothing "starts with no agent_id write no shared record and claim no binding" $?

# The Done check matches the configured spelling ignoring case and spaces.
r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1 STUB_STATUS=Done BOARD_COL_DONE=done
[ "$(grep -c '^edit ' "$STUB_CALLS")" -eq 1 ] && log_has "which is Done"
check resume-done-left-lowercase-config "a Done card is left alone when BOARD_COL_DONE is spelled done" $?

r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1 STUB_STATUS=Done "BOARD_COL_DONE=Done "
[ "$(grep -c '^edit ' "$STUB_CALLS")" -eq 1 ] && log_has "which is Done"
check resume-done-left-spaced-config "a Done card is left alone when BOARD_COL_DONE carries a trailing space" $?

# A focus read that failed is not "nothing focused". The first start writes no
# record and says so, so a resume can still bind from the focus.
r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS_FAIL=1
FAIL_LOG="$(cat "$LOG")"
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-2
[ "$RC" -eq 0 ] && printf '%s\n' "$FAIL_LOG" | grep -qF "could not read the focus" \
  && calls_has "edit BD-2 In Progress"
check start-focus-failed-no-record "a failed focus read records nothing, and the next start binds from the focus" $?

# A dry run reads no status, so it cannot know whether the item is Done, and
# must not claim it would move it.
r17_reset
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$R17_START_A" STUB_FOCUS=BD-1 STUB_STATUS=Done BOARD_DRY_RUN=1
log_has "Done check was skipped" && ! log_has "would move BD-1 to In Progress"
check resume-dry-run-skips-done-check "a dry-run resume says the Done check was skipped rather than claiming a move" $?
r17_reset

printf '\nSubagentStart: a cleared focus binds nothing, and Done stays Done\n'

# CF-48. A first start with no focus used to fall back to the item the session
# last bound, so once a session had bound anything, clearing the focus did not
# keep a scout off that card: its stop commented there and its start moved the
# card, a Done one included (fathom, 30 Sep: FTH-56 reopened by a scout). The
# chain is now the resume record, the Board-Item line, the focus, then
# CODER_FLEET_BOARD_PAGE_ID, and nothing after. Session s-c, agents a-c<n>.
CF48_STOP_CLEAN_TAIL='stop_hook_active:false,agent_transcript_path:"/dev/null",
    last_assistant_message:"## Done\n- Looked\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n"'
cf48_start() { printf '{"session_id":"s-c","agent_id":"%s","agent_type":"coder-fleet:%s","cwd":"%s"}' "$1" "$2" "$TMP"; }
cf48_stop() { jq -nc --arg a "$1" --arg c "$TMP" "{session_id:\"s-c\",agent_id:\$a,agent_type:\"coder-fleet:scout\",cwd:\$c,$CF48_STOP_CLEAN_TAIL}"; }
cf48_reset() { stub_reset; rm -rf "$CODER_FLEET_STATE_DIR/sessions/s-c"; }

# Criterion 1: bind BD-1, clear the focus, start a new agent.
cf48_reset
run_stub board-subagent-start.sh "$(cf48_start a-c1 coder)" STUB_FOCUS=BD-1
stub_reset
run_stub board-subagent-start.sh "$(cf48_start a-c2 scout)" STUB_FOCUS=
[ "$RC" -eq 0 ] && [ "$(grep -c '^edit ' "$STUB_CALLS")" -eq 0 ] && [ "$(calls_count 'task view')" -eq 0 ] \
  && log_has "nothing is focused" && ! log_has "picked up" \
  && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-c/agents/a-c2" ] \
  && [ -z "$(sed -n 's/^page_id=//p' "$CODER_FLEET_STATE_DIR/sessions/s-c/agents/a-c2")" ]
check start-cleared-focus-binds-nothing "after BD-1 was bound, a start with the focus cleared binds nothing and moves nothing" $?

# And its stop, reading that unbound record, comments on no card.
stub_reset
run_stub board-subagent-stop.sh "$(cf48_stop a-c2)" STUB_FOCUS=
[ "$RC" -eq 0 ] && ! grep -q '^comment ' "$STUB_CALLS" && ! grep -q '^edit ' "$STUB_CALLS"
check stop-cleared-focus-comments-nowhere "the unfocused agent's stop comments on no card" $?

# Criterion 4: a stop's log names the agent id and the item it comments on, or
# says it bound none. a-c2 above bound none; a-c1 is on BD-1.
grep -qF "a-c2" "$LOG" && grep -F "a-c2" "$LOG" | grep -qF "bound to no item"
check stop-log-names-agent-unbound "an unbound stop's log line names the agent id and says it bound no item" $?
stub_reset
run_stub board-subagent-stop.sh "$(cf48_stop a-c1)" STUB_FOCUS=
calls_has "comment BD-1" && grep -F "a-c1" "$LOG" | grep -qF "on BD-1"
check stop-log-names-agent-and-item "a bound stop's log line names the agent id and the item it comments on" $?

# Criterion 2: a first start never moves a Done card, whatever binds it. The
# binding is still recorded, so the stop reaches the card.
cf48_reset
run_stub board-subagent-start.sh "$(cf48_start a-c3 scout)" STUB_FOCUS=BD-1 STUB_STATUS=Done
[ "$RC" -eq 0 ] && [ "$(grep -c '^edit ' "$STUB_CALLS")" -eq 0 ] && log_has "BD-1, which is Done" \
  && [ "$(sed -n 's/^page_id=//p' "$CODER_FLEET_STATE_DIR/sessions/s-c/agents/a-c3")" = "BD-1" ]
check start-done-focus-stays-done "a start focused on a Done item binds it but leaves its column Done" $?

cf48_reset
run_stub board-subagent-start.sh "$(cf48_start a-c4 scout)" STUB_FOCUS= STUB_STATUS=Done CODER_FLEET_BOARD_PAGE_ID=BD-1
[ "$RC" -eq 0 ] && [ "$(grep -c '^edit ' "$STUB_CALLS")" -eq 0 ] && log_has "BD-1, which is Done"
check start-done-env-stays-done "a start bound by CODER_FLEET_BOARD_PAGE_ID to a Done item leaves it Done" $?

# A dry run reads no card, so it says the Done check was skipped.
cf48_reset
run_stub board-subagent-start.sh "$(cf48_start a-c5 scout)" STUB_FOCUS=BD-1 STUB_STATUS=Done BOARD_DRY_RUN=1
log_has "Done check was skipped" && ! log_has "would move BD-1"
check start-dry-run-skips-done-check "a dry-run first start says the Done check was skipped rather than claiming a move" $?
cf48_reset

printf '\nA failed move reaches the card, once per session\n'

# R18. GitHub issue 14: a BOARD_COL_DOING override the board did not list made
# every SubagentStart move fail for a week, and the only trace was a log line.
# A move the board refuses as an invalid status now leaves one comment on the
# card per session, item and column. It never writes a column, and any other
# failure stays in the log. Fathom's shape: board.env says In Progress, the
# board still says Doing.
R18_DOING_BOARD="To Do|Doing|Blocked|Blocked by human|Done"
r18_reset() { stub_reset; rm -rf "$CODER_FLEET_STATE_DIR/sessions/s-f1" "$CODER_FLEET_STATE_DIR/sessions/s-f2" "$CODER_FLEET_STATE_DIR/sessions/s-f3"; rm -f "$CODER_FLEET_CONFIG_DIR/board.env"; }
r18_start() { jq -nc --arg s "$1" --arg a "$2" --arg c "$TMP" '{session_id:$s,agent_id:$a,agent_type:"coder-fleet:coder",cwd:$c}'; }
comment_count() { grep -c "^comment $1\$" "$STUB_CALLS" 2>/dev/null || true; }

r18_reset
printf 'BOARD_COL_DOING="In Progress"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-subagent-start.sh "$(r18_start s-f1 a-f1)" STUB_FOCUS=BD-1 STUB_STATUSES="$R18_DOING_BOARD"
[ "$RC" -eq 0 ] && no_edit && [ "$(comment_count BD-1)" -eq 1 ] \
  && grep -qF 'BOARD_COL_DOING' "$STUB_CALLS.body" && grep -qF '"In Progress"' "$STUB_CALLS.body"
check move-fail-comments "a move the board refuses leaves a comment naming the override and the column, and moves nothing" $?

run_stub board-subagent-start.sh "$(r18_start s-f1 a-f2)" STUB_FOCUS=BD-1 STUB_STATUSES="$R18_DOING_BOARD"
[ "$(comment_count BD-1)" -eq 1 ] && log_has "already noted"
check move-fail-comment-once "a second refused move in the same session adds no comment and says it was already noted" $?

run_stub board-subagent-start.sh "$(r18_start s-f2 a-f3)" STUB_FOCUS=BD-1 STUB_STATUSES="$R18_DOING_BOARD"
[ "$(comment_count BD-1)" -eq 2 ]
check move-fail-comment-per-session "a refused move in another session comments again" $?

# The Blocker comment is the caller's and always posted; the failure note is
# one more, and only one.
r18_reset
printf 'BOARD_COL_BLOCKED_HUMAN="Needs human"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-subagent-start.sh "$(r18_start s-f3 a-f4)" STUB_FOCUS=BD-1
run_stub board-subagent-stop.sh "$(jq -nc --arg c "$TMP" '{session_id:"s-f3",agent_id:"a-f4",agent_type:"coder-fleet:coder",cwd:$c,
    stop_hook_active:false,agent_transcript_path:"/dev/null",
    last_assistant_message:"## Done\n- Half of it\n\n## Not done\n- The rest\n\n## Unverified\n- None\n\n## Decisions needed\n- Blocker: which key should it use?\n"}')" STUB_FOCUS=BD-1
[ "$RC" -eq 0 ] && ! calls_has "edit BD-1 Needs human" && [ "$(comment_count BD-1)" -eq 2 ] \
  && grep -qF 'which key should it use?' "$STUB_CALLS.body" && grep -qF 'BOARD_COL_BLOCKED_HUMAN' "$STUB_CALLS.body"
check move-fail-blocker-comment-kept "a refused Blocker move still posts the Blocker, plus one failure note" $?

r18_reset
run_stub board-subagent-start.sh "$(r18_start s-f1 a-f5)" STUB_FOCUS=BD-1
calls_has "edit BD-1 In Progress" && [ "$(comment_count BD-1)" -eq 0 ]
check move-ok-no-note "a move the board accepts leaves no note" $?

# Only the refused status earns a note. With every edit failing for another
# reason, nothing tries to comment at all.
r18_reset
run_stub board-subagent-start.sh "$(r18_start s-f1 a-f6)" STUB_FOCUS=BD-1 STUB_EDIT_FAIL=1
[ "$RC" -eq 0 ] && ! grep -q '^call: task edit .*--comment' "$STUB_CALLS"
check move-fail-other-error-no-note "a move that fails for another reason attempts no comment" $?

# A note that could not be posted is not a note: the next refusal in the
# session tries again rather than logging "already noted" over nothing.
r18_reset
printf 'BOARD_COL_DOING="In Progress"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-subagent-start.sh "$(r18_start s-f1 a-f7)" STUB_FOCUS=BD-1 STUB_STATUSES="$R18_DOING_BOARD" STUB_COMMENT_FAIL=1
run_stub board-subagent-start.sh "$(r18_start s-f1 a-f8)" STUB_FOCUS=BD-1 STUB_STATUSES="$R18_DOING_BOARD"
[ "$(comment_count BD-1)" -eq 1 ] && ! log_has "already noted"
check move-fail-note-retried "a note whose comment failed is tried again on the next refusal in the session" $?
r18_reset

printf '\nSessionStart: board.env is checked against the board config\n'

# R19. No agent can read board.env: permissions.deny and the sandbox both hide
# the directory. So the check is a SessionStart hook, which runs outside the
# agent's permission model, and kickoff reports what it found. It prints the
# BOARD_COL_* overrides the config does not list, and nothing else from the
# file, which may sit beside rendered secrets.
ENV_CHECK_EVENT="$(jq -nc --arg c "$TMP" '{session_id:"s-env",hook_event_name:"SessionStart",source:"startup",cwd:$c}')"

jq -e '[.hooks.SessionStart[]?.hooks[]?.command] | any(test("board-env-check\\.sh"))' "$PLUGIN_ROOT/hooks/hooks.json" >/dev/null 2>&1
check env-check-registered "hooks.json registers board-env-check.sh on SessionStart" $?

stub_reset
printf 'BOARD_COL_DOING="In Progress"\nBOARD_COL_BLOCKED_HUMAN="Needs human"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-env-check.sh "$ENV_CHECK_EVENT" STUB_STATUSES="$R18_DOING_BOARD"
[ "$RC" -eq 0 ] && [ "$(grep -c . "$TMP/out")" -eq 2 ] \
  && grep 'BOARD_COL_DOING' "$TMP/out" | grep -qF '"In Progress"' \
  && grep 'BOARD_COL_BLOCKED_HUMAN' "$TMP/out" | grep -qF '"Needs human"' \
  && [ "$(grep -cF "$TMP" "$TMP/out")" -eq 2 ]
check env-check-names-each "each unlisted override is one stdout line naming the variable, its value and the repository" $?

stub_reset
rm -f "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-env-check.sh "$ENV_CHECK_EVENT"
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out" ] && [ ! -s "$STUB_CALLS" ]
check env-check-silent-default "with no override it prints nothing and starts no binary" $?

stub_reset
printf 'BOARD_COL_DOING="Doing"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-env-check.sh "$ENV_CHECK_EVENT" STUB_STATUSES="$R18_DOING_BOARD"
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out" ]
check env-check-silent-when-listed "an override the config lists prints nothing" $?

stub_reset
printf 'BOARD_COL_DOING="In Progress"\nBOARD_COL_BLOCKED_HUMAN="Needs human"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-env-check.sh "$ENV_CHECK_EVENT" STUB_LIST_FAIL=1
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out" ] && [ "$(calls_count 'task list')" -eq 1 ] && [ "$(grep -c . "$LOG")" -eq 1 ]
check env-check-no-board "no board here: one probe, one log line, nothing printed, exit 0" $?

stub_reset
run_stub board-env-check.sh "$ENV_CHECK_EVENT" CODER_FLEET_BOARD=off
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out" ] && [ ! -s "$STUB_CALLS" ]
check env-check-board-off "with the board off it prints nothing and starts no binary" $?

stub_reset
printf 'BOARD_COL_DOING="In Progress"\nOTHER_VALUE=zq9x\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-env-check.sh "$ENV_CHECK_EVENT" STUB_STATUSES="$R18_DOING_BOARD"
[ -s "$TMP/out" ] && ! grep -qF zq9x "$TMP/out" && ! grep -qF zq9x "$LOG" && ! grep -qF zq9x "$TMP/err"
check env-check-prints-only-columns "nothing from board.env but the BOARD_COL_* values reaches stdout, stderr or the log" $?

# board.env is a hand-edited shell file, sourced. A line that fails, one that
# prints, or one that is not an assignment at all must not stop the hook or
# carry the file's text out: stdout here is the session's context.
stub_reset
printf 'false\necho "TOKEN=hunter2"\nAPI_KEY= sk-live-abc123\nBOARD_COL_DOING="$UNSET_THING_zq8"\nBOARD_COL_DOING="In Progress"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-env-check.sh "$ENV_CHECK_EVENT" STUB_STATUSES="$R18_DOING_BOARD"
[ "$RC" -eq 0 ] && grep -qF 'BOARD_COL_DOING' "$TMP/out" \
  && ! grep -qE 'hunter2|sk-live' "$TMP/out" && ! grep -qE 'hunter2|sk-live' "$TMP/err" && ! grep -qE 'hunter2|sk-live' "$LOG"
check env-check-hostile-file "a board.env line that fails, prints or is not an assignment neither stops the hook nor leaks" $?

# The names and defaults the check reads are the library's own, not board.env's.
stub_reset
printf 'SECRET_TOKEN=hunter2\nBOARD_COL_NAMES="SECRET_TOKEN"\nBOARD_COL_DOING_DEFAULT="In Progress"\nBOARD_COL_DOING="In Progress"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-env-check.sh "$ENV_CHECK_EVENT" STUB_STATUSES="$R18_DOING_BOARD"
[ "$RC" -eq 0 ] && grep -qF 'BOARD_COL_DOING' "$TMP/out" && ! grep -qF hunter2 "$TMP/out" && ! grep -qF hunter2 "$LOG"
check env-check-names-are-fixed "board.env cannot redefine which names are checked or what their defaults are" $?
rm -f "$CODER_FLEET_CONFIG_DIR/board.env"
stub_reset

printf '\nSubagentStop: each Blocker line becomes an action for the human\n'

# R20. CF-25: every "Blocker: " line lands as a numbered action at the top of
# the card, in a `task edit --action=<text>` call of its own, after the move and
# before the Blocker comment. The ask goes verbatim; the binary applies the
# "[not a question] " flag, never the hook. The comment is unchanged. And an open
# action holds the card: SubagentStart leaves a Blocked by human card where it
# is while any action is unticked, on a first start and a resume alike.
R20_HANDOFF_HEAD='## Done\n- Half of it\n\n## Not done\n- The rest\n\n## Unverified\n- None\n\n## Decisions needed\n'
r20_stop() {
    # $1 session, $2 the Decisions needed lines, as JSON string text
    jq -nc --arg c "$TMP" --arg s "$1" --arg m "$(printf "$R20_HANDOFF_HEAD%b\n" "$2")" \
        '{session_id:$s,agent_id:"a-bh",agent_type:"coder-fleet:coder",cwd:$c,
          stop_hook_active:false,agent_transcript_path:"/dev/null",last_assistant_message:$m}'
}
r20_start() { jq -nc --arg c "$TMP" --arg s "$1" --arg a "${2:-a-bh}" '{session_id:$s,agent_id:$a,agent_type:"coder-fleet:coder",cwd:$c}'; }
# The log without its timestamp and hook prefix, one line per entry.
log_bare() { sed 's/^[^]]*\] //' "$LOG" 2>/dev/null; }
log_has_line() { log_bare | grep -qxF "$1"; }
r20_reset() { stub_reset; rm -rf "$CODER_FLEET_STATE_DIR"/sessions/s-a*; rm -f "$CODER_FLEET_CONFIG_DIR/board.env"; }

run_hook_bound board-subagent-stop.sh "$(r20_stop s-a0 '- Blocker: which key?\n- Blocker: 7 days or 30?')"
[ "$RC" -eq 0 ] && log_has_line "dry run: would add an action for the human to BD-1: which key?" \
  && log_has_line "dry run: would add an action for the human to BD-1: 7 days or 30?" \
  && log_has_line "dry run: would move BD-1 to Blocked by human with a comment"
check stop-blocker-actions-dry-run "a dry run logs one bare action per Blocker line, and the move line unchanged" $?

r20_reset
run_stub board-subagent-stop.sh "$(r20_stop s-a1 '- Blocker: which key?')" CODER_FLEET_BOARD_PAGE_ID=BD-1
e="$(calls_line first 'edit BD-1 Blocked by human')"; a="$(calls_line first 'action BD-1 which key?')"; c="$(calls_line first 'comment BD-1')"
[ "$RC" -eq 0 ] && [ "$e" -gt 0 ] && [ "$a" -gt "$e" ] && [ "$c" -gt "$a" ] \
  && calls_has "call: task edit BD-1 --action=which key? --by SubagentStop"
check stop-blocker-actions-call "the move, then one --action= call of its own, then the Blocker comment" $?

r20_reset
run_stub board-subagent-stop.sh "$(r20_stop s-a2 '- Blocker: Pick the key\n- Blocker: which key?')" CODER_FLEET_BOARD_PAGE_ID=BD-1
[ "$RC" -eq 0 ] && calls_has "edit BD-1 Blocked by human" && calls_has "action BD-1 Pick the key" \
  && calls_has "action BD-1 which key?" && ! grep -qF 'not a question' "$STUB_CALLS"
check stop-blocker-not-question-still-moves "an ask that is not a question still moves the item, and the hook adds no flag" $?

r20_reset
run_stub board-subagent-stop.sh "$(r20_stop s-a3 '- Blocker: which key?')" CODER_FLEET_BOARD_PAGE_ID=BD-1
stub_reset
run_stub board-subagent-stop.sh "$(r20_stop s-a3 '- Blocker: 7 days or 30?')" CODER_FLEET_BOARD_PAGE_ID=BD-1 STUB_STATUS="Blocked by human"
[ "$RC" -eq 0 ] && calls_has "edit BD-1 Blocked by human" && calls_has "action BD-1 7 days or 30?" \
  && [ "$(grep -c '^action ' "$STUB_CALLS")" -eq 1 ]
check stop-blocker-appends "a second Blocker handoff in the queue moves again and adds only its own actions" $?

r20_reset
run_stub board-subagent-stop.sh "$(r20_stop s-a4 '- Blocker: -v or -q?')" CODER_FLEET_BOARD_PAGE_ID=BD-1
[ "$RC" -eq 0 ] && calls_has "action BD-1 -v or -q?" && ! grep -q '^action-bare ' "$STUB_CALLS"
check stop-blocker-leading-dash "an ask starting with a dash is passed in the = form, whole" $?

r20_reset
run_stub board-subagent-stop.sh "$(r20_stop s-a5 '- Blocker: which key?')" CODER_FLEET_BOARD_PAGE_ID=BD-1 STUB_ACTION_FAIL=1
[ "$RC" -eq 0 ] && calls_has "edit BD-1 Blocked by human" && calls_has "comment BD-1" \
  && grep -qF 'which key?' "$STUB_CALLS.body" && log_has "board task edit failed" && log_has "unknown option"
check stop-actions-fail-comment-still-posts "a binary without --action still moves and comments, and the failure is logged" $?

# CF-42 notes a refused move on the card. The actions call comes after that
# note and before the Blocker comment, and runs even though nothing moved.
r20_reset
printf 'BOARD_COL_BLOCKED_HUMAN="Needs human"\n' > "$CODER_FLEET_CONFIG_DIR/board.env"
run_stub board-subagent-stop.sh "$(r20_stop s-a6 '- Blocker: which key?')" CODER_FLEET_BOARD_PAGE_ID=BD-1
n1="$(calls_line first 'comment BD-1')"; a="$(calls_line first 'action BD-1 which key?')"; n2="$(calls_line last 'comment BD-1')"
[ "$RC" -eq 0 ] && no_edit && [ "$(comment_count BD-1)" -eq 2 ] && [ "$n1" -gt 0 ] && [ "$a" -gt "$n1" ] && [ "$n2" -gt "$a" ]
check stop-actions-after-refused-move "a refused move still gets the actions, between the failure note and the Blocker comment" $?
rm -f "$CODER_FLEET_CONFIG_DIR/board.env"

r20_reset
run_stub board-subagent-stop.sh "$(r20_stop s-a7 '- Blocker: which key?\n- Blocker: 7 days or 30?')" CODER_FLEET_BOARD_PAGE_ID=BD-1
[ "$RC" -eq 0 ] && [ "$(cat "$STUB_CALLS.body")" = "$(printf 'Blocked by human. coder-fleet:coder raised 2 blocker(s). From "## Decisions needed" in its handoff:\n\n- which key?\n- 7 days or 30?\n')" ]
check stop-blocker-comment-unchanged "the Blocker comment is the headline, a blank line and the asks, as before" $?

r20_reset
run_stub board-subagent-stop.sh "$(r20_stop s-a8 '- None')" CODER_FLEET_BOARD_PAGE_ID=BD-1
[ "$RC" -eq 0 ] && calls_has "comment BD-1" && ! grep -qE '^action|--action' "$STUB_CALLS"
check stop-no-blocker-no-actions "a handoff with no Blocker line makes no action call" $?

# Amendment 1, the hold rule. One `task view --json` answers both the status
# and the open count.
R20_OPEN2='[{"index":1,"text":"which key?","checked":false},{"index":2,"text":"[not a question] Pick one","checked":false}]'
R20_ONE_OPEN='[{"index":1,"text":"which key?","checked":true},{"index":2,"text":"7 days or 30?","checked":false}]'
R20_TICKED='[{"index":1,"text":"which key?","checked":true},{"index":2,"text":"7 days or 30?","checked":true}]'

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a10)" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human" STUB_ACTIONS="$R20_OPEN2"
[ "$RC" -eq 0 ] && [ "$(calls_count 'task edit')" -eq 0 ] && [ "$(calls_count 'task view')" -eq 1 ] \
  && log_has "waiting on the human: 2 open action(s) on BD-1"
check start-holds-open-actions "a first start leaves a Blocked by human card with open actions where it is, from one view" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a11)" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human" STUB_ACTIONS="$R20_ONE_OPEN"
[ "$(calls_count 'task edit')" -eq 0 ] && log_has "waiting on the human: 1 open action(s) on BD-1"
check start-holds-one-open "one open action beside a ticked one still holds the card" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a12)" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human" STUB_ACTIONS="$R20_TICKED"
calls_has "edit BD-1 In Progress" && ! log_has "waiting on the human"
check start-moves-all-ticked "with every action ticked the start moves the card to In Progress" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a13)" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human" STUB_ACTIONS='[]'
calls_has "edit BD-1 In Progress" && ! log_has "waiting on the human"
check start-moves-no-section "with no section the start moves the card to In Progress" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a14)" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human" STUB_ACTIONS=omit
calls_has "edit BD-1 In Progress" && ! log_has "waiting on the human"
check start-moves-old-binary "a binary that reports no actionsForHuman at all is read as no section" $?

# The hold is the human queue's alone: a lead-added action on a card outside it
# rides along.
r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a15)" STUB_FOCUS=BD-1 STUB_STATUS="To Do" STUB_ACTIONS="$R20_OPEN2"
calls_has "edit BD-1 In Progress" && ! log_has "waiting on the human"
check start-open-actions-outside-queue-moves "open actions on a card outside Blocked by human hold nothing" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a16)" STUB_FOCUS=BD-1
stub_reset
run_stub board-subagent-start.sh "$(r20_start s-a16)" STUB_FOCUS=BD-2 STUB_STATUS="Blocked by human" STUB_ACTIONS="$R20_OPEN2"
[ "$RC" -eq 0 ] && [ "$(calls_count 'task edit')" -eq 0 ] && [ "$(calls_count 'task view')" -eq 1 ] \
  && log_has "keeping BD-1" && log_has "waiting on the human: 2 open action(s) on BD-1"
check resume-holds-open-actions "a resume holds the card it started on while an action is open, from one view" $?

# A card read that fails must not be read as "nothing held". A view that times
# out once and then answers would otherwise let the move through, and the
# binary would archive the open asks: the failure the hold exists to stop.
r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a30)" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human" STUB_ACTIONS="$R20_OPEN2" STUB_VIEW_FAIL_ONCE=1
[ "$RC" -eq 0 ] && [ "$(calls_count 'task edit')" -eq 0 ] && log_has "could not read BD-1"
check start-read-fails-moves-nothing "a first start whose card read fails moves nothing, so no open ask is archived by a timeout" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a31)" STUB_FOCUS=BD-1
stub_reset
run_stub board-subagent-start.sh "$(r20_start s-a31)" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human" STUB_ACTIONS="$R20_OPEN2" STUB_VIEW_FAIL_ONCE=1
[ "$RC" -eq 0 ] && [ "$(calls_count 'task edit')" -eq 0 ] && log_has "could not read BD-1"
check resume-read-fails-moves-nothing "a resume whose card read fails moves nothing either" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a17)" STUB_FOCUS=BD-1
stub_reset
run_stub board-subagent-start.sh "$(r20_start s-a17)" STUB_FOCUS=BD-1 STUB_STATUS="Blocked by human" STUB_ACTIONS="$R20_TICKED"
calls_has "edit BD-1 In Progress"
check resume-moves-all-ticked "a resume moves the card once every action is ticked" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a18)" STUB_FOCUS=BD-1
run_stub board-subagent-start.sh "$(r20_start s-a18)" STUB_FOCUS=BD-1 BOARD_DRY_RUN=1
log_has "hold check" && ! log_has "would move BD-1"
check resume-dry-run-skips-hold-check "a dry-run resume says the hold check was skipped too, and claims no move" $?

r20_reset
run_stub board-subagent-start.sh "$(r20_start s-a19)" STUB_FOCUS=BD-1 BOARD_DRY_RUN=1
[ "$(calls_count 'task view')" -eq 0 ] && log_has "hold check was skipped" && ! log_has "would move BD-1"
check start-dry-run-skips-hold-check "a dry-run first start reads no card, says the hold check was skipped, and claims no move" $?
r20_reset

printf '\nPostToolUse on Agent: a run that ended without SubagentStop\n'

# R21. CF-64: SubagentStop does not fire when maxTurns cuts a run off (measured
# on Claude Code 2.1.284, 0 of 3 cut-offs), so the card sat silent in In
# Progress. SubagentStop now writes a stopped marker beside the agent's record
# before any branch that can exit, and board-agent-return.sh, on the Agent
# tool's PostToolUse, comments once on the bound card when a completed
# foreground run has no marker. It never moves a column. The payload shape is
# the one captured live: session_id at the top, and agentId, agentType, status
# and content under tool_response, content an array of {type, text}.
R21_CAP_NOTE='NOTE: this agent stopped at its 3-turn limit before finishing. The text below is PARTIAL output; treat it as incomplete. Send the agent a message (SendMessage) to let it continue from where it stopped.'
r21_start() { jq -nc --arg c "$TMP" --arg s "$1" --arg a "$2" --arg t "${3:-coder-fleet:coder}" '{session_id:$s,agent_id:$a,agent_type:$t,cwd:$c}'; }
r21_return() {
    # $1 session, $2 agent id, $3 status, $4 the first text block, $5 agent type
    jq -nc --arg c "$TMP" --arg s "$1" --arg a "$2" --arg st "$3" --arg x "$4" --arg t "${5:-coder-fleet:coder}" \
        '{session_id:$s,cwd:$c,hook_event_name:"PostToolUse",tool_name:"Agent",tool_use_id:"toolu_r21",
          transcript_path:"/dev/null",tool_input:{subagent_type:$t,prompt:"p",description:"d"},
          tool_response:{agentId:$a,agentType:$t,status:$st,content:[{type:"text",text:$x},{type:"text",text:"agentId: x"}]}}'
}
r21_stop() {
    # $1 session, $2 agent id, $3 the final message
    jq -nc --arg c "$TMP" --arg s "$1" --arg a "$2" --arg m "$3" \
        '{session_id:$s,agent_id:$a,agent_type:"coder-fleet:coder",cwd:$c,
          stop_hook_active:false,agent_transcript_path:"/dev/null",last_assistant_message:$m}'
}
R21_HANDOFF='## Done
- Shipped it

## Not done
- None

## Unverified
- None

## Decisions needed
- None'
r21_reset() { stub_reset; rm -rf "$CODER_FLEET_STATE_DIR"/sessions/s-t*; }
r21_comments() { grep -c '^comment ' "$STUB_CALLS" 2>/dev/null || true; }
# Every R21 run of the return hook goes through here, and any of them that
# prints to stdout is remembered: PostToolUse reads stdout as a decision, and
# this hook has none to give. return-stdout-silent reads the flag at the end.
R21_STDOUT=""
r21_run_return() {
    run_stub board-agent-return.sh "$@"
    if [ -s "$TMP/out" ]; then R21_STDOUT="$R21_STDOUT $(head -c 80 "$TMP/out" | tr '\n' ' ')"; fi
}

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t1 a-t1)" STUB_FOCUS=BD-1
stub_reset
r21_run_return "$(r21_return s-t1 a-t1 completed "$R21_CAP_NOTE")"
[ "$RC" -eq 0 ] && [ "$(r21_comments)" -eq 1 ] && calls_has "comment BD-1" && no_edit \
  && ! grep -q -- '--action' "$STUB_CALLS" \
  && grep -qF '3-turn cap' "$STUB_CALLS.body" && grep -qF 'SendMessage' "$STUB_CALLS.body" \
  && grep -qF 'no handoff' "$STUB_CALLS.body"
check return-cap-comments "a capped, bound run with no stopped marker gets one comment naming the cap, and nothing moves" $?

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t2 a-t2)" STUB_FOCUS=BD-1
stub_reset
r21_run_return "$(r21_return s-t2 a-t2 completed 'All done, nothing to add.')"
[ "$RC" -eq 0 ] && [ "$(r21_comments)" -eq 1 ] && calls_has "comment BD-1" && no_edit \
  && grep -qF 'without SubagentStop' "$STUB_CALLS.body" && grep -qF 'no handoff check' "$STUB_CALLS.body" \
  && ! grep -qF 'turn cap' "$STUB_CALLS.body"
check return-no-stop-comments "a bound run with no marker and no cap note gets the ended-without-SubagentStop comment" $?

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t3 a-t3)" STUB_FOCUS=BD-1
run_stub board-subagent-stop.sh "$(r21_stop s-t3 a-t3 "$R21_HANDOFF")"
stub_reset
# A normal finish carries its handoff, never the cap note; the note beating the
# marker is return-cap-beats-marker below.
r21_run_return "$(r21_return s-t3 a-t3 completed '## Done')"
[ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ] && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-t3/agents/a-t3.stopped" ]
check return-after-stop-silent "a normal stop leaves a marker beside the record, and the return then posts nothing" $?

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t4 a-t4)" STUB_FOCUS=
R21_UNBOUND_REC="$CODER_FLEET_STATE_DIR/sessions/s-t4/agents/a-t4"
[ -f "$R21_UNBOUND_REC" ] && [ -z "$(sed -n 's/^page_id=//p' "$R21_UNBOUND_REC")" ]; R21_REC_OK=$?
stub_reset
r21_run_return "$(r21_return s-t4 a-t4 completed "$R21_CAP_NOTE")"
[ "$R21_REC_OK" -eq 0 ] && [ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ]
check return-unbound-silent "an agent recorded with no item gets no comment" $?

r21_reset
r21_run_return "$(r21_return s-t5 a-t5 completed "$R21_CAP_NOTE")"
[ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ]
check return-no-record-silent "an agent with no record at all gets no comment" $?

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t6 a-t6)" STUB_FOCUS=BD-1
stub_reset
r21_run_return "$(r21_return s-t6 a-t6 async_launched 'Async agent launched successfully.')"
RC6="$RC"; CALLS6="$(cat "$STUB_CALLS")"
r21_run_return "$(r21_return s-t6 a-t6 error "$R21_CAP_NOTE")"
[ "$RC6" -eq 0 ] && [ -z "$CALLS6" ] && [ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ] && log_has "not completed"
check return-not-completed-silent "a background launch, or any status but completed, gets no comment" $?

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t7 a-t7)" STUB_FOCUS=BD-1
run_stub board-subagent-stop.sh "$(r21_stop s-t7 a-t7 'I finished, no headings here.')"
RC7="$RC"
stub_reset
r21_run_return "$(r21_return s-t7 a-t7 completed 'I finished, no headings here.')"
[ "$RC7" -eq 2 ] && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-t7/agents/a-t7.stopped" ] \
  && [ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ]
check stop-exit2-leaves-marker "a SubagentStop that exits 2 on a malformed handoff still leaves the marker" $?

r21_reset
run_stub board-subagent-stop.sh "$(jq -nc --arg c "$TMP" '{session_id:"s-t8",agent_id:"a-t8",cwd:$c,stop_hook_active:false,agent_transcript_path:"/dev/null"}')"
[ "$RC" -eq 0 ] && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-t8/agents/a-t8.stopped" ]
check stop-untyped-leaves-marker "an untyped stop, which exits before any board work, still leaves the marker" $?

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t9 a-t9)" STUB_FOCUS=BD-1
stub_reset
r21_run_return "$(r21_return s-t9 a-t9 completed "$R21_CAP_NOTE")" BOARD_DRY_RUN=1
[ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ] && log_has "would comment on BD-1" && log_has "3-turn cap"
check return-dry-run-reports "a dry run calls nothing and reports the comment it would post" $?

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t10 a-t10 general-purpose)" STUB_FOCUS=BD-1
stub_reset
r21_run_return "$(r21_return s-t10 a-t10 completed "$R21_CAP_NOTE" general-purpose)"
[ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ]
check return-non-fleet-silent "a non-fleet agent, which SubagentStop's matcher never covers, gets no comment" $?

r21_reset
r21_run_return 'not json at all'
[ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ]
check return-bad-input-exits-0 "input that is not JSON exits 0 and posts nothing" $?

jq -e '[.hooks.PostToolUse[]? | select(.matcher == "Agent") | .hooks[]? | select(.command | test("board-agent-return\\.sh"))] | length == 1' \
    "$PLUGIN_ROOT/hooks/hooks.json" >/dev/null 2>&1
check return-registered "hooks.json registers board-agent-return.sh on PostToolUse with matcher Agent" $?

# The cap note beats the marker. A handoff the gate rejected with exit 2 left a
# marker, and if the re-emit then ran into the turn cap the return carries the
# note: that run still ended with no handoff, so the card hears about it. The
# marker only silences the generic ended-without-SubagentStop comment.
r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t11 a-t11)" STUB_FOCUS=BD-1
run_stub board-subagent-stop.sh "$(r21_stop s-t11 a-t11 'Half done, no headings.')"
RC11="$RC"
stub_reset
r21_run_return "$(r21_return s-t11 a-t11 completed "$R21_CAP_NOTE")"
[ "$RC11" -eq 2 ] && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-t11/agents/a-t11.stopped" ] \
  && [ "$RC" -eq 0 ] && [ "$(r21_comments)" -eq 1 ] && calls_has "comment BD-1" && no_edit \
  && grep -qF '3-turn cap' "$STUB_CALLS.body"
check return-cap-beats-marker "a marked agent whose return carries the cap note still gets one cap comment" $?

r21_reset
run_stub board-subagent-start.sh "$(r21_start s-t12 a-t12)" STUB_FOCUS=BD-1
stub_reset
r21_run_return "$(r21_return s-t12 a-t12 completed "$R21_CAP_NOTE")" CODER_FLEET_BOARD=off
[ "$RC" -eq 0 ] && [ ! -s "$STUB_CALLS" ] && log_has "the board is off" && ! log_has "dry run: the comment"
check return-board-off-says-off "a disabled board is logged as off, not as a dry run" $?

[ -z "$R21_STDOUT" ]
check return-stdout-silent "the return hook writes nothing to stdout in any R21 case" $?
r21_reset

export CODER_FLEET_BOARD=off

printf '\nLive backend: the hooks move a real item through the binary\n'

# Everything above proves the hooks read the right fields and decide the right
# thing. None of it proves the decision reaches the board, because the board
# call is exactly what CODER_FLEET_BOARD=off switches off. These three
# cases run the binary against a throwaway root - never the memory tree - so a
# shim that cannot be found, a status spelling the config does not hold, or a
# comment flag the CLI has renamed is caught here rather than in a real run.
#
# Which board, though. The shim prefers ~/.local/bin/board, which on an
# installed machine is a binary from some earlier build: a branch that changes
# src/cli.ts would be "live-tested" against code it did not write, and a CLI
# regression would pass here and fail in the real run. So when bun is present
# the live pass runs the checkout's own cli.ts through a wrapper and points the
# hook library at it with BOARD_SHIM, which the library honours. Only a machine
# without bun falls back to the shim and whatever it resolves.
SHIM="$PLUGIN_ROOT/board/board.sh"
LIVE_VIA="the shim, $SHIM"
if command -v bun >/dev/null 2>&1; then
    SHIM="$TMP/board-from-checkout"
    printf '#!/usr/bin/env bash\nexec bun "%s" "$@"\n' \
        "$PLUGIN_ROOT/board/src/cli.ts" > "$SHIM"
    chmod +x "$SHIM"
    LIVE_VIA="bun on the checkout's src/cli.ts"
fi
export BOARD_SHIM="$SHIM"
if ! "$SHIM" --version >/dev/null 2>&1; then
    printf '  skipped: board not resolvable via %s; build it with claude/coder-fleet/board/build.sh\n' "$LIVE_VIA"
else
    printf '  running against %s\n' "$LIVE_VIA"
    # The board is the main checkout's .boards. The hooks are run with a cwd in
    # a linked worktree, and every move has to land in the main checkout - as a
    # file, and as a commit whose subject names the hook - while the worktree's
    # own copy of the board stays exactly as it was.
    LIVE="$TMP/live"; WTLIVE="$TMP/live-wt"
    mkdir -p "$LIVE/.boards/tasks"
    printf 'project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\nauto_commit: true\n' > "$LIVE/.boards/config.yml"
    git -C "$LIVE" init -q -b main
    git -C "$LIVE" config user.email t@t
    git -C "$LIVE" config user.name t
    git -C "$LIVE" add -A && git -C "$LIVE" commit -qm base
    git -C "$LIVE" worktree add -q "$WTLIVE" -b agent-live
    unset CODER_FLEET_BOARD_ROOT
    export CODER_FLEET_BOARD=on
    unset BOARD_DRY_RUN
    ID="$(cd "$LIVE" && "$SHIM" task create "Live item" --json | jq -r .task.id)"
    [ "$(git -C "$LIVE" log -1 --format=%s)" = "Create $ID on the board" ]; check live-create-commits "a create commits with the id in the subject" $?

    # Focus is the binding now. Written in the main checkout, read by the hook
    # run from the worktree: no environment variable anywhere.
    (cd "$LIVE" && "$SHIM" focus "$ID" >/dev/null)
    run_hook board-subagent-start.sh \
        "$(jq -nc --arg t "coder-fleet:coder" --arg c "$WTLIVE" \
            '{session_id:"live",agent_id:"a1",agent_type:$t,cwd:$c}')"
    [ "$(cd "$LIVE" && "$SHIM" task view "$ID" --json | jq -r .task.status)" = "In Progress" ]; check live-start-in-progress "SubagentStart, run from a worktree, moves the main checkout's item to In Progress via the focus" $?
    [ "$(git -C "$LIVE" log -1 --format=%s)" = "Move $ID to In Progress on the board" ] \
      && [ "$(git -C "$LIVE" log -1 --format='%(trailers:key=Board-Writer,valueonly)')" = "SubagentStart" ]
    check live-start-commits "the move is committed in the main checkout, naming the hook in a trailer" $?
    [ -z "$(git -C "$WTLIVE" status --porcelain)" ]; check live-worktree-untouched "the worktree's copy of the board is untouched" $?
    log_has "from the focus file"; check live-focus-source "the log says the binding came from the focus file" $?

    # A board not yet renamed. The probe for In Progress fails against the real
    # binary here, and the hook has to read that failure as "not listed" - the
    # stub's wording in R16 stands in for this one everywhere bun is missing.
    LIVED="$TMP/live-doing"
    mkdir -p "$LIVED/.boards/tasks"
    printf 'project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "Doing", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\nauto_commit: true\n' > "$LIVED/.boards/config.yml"
    git -C "$LIVED" init -q -b main
    git -C "$LIVED" config user.email t@t
    git -C "$LIVED" config user.name t
    git -C "$LIVED" add -A && git -C "$LIVED" commit -qm base
    IDD="$(cd "$LIVED" && "$SHIM" task create "Old-name item" --json | jq -r .task.id)"
    (cd "$LIVED" && "$SHIM" focus "$IDD" >/dev/null)
    run_hook board-subagent-start.sh \
        "$(jq -nc --arg c "$LIVED" '{session_id:"live-doing",agent_id:"a9",agent_type:"coder-fleet:coder",cwd:$c}')"
    [ "$(cd "$LIVED" && "$SHIM" task view "$IDD" --json | jq -r .task.status)" = "Doing" ] \
      && ! log_has "board task list failed"
    check live-start-doing-board "on a board still listing Doing, SubagentStart moves the item to Doing and logs no probe failure" $?

    run_hook board-subagent-stop.sh \
        "$(jq -nc --arg c "$WTLIVE" '{session_id:"live",agent_id:"a1",agent_type:"coder-fleet:coder",cwd:$c,
                    stop_hook_active:false,agent_transcript_path:"/dev/null",
                    last_assistant_message:"## Done\n- Moved a live item through the binary\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- Blocker: which key?\n"}')"
    [ "$(cd "$LIVE" && "$SHIM" task view "$ID" --json | jq -r .task.status)" = "Blocked by human" ]; check live-blocker "a Blocker: line moves the item to Blocked by human" $?
    (cd "$LIVE" && "$SHIM" task view "$ID" --json) \
        | jq -e '.task.comments[] | select(.author == "@SubagentStop") | select(.body | test("which key"))' >/dev/null
    check live-comment "the blocker text lands as an authored comment" $?
    # A pipe into `grep -q` under `pipefail` can report the pipeline as failed
    # on a false signal: grep stops reading as soon as it has its match, and
    # git can then be killed by SIGPIPE before it exits cleanly - a real race,
    # not a correctness question. Capturing the log first side-steps it.
    # One line per commit: subject, a tab, then the Board-Writer trailer.
    LIVE_SUBJECTS="$(git -C "$LIVE" log --format='%s%x09%(trailers:key=Board-Writer,valueonly,separator=%x2C)')"
    printf '%s\n' "$LIVE_SUBJECTS" | grep -qxF "$(printf 'Add a comment to %s on the board\tSubagentStop' "$ID")"
    check live-comment-commits "the comment is its own commit, naming the hook in a trailer" $?

    # R20 against the real binary: the Blocker is an action at the top of the
    # card, an open action holds the card through a resume, a later Blocker
    # appends, and once each is ticked the resume moves the card and the binary
    # archives the section in the same commit.
    live_actions() { (cd "$LIVE" && "$SHIM" task view "$ID" --json) | jq -c '.task.actionsForHuman'; }
    [ "$(live_actions)" = '[{"index":1,"text":"which key?","checked":false}]' ]
    check live-blocker-actions "the Blocker lands as action 1, unticked, the ask alone" $?
    LIVE_FILE="$LIVE/$( (cd "$LIVE" && "$SHIM" task view "$ID" --json) | jq -r .task.path)"
    LIVE_PLAIN="$(cd "$LIVE" && "$SHIM" task view "$ID")"
    [ "$(grep -m1 '^## ' "$LIVE_FILE")" = "## Actions for Human" ] && grep -qxF -- '- [ ] #1 which key?' "$LIVE_FILE" \
      && [ "$(printf '%s\n' "$LIVE_PLAIN" | grep -nxF 'Actions for Human:' | cut -d: -f1)" -lt "$(printf '%s\n' "$LIVE_PLAIN" | grep -n '^Status:' | cut -d: -f1)" ]
    check live-question-at-top "the question is the first section of the task file and heads the plain view" $?

    LIVE_START_A1="$(jq -nc --arg t "coder-fleet:coder" --arg c "$WTLIVE" '{session_id:"live",agent_id:"a1",agent_type:$t,cwd:$c}')"
    LIVE_HEAD="$(git -C "$LIVE" rev-parse HEAD)"
    run_hook board-subagent-start.sh "$LIVE_START_A1"
    [ "$(cd "$LIVE" && "$SHIM" task view "$ID" --json | jq -r .task.status)" = "Blocked by human" ] \
      && [ "$(git -C "$LIVE" rev-parse HEAD)" = "$LIVE_HEAD" ] && log_has "waiting on the human: 1 open action(s) on $ID"
    check live-hold-open-action "a resume leaves the card in Blocked by human while its action is open, and commits nothing" $?

    (cd "$LIVE" && "$SHIM" task edit "$ID" --check-action 1 --by lead >/dev/null 2>&1)
    run_hook board-subagent-stop.sh \
        "$(jq -nc --arg c "$WTLIVE" '{session_id:"live",agent_id:"a1",agent_type:"coder-fleet:coder",cwd:$c,
                    stop_hook_active:false,agent_transcript_path:"/dev/null",
                    last_assistant_message:"## Done\n- More of it\n\n## Not done\n- The rest\n\n## Unverified\n- None\n\n## Decisions needed\n- Blocker: Pick one\n"}')"
    [ "$(live_actions)" = '[{"index":1,"text":"which key?","checked":true},{"index":2,"text":"[not a question] Pick one","checked":false}]' ]
    check live-blocker-actions-append "a second Blocker appends as action 2, flagged by the binary, and action 1 keeps its tick" $?

    # GitHub issue 10, against the real binary: the resume re-fires the start
    # for the same agent, and the item leaves Blocked by human for In Progress
    # once nothing is open. A binary that refused that transition would fail
    # here and not in the stub.
    (cd "$LIVE" && "$SHIM" task edit "$ID" --check-action 2 --by lead >/dev/null 2>&1)
    run_hook board-subagent-start.sh "$LIVE_START_A1"
    [ "$(cd "$LIVE" && "$SHIM" task view "$ID" --json | jq -r .task.status)" = "In Progress" ] \
      && [ "$(git -C "$LIVE" log -1 --format=%s)" = "Move $ID to In Progress on the board" ] \
      && [ "$(git -C "$LIVE" log -1 --format='%(trailers:key=Board-Writer,valueonly)')" = "SubagentStart" ]
    check live-resume-from-blocked-human "a resume moves the item from Blocked by human to In Progress, committed by SubagentStart" $?
    [ "$(live_actions)" = '[]' ] \
      && [ "$( (cd "$LIVE" && "$SHIM" task view "$ID" --json) | jq '[.task.comments[] | select(.author == "@board")
            | select(.body | test("#1 \\(ticked\\) which key\\?") and test("#2 \\(ticked\\) \\[not a question\\] Pick one"))] | length')" = "1" ] \
      && [ -z "$(git -C "$LIVE" status --porcelain -- .boards/tasks)" ] \
      && LIVE_SHOW="$(git -C "$LIVE" show HEAD)" && printf '%s\n' "$LIVE_SHOW" | grep -qF '+Actions for Human cleared'
    check live-resume-archives-actions "and the binary empties the section into one @board comment in that same commit" $?

    # A resume on a card the real binary reports as Done leaves it there and
    # commits nothing.
    IDDN="$(cd "$LIVE" && "$SHIM" task create "Finished item" --json | jq -r .task.id)"
    (cd "$LIVE" && "$SHIM" focus "$IDDN" >/dev/null)
    LIVE_DONE_START="$(jq -nc --arg c "$WTLIVE" '{session_id:"live-d",agent_id:"ad",agent_type:"coder-fleet:coder",cwd:$c}')"
    run_hook board-subagent-start.sh "$LIVE_DONE_START"
    (cd "$LIVE" && "$SHIM" task edit "$IDDN" -s Done >/dev/null)
    LIVE_HEAD="$(git -C "$LIVE" rev-parse HEAD)"
    run_hook board-subagent-start.sh "$LIVE_DONE_START"
    [ "$(cd "$LIVE" && "$SHIM" task view "$IDDN" --json | jq -r .task.status)" = "Done" ] \
      && [ "$(git -C "$LIVE" rev-parse HEAD)" = "$LIVE_HEAD" ] && log_has "which is Done"
    check live-resume-done-left "a resume on a Done item leaves it Done and commits nothing" $?

    # Criterion 2 against the real binary: bind to one item, refocus to
    # another, resume, then a Blocker stop. The first item takes the move and
    # the comment; the second is untouched.
    IDRA="$(cd "$LIVE" && "$SHIM" task create "First item" --json | jq -r .task.id)"
    IDRB="$(cd "$LIVE" && "$SHIM" task create "Second item" --json | jq -r .task.id)"
    LIVE_REFOCUS_START="$(jq -nc --arg c "$WTLIVE" '{session_id:"live-r",agent_id:"ar",agent_type:"coder-fleet:coder",cwd:$c}')"
    (cd "$LIVE" && "$SHIM" focus "$IDRA" >/dev/null)
    run_hook board-subagent-start.sh "$LIVE_REFOCUS_START"
    (cd "$LIVE" && "$SHIM" focus "$IDRB" >/dev/null)
    run_hook board-subagent-start.sh "$LIVE_REFOCUS_START"
    run_hook board-subagent-stop.sh \
        "$(jq -nc --arg c "$WTLIVE" '{session_id:"live-r",agent_id:"ar",agent_type:"coder-fleet:coder",cwd:$c,
                    stop_hook_active:false,agent_transcript_path:"/dev/null",
                    last_assistant_message:"## Done\n- Half of it\n\n## Not done\n- The rest\n\n## Unverified\n- None\n\n## Decisions needed\n- Blocker: which key?\n"}')"
    [ "$(cd "$LIVE" && "$SHIM" task view "$IDRA" --json | jq -r .task.status)" = "Blocked by human" ] \
      && [ "$(cd "$LIVE" && "$SHIM" task view "$IDRB" --json | jq -r .task.status)" = "To Do" ] \
      && [ "$(cd "$LIVE" && "$SHIM" task view "$IDRB" --json | jq -r '(.task.comments // []) | length')" = "0" ]
    check live-resume-blocker-first-item "a Blocker after a refocused resume moves the first item and leaves the second untouched" $?

    # Two switches. NO_COMMIT writes the file and nothing else; a cwd outside
    # any repository has no board, and the hook says so and exits 0.
    ID2="$(cd "$LIVE" && CODER_FLEET_BOARD_NO_COMMIT=1 "$SHIM" task create "Uncommitted" --json | jq -r .task.id)"
    # The task file on disk names the item lower-cased (bd-2, not BD-2); -i
    # matches the identity, not the CLI's own filename casing convention.
    LIVE_PORCELAIN="$(git -C "$LIVE" status --porcelain)"
    printf '%s\n' "$LIVE_PORCELAIN" | grep -qi "$ID2"; check live-no-commit "CODER_FLEET_BOARD_NO_COMMIT=1 leaves the write uncommitted" $?
    git -C "$LIVE" add -A && git -C "$LIVE" commit -qm tidy
    NOWHERE="$TMP/nowhere"; mkdir -p "$NOWHERE"
    run_hook board-subagent-start.sh \
        "$(jq -nc --arg c "$NOWHERE" '{session_id:"live2",agent_id:"a2",agent_type:"coder-fleet:coder",cwd:$c}')"
    [ "$RC" -eq 0 ] && log_has "no board here"; check live-no-board "a cwd outside a repository logs 'no board here' and exits 0" $?

    export CODER_FLEET_BOARD=off
fi

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'A board hook is reading a field the runtime does not send, or moving a card without evidence.\n'
    exit 1
fi
printf 'The board hooks match the runtime event shapes and move cards only on evidence.\n'
