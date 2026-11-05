#!/usr/bin/env bash
#
# board-hook-contract.sh - hold the board hooks to the runtime's actual event
# shapes, to the rule that a hook moves an issue only on evidence, and to the gh
# calls that move it.
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
# A hook that reads a field from that "no" column does not fail loudly - it
# silently takes its fallback path forever, and the fallback looks like normal
# operation. These cases exist so that never goes unnoticed.
#
# The board is the repository's GitHub issues, reached through gh: a column is a
# status label (none for To Do, closed for Done), a comment is an issue comment,
# and the actions for the human and the card gate's checklists are task lists
# in the issue body. Every case runs against fake-gh, a stand-in first on PATH
# that keeps its issues as JSON under $FAKE_GH_DIR and logs every call it gets,
# and against a scratch git repository whose .git holds the focus. Nothing here
# reaches the network, a real repository or the checkout running the suite. A
# case reads what the hooks did off the issue JSON and the call log.
#
# The offline cases run with CODER_FLEET_BOARD=off, or a dry run, and hold the
# hooks to the events and the handoff. The rest turn the board on against
# fake-gh: the resume binding, the stale focus, the hold for open actions, the
# workflow-run binding, the stopped marker and the Agent tool's return, the card
# gate, the comment cap and its archive, the focus and its clearing, and how
# each hook behaves when gh is missing or failing.
#
# Usage:  evals/lib/board-hook-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
HOOKS="$PLUGIN_ROOT/hooks"
FOCUS_SH="$PLUGIN_ROOT/scripts/focus.sh"

for tool in jq python3 git; do
    command -v "$tool" >/dev/null 2>&1 || {
        printf 'board-hook-contract: %s is needed to drive the hooks\n' "$tool" >&2; exit 2; }
done

TMP=$(mktemp -d "${TMPDIR:-/tmp}/board-hook-contract.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT
# Whether file permissions bind this process. Under root (or any process
# holding CAP_DAC_OVERRIDE) chmod changes nothing, so a case that makes a file
# or directory unwritable cannot show what it claims: it prints a SKIP line,
# counted as neither pass nor fail, rather than failing a suite that is green
# everywhere permissions bind.
perms_bind() {
    local probe="$TMP/perms-probe"
    : > "$probe" && chmod 000 "$probe"
    if [ -r "$probe" ]; then rm -f "$probe"; return 1; fi
    rm -f "$probe"; return 0
}

# fake-gh, first on PATH, and nothing that would point a real gh anywhere. If
# the link does not win the lookup the suite stops before any hook runs.
mkdir -p "$TMP/bin"
ln -s "$LIB_DIR/fake-gh" "$TMP/bin/gh"
export PATH="$TMP/bin:$PATH"
export FAKE_GH_DIR="$TMP/gh"
unset BOARD_GH GH_REPO GH_HOST FAKE_GH_FAIL
[ "$(command -v gh)" = "$TMP/bin/gh" ] || {
    printf 'board-hook-contract: fake-gh is not first on PATH; refusing to run against a real gh\n' >&2; exit 2; }

export CODER_FLEET_STATE_DIR="$TMP/state"
export CODER_FLEET_BOARD=off
# Claude Code hands a project's settings env to every Bash call and hook, and
# this repository's own settings set a strict gate that runs check-all.sh, so a
# run of this suite from inside a session, or from inside that gate, would
# otherwise hand those values to the TaskCompleted cases and fail them. The
# library's own knobs are cleared for the same reason.
unset CODER_FLEET_TEST_COMMAND CODER_FLEET_TEST_GATE CODER_FLEET_TEST_TIMEOUT CODER_FLEET_TEST_STATUS_FILE CODER_FLEET_TEST_STATUS_MAX_AGE
unset CODER_FLEET_BOARD_PAGE_ID BOARD_DRY_RUN BOARD_COMMENT_MAX_CHARS BOARD_CWD BOARD_LOG_FILE BOARD_CLI_TIMEOUT BOARD_CLI_QUIET
unset BOARD_RUN_SESSION BOARD_RUN_AGENT BOARD_RUN_AGENT_ID BOARD_RUN_STATUS CODER_FLEET_HOOK_DUMP CODER_FLEET_HANDOFF_REEMIT_CAP
mkdir -p "$CODER_FLEET_STATE_DIR"

# The scratch repository every hook runs in. The suite itself runs from inside
# it too, so a hook that falls back to $PWD for want of a cwd finds this
# repository's focus and never the one of the checkout running the suite.
REPO="$TMP/repo"
git init -q "$REPO"
git -C "$REPO" config user.email t@t
git -C "$REPO" config user.name t
git -C "$REPO" commit -q --allow-empty -m base
FOCUS_FILE="$REPO/.git/coder-fleet/focus"
cd "$REPO" || exit 2

PASSED=0
FAILED=0

section() { printf '\n%s\n' "$1"; }

check() {
    # $1 case name, $2 description of the requirement, $3 predicate result (0 ok)
    if [ "$3" -eq 0 ]; then
        PASSED=$((PASSED + 1))
        printf '  ok    %-42s %s\n' "$1" "$2"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %-42s %s\n' "$1" "$2"
        if [ "$VERBOSE" -eq 1 ]; then
            printf '        exit=%s\n' "${RC:-}"
            sed 's/^/        log: /' "$LOG" 2>/dev/null | head -12
            sed 's/^/        gh: /' "$FAKE_GH_DIR/calls.log" 2>/dev/null | tail -8
        fi
    fi
}
skip_case() { printf '  SKIP  %-42s %s\n' "$1" "$2"; }

LOG="$TMP/log"
log_has() { grep -qF -- "$1" "$LOG" 2>/dev/null; }
err_has() { grep -qF -- "$1" "$TMP/err" 2>/dev/null; }

# ------------------------------------------------------------------ fake-gh
STATUS_LABELS='["status:next","status:in-progress","status:blocked","status:blocked-by-human"]'
# A body whose card gate passes: one criterion and one Definition of Done item,
# both ticked.
BODY_TICKED='What the human asked for.

## Acceptance criteria
- [x] Parser rejects empty input

## Definition of Done
- [x] check-all passes
'

# gh_reset [LABELS]: no issues, no calls, and the repository's labels (every
# status label unless given).
gh_reset() {
    rm -rf "$FAKE_GH_DIR"
    mkdir -p "$FAKE_GH_DIR/issues"
    printf '%s\n' "${1:-$STATUS_LABELS}" > "$FAKE_GH_DIR/labels.json"
}
# seed N [STATE [LABELS [BODY]]]
seed() {
    jq -nc --argjson n "$1" --arg s "${2:-OPEN}" --argjson l "${3:-[]}" --arg b "${4:-$BODY_TICKED}" \
        '{number:$n,title:"Issue \($n)",state:$s,labels:$l,body:$b,comments:[]}' > "$FAKE_GH_DIR/issues/$1.json"
}
# set_issue N JQ: rewrite issue N in place, as a person on GitHub would.
set_issue() {
    jq -c "$2" "$FAKE_GH_DIR/issues/$1.json" > "$TMP/issue.tmp" && mv "$TMP/issue.tmp" "$FAKE_GH_DIR/issues/$1.json"
}
issue_q() { jq -r "$2" "$FAKE_GH_DIR/issues/$1.json" 2>/dev/null; }
labels() { issue_q "$1" '.labels | sort | join(",")'; }
ncomments() { issue_q "$1" '.comments | length'; }
last_comment() { issue_q "$1" '.comments[-1] // ""'; }
body() { issue_q "$1" '.body'; }
# calls FILTER: how many logged gh calls match a jq condition on the argv.
calls() {
    if [ ! -s "$FAKE_GH_DIR/calls.log" ]; then printf '0\n'; return; fi
    jq -c "select($1)" "$FAKE_GH_DIR/calls.log" | wc -l | tr -d ' '
}
gh_calls_reset() { : > "$FAKE_GH_DIR/calls.log"; }
WRITES='(.[0] == "issue" and (.[1] as $s | ["edit","comment","create","close","reopen"] | index($s)))
        or (.[0] == "label" and .[1] == "create")'
no_writes() { [ "$(calls "$WRITES")" -eq 0 ]; }
no_gh_calls() { [ ! -s "$FAKE_GH_DIR/calls.log" ]; }
edits() { calls ".[0] == \"issue\" and .[1] == \"edit\" and .[2] == \"$1\""; }
touches() { calls ".[2] == \"$1\""; }
# The writes in the order they reached gh, one word each: labels, body,
# comment, label-create.
write_order() {
    [ -s "$FAKE_GH_DIR/calls.log" ] || return 0
    jq -r "select($WRITES)
        | if .[0] == \"label\" then \"label-create\"
          elif .[1] == \"comment\" then \"comment\"
          elif index(\"--body-file\") then \"body\"
          else \"labels\" end" "$FAKE_GH_DIR/calls.log" | tr '\n' ' ' | sed 's/ $//'
}

focus() { mkdir -p "$(dirname "$FOCUS_FILE")"; printf '%s\n' "$1" > "$FOCUS_FILE"; }
unfocus() { rm -f "$FOCUS_FILE"; }
state_reset() { rm -rf "$CODER_FLEET_STATE_DIR/sessions/$1"; }
record_page() { sed -n 's/^page_id=//p' "$CODER_FLEET_STATE_DIR/sessions/$1/agents/$2" 2>/dev/null; }

# ------------------------------------------------------------------ running
# run_hook HOOK JSON [VAR=value ...]: the board as the environment has it, off
# unless a case says otherwise. $RC, $LOG, $TMP/out and $TMP/err.
run_hook() {
    local hook="$1" json="$2"; shift 2
    : > "$LOG"
    RC=0
    printf '%s' "$json" | env BOARD_LOG_FILE="$LOG" "$@" "$HOOKS/$hook" >"$TMP/out" 2>"$TMP/err" || RC=$?
}
# run_gh HOOK JSON [VAR=value ...]: the board on, against fake-gh.
run_gh() {
    local hook="$1" json="$2"; shift 2
    run_hook "$hook" "$json" CODER_FLEET_BOARD=on "$@"
}
# run_hook_bound HOOK JSON: on, but a dry run, bound to #1 by the launch
# variable, so a case can see the write a hook decided on without making it.
run_hook_bound() {
    run_hook "$1" "$2" CODER_FLEET_BOARD=on BOARD_DRY_RUN=1 CODER_FLEET_BOARD_PAGE_ID='#1'
}

start_ev() {
    # $1 session, $2 agent id, $3 agent type, $4 cwd
    jq -nc --arg s "$1" --arg a "$2" --arg t "${3:-coder-fleet:coder}" --arg c "${4:-$REPO}" \
        '{session_id:$s,agent_id:$a,agent_type:$t,cwd:$c}'
}
stop_ev() {
    # $1 session, $2 agent id, $3 final message, $4 agent type, $5 transcript path
    jq -nc --arg s "$1" --arg a "$2" --arg m "$3" --arg t "${4-coder-fleet:coder}" --arg p "${5:-/dev/null}" --arg c "$REPO" \
        '{session_id:$s,agent_id:$a,agent_type:$t,cwd:$c,stop_hook_active:false,agent_transcript_path:$p,last_assistant_message:$m}'
}
task_ev() {
    # $1 task subject, $2 cwd
    jq -nc --arg s "$1" --arg c "${2:-$REPO}" '{session_id:"s-task",cwd:$c,task_id:"t1",task_subject:$s}'
}

H_CLEAN='## Done
- Shipped it

## Not done
- None

## Unverified
- None

## Decisions needed
- None
'
# handoff_blockers ASK...: a valid handoff with one Blocker line per ask.
handoff_blockers() {
    printf '## Done\n- Half of it\n\n## Not done\n- The rest\n\n## Unverified\n- None\n\n## Decisions needed\n'
    local b
    for b in "$@"; do printf -- '- Blocker: %s\n' "$b"; done
}

section 'TaskCompleted: the documented subject field, and the [issue:#N] marker'

# R05. The runtime sends task_subject. A marker in it must bind the issue.
run_hook board-task-completed.sh "$(task_ev 'Ship the refresh [issue:#12]')"
log_has "names issue #12"; check task_subject-binds "an [issue:#N] marker in task_subject resolves the issue" $?

# The legacy names stay readable, so an older build still works.
run_hook board-task-completed.sh \
    "$(jq -nc --arg c "$REPO" '{session_id:"s1",cwd:$c,task_id:"t1",task_title:"Ship the refresh [issue:#12]"}')"
log_has "names issue #12"; check task_title-fallback "the legacy task_title is still read as a fallback" $?

run_hook board-task-completed.sh \
    "$(jq -nc --arg c "$REPO" '{session_id:"s1",cwd:$c,task_id:"t1",task_subject:"Real [issue:#12]",task_title:"Stale [issue:#13]"}')"
log_has "names issue #12" && ! log_has "#13"; check subject-wins "task_subject wins over a conflicting task_title" $?

# A ref is #N, N or the issue's URL, in a marker of any case. Nothing else is.
marker_binds() {
    # $1 subject, $2 the ref it must name, or "" for none
    run_hook board-task-completed.sh "$(task_ev "$1")"
    if [ -n "$2" ]; then log_has "names issue $2"; else ! log_has "names issue"; fi
}
marker_binds 'Ship [issue:12]' '#12';                                      check marker-bare-number "a bare number is the issue" $?
marker_binds 'Ship [ISSUE: #12]' '#12';                                    check marker-any-case "the marker reads in any case, with a space after the colon" $?
marker_binds 'Ship [issue:https://github.com/o/r/issues/12]' '#12';        check marker-url "the issue's URL resolves to its number" $?
marker_binds 'Ship [issue:https://github.com/o/r/issues/12#issuecomment-9]' '#12'; check marker-url-fragment "a URL with a comment fragment resolves to the issue" $?
marker_binds 'Ship [issue:https://github.com/o/r/pull/12]' '';             check marker-pull-url-is-not-a-ref "a pull request URL is not an issue ref" $?
marker_binds 'Ship [issue:#012]' '';                                       check marker-leading-zero-refused "a leading zero is refused rather than guessed at" $?
marker_binds 'Ship [issue:BD-12]' '';                                      check marker-old-id-is-not-a-ref "an old board id is not a ref" $?
marker_binds 'Ship [board:BD-12]' '';                                      check marker-board-is-gone "the old [board:] marker binds nothing" $?

section 'TaskCompleted: only an explicit issue task completes an issue'

# R06. An unmarked task moves nothing and reads nothing, with the board on and
# an issue in flight.
gh_reset; seed 1 OPEN '["status:in-progress"]'
run_gh board-task-completed.sh "$(task_ev 'Fix the parser')"
no_gh_calls && log_has "no column moves"; check unmarked-moves-nothing "an unmarked execution task calls no gh and says why" $?

# The launch variable says which issue is in flight, never that this task finished it.
run_gh board-task-completed.sh "$(task_ev 'Partial work')" CODER_FLEET_BOARD_PAGE_ID='#1'
no_gh_calls; check env-does-not-close "CODER_FLEET_BOARD_PAGE_ID alone does not make a task complete an issue" $?

section 'TaskCompleted: the gate tests the checkout that did the work'

# R03. Parent tree passes, worktree fails. The hook is told cwd=worktree and
# CLAUDE_PROJECT_DIR=parent, which is exactly what an isolated coder produces.
mkdir -p "$TMP/parent/.claude" "$TMP/worktree/.claude"
printf 'pass\n' > "$TMP/parent/.claude/test-status"
printf 'fail\nassertion failed in session.test.ts\n' > "$TMP/worktree/.claude/test-status"
run_hook board-task-completed.sh "$(task_ev done "$TMP/worktree")" CLAUDE_PROJECT_DIR="$TMP/parent"
[ "$RC" -eq 2 ]; check worktree-is-tested "a failing worktree blocks even when the parent passes" $?

# R03, the other half: a pass that predates the code it approves is not evidence.
mkdir -p "$TMP/stale/.claude"
printf 'pass\n' > "$TMP/stale/.claude/test-status"
sleep 1
printf 'console.log("edited after the tests ran")\n' > "$TMP/stale/app.js"
run_hook board-task-completed.sh "$(task_ev done "$TMP/stale")"
log_has "has been modified since"; check stale-pass-ignored "a pass older than the tree is not treated as a pass" $?

mkdir -p "$TMP/fresh/.claude"
printf 'console.log("code")\n' > "$TMP/fresh/app.js"
sleep 1
printf 'pass\n' > "$TMP/fresh/.claude/test-status"
run_hook board-task-completed.sh "$(task_ev done "$TMP/fresh")"
[ "$RC" -eq 0 ] && grep -qE '\] tests pass$' "$LOG"; check fresh-pass-honoured "a pass newer than the tree is still honoured" $?

run_hook board-task-completed.sh "$(task_ev done /nonexistent/nowhere)"
[ "$RC" -eq 2 ]; check absent-cwd-blocks "an unusable cwd blocks rather than testing \$PWD" $?

section 'SubagentStart: binding without a spawn prompt'

# R07. The documented event carries agent identity only.
run_hook board-subagent-start.sh "$(start_ev s8 a1)"
log_has "nothing is focused"; check start-unbound-noop "a documented-shape start event with no binding moves nothing" $?

run_hook board-subagent-start.sh "$(start_ev s9 a2)" CODER_FLEET_BOARD_PAGE_ID='#1'
log_has "picked up #1"; check start-env-binds "an explicit launch binding is recorded" $?

# The spawn-prompt convention, for a runtime that sends one: the first Issue:
# line, any case, a leading "- " tolerated, the first token after the colon.
issue_line_binds() {
    # $1 instructions, $2 the ref it must bind, or "" for none
    state_reset s-il
    run_hook board-subagent-start.sh \
        "$(jq -nc --arg c "$REPO" --arg i "$1" '{session_id:"s-il",agent_id:"a-il",agent_type:"coder-fleet:coder",cwd:$c,instructions:$i}')" \
        CODER_FLEET_BOARD=on BOARD_DRY_RUN=1
    if [ -n "$2" ]; then log_has "picked up $2 (from the Issue: line in the spawn prompt)"
    else ! log_has "Issue: line"; fi
}
issue_line_binds $'Build it.\nIssue: #12\n' '#12';                         check issue-line-binds "an Issue: line in the spawn prompt binds its issue" $?
issue_line_binds $'Build it.\n  - issue: 12 the login page\n' '#12';       check issue-line-list-item "a list-item Issue: line in any case binds its first token" $?
issue_line_binds $'Issue: https://github.com/o/r/issues/12\nIssue: #13\n' '#12'; check issue-line-url-first-wins "the issue's URL binds, and the first line wins" $?
issue_line_binds $'Board-Item: BD-1\n' '';                                 check issue-line-board-item-gone "an old Board-Item: line binds nothing" $?
issue_line_binds $'See Issue: #12 for context\n' '';                        check issue-line-must-lead "a line where Issue: does not lead binds nothing" $?

section 'SubagentStop: no status field exists'

# R15. The runtime sends no status and no completion_reason, so the hook reads
# neither, and Blocked is written by TaskCompleted only. Both cases run with an
# issue bound and the board on in dry run, because an unbound case cannot see
# the write it exists to forbid.
log_moved_to_blocked() { grep -qE 'would move #1 to Blocked( with a comment)?$' "$LOG" 2>/dev/null; }

run_hook_bound board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s10",agent_id:"a3",agent_type:"coder-fleet:scout",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                status:"failure",last_assistant_message:"I gave up."}')"
[ "$RC" -eq 2 ] && ! log_has "finished with status" && ! log_moved_to_blocked
check stop-status-failure-ignored "a status field does not bypass the handoff check or write Blocked" $?

run_hook_bound board-subagent-stop.sh \
    "$(jq -nc --arg m "$H_CLEAN" '{session_id:"s10b",agent_id:"a3b",agent_type:"coder-fleet:scout",
                stop_hook_active:false,agent_transcript_path:"/dev/null",
                status:"failure",completion_reason:"cancelled",last_assistant_message:$m}')"
[ "$RC" -eq 0 ] && log_has "succeeded with no blockers" && ! log_has "finished with status" && ! log_moved_to_blocked
check stop-completion-reason-ignored "a failure status and a cancelled reason on a valid handoff change nothing" $?

section 'SubagentStop: the board writes, issue-bound in dry run'

run_hook_bound board-subagent-stop.sh "$(stop_ev s16 a16 "$H_CLEAN")"
[ "$RC" -eq 0 ] && log_has "dry run: would comment on #1" && ! log_has "would move #1"
check stop-done-comment-posted "a valid no-blocker handoff comments on the issue and moves no column" $?

run_hook_bound board-subagent-stop.sh "$(stop_ev s17 a17 "$(handoff_blockers 'which key?')")"
[ "$RC" -eq 0 ] && log_has "would move #1 to Blocked by human with a comment" && ! log_moved_to_blocked
check stop-blocker-moves-to-human "a Blocker: line moves the issue to Blocked by human with a comment, never to Blocked" $?

section 'SubagentStop: a structured-output run carries no handoff'

# Measured against Claude Code 2.1.236 with a live probe: a subagent spawned
# with a schema is forced through StructuredOutput, and its SubagentStop payload
# OMITS last_assistant_message entirely. A run with no handoff field is not a
# malformed handoff; it is a run that was never asked for one.
run_hook board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s11",agent_id:"a4",agent_type:"coder-fleet:scout",stop_hook_active:false,agent_transcript_path:"/dev/null"}')"
[ "$RC" -eq 0 ]; check stop-structured-run-passes "a schema-spawned run with no handoff field is not a malformed handoff" $?

# A guard on the validator: the runtime never sends "", but empty is not absent.
run_hook board-subagent-stop.sh "$(stop_ev s12 a5 '' coder-fleet:scout)"
[ "$RC" -eq 2 ]; check stop-empty-message-blocks "an empty final message is still a malformed handoff" $?

run_hook board-subagent-stop.sh "$(stop_ev s13 a6 'I fixed it. Looks good to me.' coder-fleet:scout)"
[ "$RC" -eq 2 ]; check stop-prose-blocks "prose in place of a handoff is still refused" $?

run_hook board-subagent-stop.sh \
    "$(jq -nc '{session_id:"s14",agent_id:"a7",stop_hook_active:false,agent_transcript_path:"/dev/null",last_assistant_message:"I fixed it."}')"
[ "$RC" -eq 0 ]; check stop-untyped-stands-down "a stop with no agent_type owes no handoff and is let go" $?
log_has "untyped"; check stop-untyped-is-named "and the log says the type was missing, not that a role called agent failed" $?

run_hook board-subagent-stop.sh "$(stop_ev s15 a8 'I fixed it.' '')"
[ "$RC" -eq 0 ]; check stop-empty-type-stands-down "an empty agent_type is the same missing type" $?

section 'SubagentStop: absent means ask the transcript'

# The runtime builds the field as `content.trim() || void 0`, so a schema spawn
# and a fleet agent that was asked and said nothing arrive identical. The
# transcript tells them apart: a StructuredOutput tool_use last, or text.
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
    jq -nc --arg t "$1" '{session_id:"s20",agent_id:"a20",agent_type:"coder-fleet:scout",stop_hook_active:false,agent_transcript_path:$t}'
}
# a20 has a start record, as a spawned agent would, so a missing transcript in
# these cases is read as unreadable rather than as a side call's.
mkdir -p "$CODER_FLEET_STATE_DIR/sessions/s20/agents"
printf 'page_id=\nagent_type=coder-fleet:scout\n' > "$CODER_FLEET_STATE_DIR/sessions/s20/agents/a20"

mk_transcript "$TMP/t-structured.jsonl" structured
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-structured.jsonl")"
[ "$RC" -eq 0 ] && log_has "StructuredOutput"; check stop-transcript-structured-passes "a StructuredOutput final block is a run that owed no handoff" $?

mk_transcript "$TMP/t-empty.jsonl" emptytext
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-empty.jsonl")"
[ "$RC" -eq 2 ]; check stop-transcript-empty-handoff-blocks "a fleet agent that was asked and said nothing still fails" $?

mk_transcript "$TMP/t-text.jsonl" text
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-text.jsonl")"
[ "$RC" -eq 0 ]; check stop-transcript-recovers-a-handoff "a recoverable handoff is read rather than refused" $?

run_hook board-subagent-stop.sh "$(stop_absent "$TMP/nonexistent.jsonl")"
[ "$RC" -eq 0 ] && log_has "could not be read"; check stop-transcript-unreadable-passes "an unreadable transcript says so and lets the run stop" $?

run_hook board-subagent-stop.sh "$(jq -nc '{session_id:"s21",agent_id:"a21",agent_type:"coder-fleet:scout",stop_hook_active:false}')"
[ "$RC" -eq 0 ]; check stop-no-transcript-path-passes "and so does an event carrying no transcript path at all" $?

mk_transcript "$TMP/t-none.jsonl" none
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-none.jsonl")"
[ "$RC" -eq 0 ]; check stop-transcript-no-assistant-passes "a transcript with no assistant content decides nothing" $?

# The last block is classified after it is taken, so a trailing ordinary tool
# call never lets an earlier text block stand in for the final message.
printf '%s\n' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Let me check the config file."}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}' \
  > "$TMP/t-trailing-tool.jsonl"
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-trailing-tool.jsonl")"
[ "$RC" -eq 0 ]; check stop-transcript-trailing-tool-passes "a transcript ending in a tool call is not a handoff to validate" $?
! log_has "ends in text"; check stop-transcript-does-not-claim-text "and the hook does not claim it ended in text" $?

printf '%s\n' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"StructuredOutput","input":{"a":1}}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Grep","input":{}}]}}' \
  > "$TMP/t-tool-after-structured.jsonl"
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-tool-after-structured.jsonl")"
! log_has "StructuredOutput"; check stop-transcript-tool-is-not-structured "a later ordinary tool call is not read as structured output" $?

printf '%s\n' \
  '{"type":"assistant","message":{"content":[{"type":"text","text":"## Done\n- x\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None"}]}}' \
  '{"type":"user","message":{"content":[{"type":"text","text":"not the agent talking"}]}}' \
  > "$TMP/t-user-last.jsonl"
run_hook board-subagent-stop.sh "$(stop_absent "$TMP/t-user-last.jsonl")"
[ "$RC" -eq 0 ]; check stop-transcript-ignores-user-turns "a user turn after the agent's does not become the handoff" $?

run_hook board-subagent-stop.sh ''
[ "$RC" -eq 0 ]; check stop-empty-stdin-does-not-block "empty stdin is not a malformed handoff" $?

section 'SubagentStop: an opt-in dump of the raw event'

DUMP_EVENT="$(stop_ev s-dump a-dump "$H_CLEAN" coder-fleet:scout)"
run_hook board-subagent-stop.sh "$DUMP_EVENT" CODER_FLEET_HOOK_DUMP="$TMP/dump"
dumped="$(ls "$TMP/dump" 2>/dev/null | head -1)"
[ "$RC" -eq 0 ] && [ -n "$dumped" ] && [ "$(cat "$TMP/dump/$dumped")" = "$DUMP_EVENT" ]
check stop-dump-writes-raw-event "CODER_FLEET_HOOK_DUMP gets the event exactly as it arrived" $?

dump_dir_mode="$(ls -ld "$TMP/dump" 2>/dev/null | cut -c1-10)"
dump_file_mode="$(ls -l "$TMP/dump/$dumped" 2>/dev/null | cut -c1-10)"
[ "$dump_dir_mode" = "drwx------" ] && [ "$dump_file_mode" = "-rw-------" ]
check stop-dump-is-private "the dump directory is 700 and the file 600" $?

mkdir -p "$TMP/nodump/home" "$TMP/nodump/tmp"
run_hook board-subagent-stop.sh "$DUMP_EVENT" HOME="$TMP/nodump/home" TMPDIR="$TMP/nodump/tmp"
[ "$RC" -eq 0 ] && [ -z "$(find "$TMP/nodump" -type f 2>/dev/null)" ] \
    && [ -z "$(find "$TMP" -name 'subagent-stop-*' -not -path "$TMP/dump/*" 2>/dev/null)" ]
check stop-dump-off-writes-nothing "with CODER_FLEET_HOOK_DUMP unset, no event is written anywhere" $?

section "SubagentStop: the session's own side calls owe no handoff"

# Captured live on Claude Code 2.1.292: the prompt-suggestion side call fires
# SubagentStop typed as the session's agent, with no SubagentStart and a
# transcript path that names no file.
LEAD_SIDE_CALL="$(jq -nc --arg t "$TMP/no-such-dir/subagents/agent-a41757ecf7f9b29ef.jsonl" \
    '{session_id:"s-side",cwd:"/tmp/p",permission_mode:"auto",agent_id:"a41757ecf7f9b29ef",
      agent_type:"coder-fleet:lead",hook_event_name:"SubagentStop",stop_hook_active:false,
      agent_transcript_path:$t,last_assistant_message:"Now write hi4 to hi4.txt and reply ready",
      background_tasks:[],session_crons:[]}')"
run_hook board-subagent-stop.sh "$LEAD_SIDE_CALL"
[ "$RC" -eq 0 ] && ! log_has "malformed"; check stop-lead-side-call-stands-down "the captured lead-typed side call is let go, never exit 2" $?
log_has "side call"; check stop-lead-side-call-is-named "and the log says it was the session's side call" $?

run_hook board-subagent-stop.sh "$(stop_ev s-side a-bare-lead 'I fixed it.' lead)"
[ "$RC" -eq 0 ]; check stop-bare-lead-stands-down "an unprefixed lead type is the same side call" $?

run_hook board-subagent-stop.sh \
    "$(stop_ev s-side a-lane '{"verdict":"approve"}' coder-fleet:lead "$TMP/s/subagents/workflows/wf_side/agent-a-lane.jsonl")"
[ "$RC" -eq 0 ]; check stop-lead-workflow-lane-stands-down "a lead-typed workflow lane is not held to the handoff" $?

MATCHER=$(jq -r '.hooks.SubagentStop[0].matcher' "$HOOKS/hooks.json")
! [[ "coder-fleet:lead" =~ $MATCHER ]] && ! [[ "lead" =~ $MATCHER ]] && [[ "coder-fleet:coder" =~ $MATCHER ]]
check matcher-skips-lead "the matcher skips lead and still takes coder" $?

run_hook board-subagent-stop.sh \
    "$(stop_ev s-shape a-coder-side 'Now run the tests' coder-fleet:coder "$TMP/no-such-dir/subagents/agent-a-coder-side.jsonl")"
[ "$RC" -eq 0 ] && log_has "side call" && ! log_has "malformed"
check stop-sidecall-shape-stands-down "a coder-typed stop with no start record and no transcript is a side call" $?

mkdir -p "$CODER_FLEET_STATE_DIR/sessions/s-shape/agents"
printf 'page_id=\nagent_type=coder-fleet:coder\n' > "$CODER_FLEET_STATE_DIR/sessions/s-shape/agents/a-coder-started"
run_hook board-subagent-stop.sh \
    "$(stop_ev s-shape a-coder-started 'I fixed it.' coder-fleet:coder "$TMP/no-such-dir/subagents/agent-a-coder-started.jsonl")"
[ "$RC" -eq 2 ]; check stop-started-agent-gated "a stop with a start record is gated even with no transcript" $?

printf '%s\n' '{"type":"assistant","message":{"content":[{"type":"text","text":"working"}]}}' > "$TMP/t-real-run.jsonl"
run_hook board-subagent-stop.sh "$(stop_ev s-shape a-coder-unstarted 'I fixed it.' coder-fleet:coder "$TMP/t-real-run.jsonl")"
[ "$RC" -eq 2 ]; check stop-transcript-agent-gated "a stop with a transcript is gated even with no start record" $?

section 'SubagentStop: a gated stop re-emits a bounded number of times'

CAP_BAD="$(stop_ev s-cap a-cap 'I fixed it.')"
CAP_ACTIVE="$(printf '%s' "$CAP_BAD" | jq -c '.stop_hook_active = true')"
cap_rcs=""
for i in 1 2 3 4; do
    if [ "$i" -eq 1 ]; then run_hook board-subagent-stop.sh "$CAP_BAD"; else run_hook board-subagent-stop.sh "$CAP_ACTIVE"; fi
    cap_rcs="$cap_rcs$RC"
done
[ "$cap_rcs" = "2220" ]; check stop-reemit-cap "three re-emits, then the fourth malformed stop is let go" $?
log_has "still malformed after 3 re-emits"; check stop-reemit-cap-is-logged "and the log says the cap let it go" $?

run_hook board-subagent-stop.sh "$(stop_ev s-cap2 a-cap2 no)"
run_hook board-subagent-stop.sh "$(stop_ev s-cap2 a-cap2 no | jq -c '.stop_hook_active = true')"
run_hook board-subagent-stop.sh "$(stop_ev s-cap2 a-cap2 "$H_CLEAN" | jq -c '.stop_hook_active = true')"
reset_rcs=""
for i in 1 2 3; do
    run_hook board-subagent-stop.sh "$(stop_ev s-cap2 a-cap2 no)"
    reset_rcs="$reset_rcs$RC"
done
[ "$reset_rcs" = "222" ]; check stop-reemit-reset "a valid handoff gives the agent its re-emits back" $?

run_hook board-subagent-stop.sh "$(stop_ev s-cap3 '' no | jq -c 'del(.agent_id)')"
first_rc=$RC
run_hook board-subagent-stop.sh "$(stop_ev s-cap3 '' no | jq -c 'del(.agent_id) | .stop_hook_active = true')"
[ "$first_rc" -eq 2 ] && [ "$RC" -eq 0 ]; check stop-active-no-id-lets-go "with no agent id, stop_hook_active caps it at one re-emit" $?

if ! perms_bind; then
    skip_case stop-unwritable-count-lets-go "chmod binds nothing here (running as root?), so an unwritable count cannot be shown"
else
    mkdir -p "$CODER_FLEET_STATE_DIR/sessions/s-unw/agents"
    chmod 500 "$CODER_FLEET_STATE_DIR/sessions/s-unw/agents"
    run_hook board-subagent-stop.sh "$(stop_ev s-unw a-unw no)"
    first_rc=$RC
    run_hook board-subagent-stop.sh "$(stop_ev s-unw a-unw no | jq -c '.stop_hook_active = true')"
    chmod 700 "$CODER_FLEET_STATE_DIR/sessions/s-unw/agents"
    [ "$first_rc" -eq 2 ] && [ "$RC" -eq 0 ]; check stop-unwritable-count-lets-go "an agent whose count cannot be written gets one re-emit, by stop_hook_active" $?
fi

for i in 1 2 3; do
    run_hook board-subagent-stop.sh "$(stop_ev s-two a-two-a no | jq -c '.stop_hook_active = true')"
done
run_hook board-subagent-stop.sh "$(stop_ev s-two a-two-b no | jq -c '.stop_hook_active = true')"
b_rc=$RC
run_hook board-subagent-stop.sh "$(stop_ev s-two a-two-a no | jq -c '.stop_hook_active = true')"
[ "$b_rc" -eq 2 ] && [ "$RC" -eq 0 ]; check stop-reemit-count-per-agent "one agent at its cap leaves another agent's count in the same session alone" $?

section 'SubagentStop: every log line names the session and the checkout'

CTX_CWD="$TMP/ctx checkout"
mkdir -p "$CTX_CWD"
ctx_ok=0
for ev in \
    "$(jq -nc --arg c "$CTX_CWD" --arg m "$(handoff_blockers 'which key?')" '{session_id:"s-ctx",cwd:$c,agent_id:"a-ctx1",agent_type:"coder-fleet:coder",stop_hook_active:false,agent_transcript_path:"/dev/null",last_assistant_message:$m}')" \
    "$(jq -nc --arg c "$CTX_CWD" '{session_id:"s-ctx",cwd:$c,agent_id:"a-ctx2",agent_type:"coder-fleet:coder",stop_hook_active:false,agent_transcript_path:"/dev/null",last_assistant_message:"no"}')" \
    "$(jq -nc --arg c "$CTX_CWD" '{session_id:"s-ctx",cwd:$c,agent_id:"a-ctx3",stop_hook_active:false,agent_transcript_path:"/dev/null",last_assistant_message:"no"}')" \
    "$(jq -nc --arg c "$CTX_CWD" '{session_id:"s-ctx",cwd:$c,agent_id:"a-ctx4",agent_type:"coder-fleet:lead",stop_hook_active:false,agent_transcript_path:"/dev/null",last_assistant_message:"no"}')"; do
    run_hook_bound board-subagent-stop.sh "$ev"
    [ -s "$LOG" ] || ctx_ok=1
    if grep -vF "session=s-ctx cwd=$CTX_CWD]" "$LOG" | grep -q .; then ctx_ok=1; fi
done
[ "$ctx_ok" -eq 0 ]; check stop-log-carries-session-cwd "every SubagentStop line carries session_id and cwd" $?

run_hook board-subagent-stop.sh \
    "$(jq -nc --arg c "$(printf '/tmp/x\n2026-01-01T00:00:00Z [SubagentStop] forged\r\033[2J')" \
        --arg s "$(printf 's-forge\nforged session')" \
        '{session_id:$s,cwd:$c,agent_id:"a-forge",agent_type:"coder-fleet:coder",stop_hook_active:false,
          agent_transcript_path:"/dev/null",last_assistant_message:"no"}')"
[ -s "$LOG" ] && ! grep -qvE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z \[SubagentStop session=' "$LOG" \
    && ! grep -q "$(printf '[\r\033]')" "$LOG"
check stop-log-tag-cannot-forge "control characters in session_id or cwd cannot start a log line" $?

section 'hooks.json: the matcher, the plugin-root placeholder, and nothing of the old board'

MATCHER=$(jq -r '.hooks.SubagentStop[0].matcher' "$HOOKS/hooks.json")
for agent in scout spec-writer spec-editor spec-editor-fable coder scripter reviewer ui-designer tech-writer tech-editor tech-editor-fable researcher fleet-steward refuter evaluator; do
    grep -q "[(|]$agent[|)]" <<<"$MATCHER"
    check "matcher-$agent" "the matcher names $agent" $?
done

# ${CLAUDE_PLUGIN_ROOT} is resolved after the command reaches a shell, and
# single quotes forbid that, so every hook would fail open on every call.
! jq -r '.hooks[][].hooks[].command' "$HOOKS/hooks.json" | grep -qF "'\${CLAUDE_PLUGIN_ROOT}"
check commands-not-single-quoted "no command single-quotes the plugin-root placeholder" $?
! jq -r '.hooks[][].hooks[].command' "$HOOKS/hooks.json" | grep -qvF '${CLAUDE_PLUGIN_ROOT}'
check commands-use-plugin-root "every command locates its script by the plugin root" $?

jq -r '.hooks[][].hooks[].command' "$HOOKS/hooks.json" | sed -E 's#^"\$\{CLAUDE_PLUGIN_ROOT\}/(.*)"$#\1#' > "$TMP/hook-paths"
missing=0
while IFS= read -r p; do [ -x "$PLUGIN_ROOT/$p" ] || missing=1; done < "$TMP/hook-paths"
[ "$missing" -eq 0 ] && [ -s "$TMP/hook-paths" ]; check commands-name-real-scripts "every registered command is an executable script in the plugin" $?

[ ! -e "$PLUGIN_ROOT/.mcp.json" ] && [ ! -e "$PLUGIN_ROOT/board" ] && [ ! -e "$HOOKS/board-binary.sh" ] \
  && ! grep -rqE --include='*.sh' 'BOARD_SHIM|board/board\.sh|\.boards/' "$HOOKS" "$PLUGIN_ROOT/scripts"
check no-board-binary "the plugin ships no board binary or MCP server, and no hook reaches for one" $?

jq -e '(.hooks.SessionStart | length) == 1 and ([.hooks.SessionStart[0].hooks[]?.command] | any(test("board-focus-clear\\.sh")))' \
    "$HOOKS/hooks.json" >/dev/null 2>&1
check focus-clear-registered "hooks.json registers board-focus-clear.sh in the one SessionStart entry" $?
jq -e '[.hooks.PostToolUse[]? | select(.matcher == "Agent") | .hooks[]? | select(.command | test("board-agent-return\\.sh"))] | length == 1' \
    "$HOOKS/hooks.json" >/dev/null 2>&1
check return-registered "hooks.json registers board-agent-return.sh on PostToolUse with matcher Agent" $?

section 'The library: refs, columns and comments'

# The library is sourced in a subshell, with the board on and fake-gh behind it.
lib() {
    ( BOARD_LOG_FILE="$LOG" CODER_FLEET_BOARD=on BOARD_CWD="$REPO"
      # shellcheck source=/dev/null
      . "$HOOKS/lib/board.sh"
      "$@" )
}
: > "$LOG"
refs_ok=0
for pair in '#12=#12' '12=#12' ' #12 =#12' 'https://github.com/o/r/issues/12=#12' 'http://github.com/o/r/issues/12/=#12' \
            'https://github.com/o/r/issues/12?x=1=#12' '#0=' '012=' 'BD-12=' '#12a=' 'https://github.com/o/r/pull/12=' '=' '12 13='; do
    in="${pair%=*}"; want="${pair##*=}"
    got="$(lib normalise_page_id "$in" 2>/dev/null)" || got=""
    if [ "$got" != "$want" ]; then refs_ok=1; printf '        normalise_page_id "%s" gave "%s", wanted "%s"\n' "$in" "$got" "$want"; fi
done
[ "$refs_ok" -eq 0 ]; check refs-normalise "#N, N and the issue URL normalise to #N, and nothing else is a ref" $?

: > "$LOG"
lib board_comment_raw probe '#1' '   ' >/dev/null 2>&1; RC=$?
[ "$RC" -ne 0 ] && log_has "nothing posted"; check comment-raw-refuses-empty "board_comment_raw refuses a whitespace-only comment" $?

# Which column an issue is in: closed is Done whatever its labels, the label
# nearest the human wins, and labels match in any case.
status_ok=0
for row in 'OPEN|[]|To Do' 'OPEN|["status:next"]|Next' 'OPEN|["Status:In-Progress"]|In Progress' \
           'OPEN|["status:next","status:blocked-by-human","status:blocked"]|Blocked by human' \
           'OPEN|["status:next","status:blocked"]|Blocked' 'CLOSED|["status:in-progress"]|Done' 'OPEN|["bug"]|To Do'; do
    st="${row%%|*}"; rest="${row#*|}"; lb="${rest%|*}"; want="${rest##*|}"
    gh_reset; seed 1 "$st" "$lb"
    got="$(lib eval 'board_item_read probe "#1" && printf "%s" "$BOARD_ITEM_STATUS"' 2>/dev/null)"
    if [ "$got" != "$want" ]; then status_ok=1; printf '        %s %s read as "%s", wanted "%s"\n' "$st" "$lb" "$got" "$want"; fi
done
[ "$status_ok" -eq 0 ]; check column-from-state-and-labels "closed is Done, the label nearest the human wins, and case does not matter" $?

gh_reset; seed 1 OPEN '["status:next","bug"]'
: > "$LOG"
lib board_set_status probe '#1' 'To Do' 2>/dev/null
[ "$(labels 1)" = "bug" ]; check set-status-to-do-strips-labels "a move to To Do removes every status label and keeps the rest" $?

gh_reset; seed 1 OPEN '["status:in-progress"]'
: > "$LOG"
lib board_set_status probe '#1' 'Done' 2>/dev/null; RC=$?
[ "$RC" -ne 0 ] && no_writes && [ "$(issue_q 1 .state)" = OPEN ] && log_has "is not a column a hook writes"
check set-status-never-closes "a move to Done is refused: a merge closes an issue, never a hook" $?

# The record is write-once in the library itself, and no session-level pointer
# is written: nothing reads one.
BIND_STATE="$TMP/bind-state"
BIND_RCS="$(
    CODER_FLEET_STATE_DIR="$BIND_STATE" BOARD_LOG_FILE=/dev/null
    # shellcheck source=/dev/null
    . "$HOOKS/lib/board.sh"
    r1=0; state_bind_agent s x '#1' t || r1=$?
    r2=0; state_bind_agent s x '#2' t || r2=$?
    printf '%s %s\n' "$r1" "$r2"
)"
[ "$BIND_RCS" = "0 3" ] && [ "$(sed -n 's/^page_id=//p' "$BIND_STATE/sessions/s/agents/x")" = "#1" ] \
  && [ ! -e "$BIND_STATE/sessions/s/last-item" ]
check bind-is-write-once "a second state_bind_agent for one agent returns 3 and keeps the record" $?

RUN_STATE="$TMP/run-state"
RUN_RCS="$(
    CODER_FLEET_STATE_DIR="$RUN_STATE" BOARD_LOG_FILE=/dev/null
    # shellcheck source=/dev/null
    . "$HOOKS/lib/board.sh"
    r1=0; state_record_run s wf_X '#1' wz1 || r1=$?
    r2=0; state_record_run s wf_X '#2' wa2 || r2=$?
    printf '%s %s\n' "$r1" "$r2"
)"
[ "$RUN_RCS" = "0 3" ] \
  && [ "$(sed -n 's/^page_id=//p' "$RUN_STATE/sessions/s/runs/wf_X")" = "#1" ] \
  && [ -z "$(ls -A "$RUN_STATE/sessions/s/runs" | grep -v '^wf_X$')" ]
check run-record-is-write-once "a second state_record_run for one run returns 3, keeps the record, and leaves no temp file" $?

section 'SubagentStart: the issue goes In Progress, and only In Progress'

gh_reset; seed 1; focus '#1'; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip1)"
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:in-progress" ] && [ "$(ncomments 1)" -eq 0 ] \
  && [ "$(calls '. == ["issue","edit","1","--add-label","status:in-progress"]')" -eq 1 ] && [ "$(edits 1)" -eq 1 ] \
  && log_has "picked up #1 (from the focus file)" && log_has "#1 -> In Progress" && [ "$(record_page s-ip a-ip1)" = "#1" ]
check start-labels-in-progress "a focused start adds status:in-progress in one edit, binds the issue, and comments nothing" $?

gh_reset; seed 1 OPEN '["status:next","priority:high"]'; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip2)"
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "priority:high,status:in-progress" ] && [ "$(edits 1)" -eq 1 ] \
  && [ "$(calls '. == ["issue","edit","1","--add-label","status:in-progress","--remove-label","status:next"]')" -eq 1 ]
check start-from-next "an issue in Next moves to In Progress in one edit that removes status:next and keeps other labels" $?

gh_reset; seed 1 OPEN '["status:next","status:blocked","status:blocked-by-human","bug"]'; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip3)"
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "bug,status:in-progress" ] && [ "$(edits 1)" -eq 1 ]
check start-replaces-every-status-label "every other status label goes in the same edit, so the issue carries one" $?

gh_reset; seed 1 OPEN '["status:in-progress"]'; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip4)"
[ "$RC" -eq 0 ] && no_writes && log_has "#1 is already in In Progress"
check start-already-in-progress "an issue already In Progress gets no edit" $?

# A repository nobody ran /init on lacks the label. The edit fails as gh does,
# the label is created once with --force, and the edit is retried.
gh_reset '["status:next"]'; seed 1 OPEN '["status:next"]'; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip5)"
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:in-progress" ] && [ "$(write_order)" = "labels label-create labels" ] \
  && [ "$(calls '.[0] == "label" and .[1] == "create" and .[2] == "status:in-progress" and (index("--force") != null)')" -eq 1 ] \
  && jq -e 'index("status:in-progress") != null' "$FAKE_GH_DIR/labels.json" >/dev/null && log_has "created the status:in-progress label"
check start-creates-missing-label "a missing status label is created with --force and the edit retried" $?

gh_reset '[]'; seed 1; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip6)" FAKE_GH_FAIL='label create'
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "" ] && log_has "could not move #1 to In Progress"
check start-label-create-fails "a label that cannot be created moves nothing, logs why and exits 0" $?

gh_reset; seed 1; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip7)" FAKE_GH_FAIL='--add-label'
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "" ] && [ "$(calls '.[0] == "label"')" -eq 0 ] && log_has "could not move #1 to In Progress"
check start-edit-fails-no-label-create "an edit that fails for another reason creates no label and exits 0" $?

gh_reset; focus '#99'; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip8)"
[ "$RC" -eq 0 ] && no_writes && log_has "could not read #99" && log_has "Could not resolve" && [ "$(record_page s-ip a-ip8)" = "#99" ]
check start-unknown-issue "a focus on an issue gh cannot find binds it, moves nothing, logs gh's reason and exits 0" $?

gh_reset; seed 1; focus '#1'; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip9)" BOARD_GH=gh-not-installed-here
[ "$RC" -eq 0 ] && no_gh_calls && log_has "gh is not installed" && [ "$(record_page s-ip a-ip9)" = "#1" ]
check start-gh-missing "with gh missing the start logs it, still binds, moves nothing and exits 0" $?

gh_reset; seed 1; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip10)" FAKE_GH_FAIL=issue
[ "$RC" -eq 0 ] && no_writes && log_has "gh issue view failed (exit 1)" && log_has "forced failure"
check start-gh-failing "a gh that fails is logged with its own stderr, and the start exits 0" $?

gh_reset; seed 1; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip11)" BOARD_DRY_RUN=1
[ "$RC" -eq 0 ] && no_gh_calls && log_has "dry run" && ! log_has "would move #1"
check start-dry-run "a dry run calls no gh and claims no move" $?

run_gh board-subagent-start.sh "$(start_ev s-ip a-ip12)" CODER_FLEET_BOARD=off
[ "$RC" -eq 0 ] && no_gh_calls; check start-board-off "with the board off nothing calls gh" $?

: > "$CODER_FLEET_STATE_DIR/disabled"
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip13)"
rm -f "$CODER_FLEET_STATE_DIR/disabled"
[ "$RC" -eq 0 ] && no_gh_calls; check start-disabled-file "a disabled file in the state directory turns the board off" $?

mkdir -p "$TMP/not-a-repo"; state_reset s-ip
run_gh board-subagent-start.sh "$(start_ev s-ip a-ip14 coder-fleet:coder "$TMP/not-a-repo")"
[ "$RC" -eq 0 ] && no_gh_calls && log_has "no git repository" && [ ! -e "$CODER_FLEET_STATE_DIR/sessions/s-ip/agents/a-ip14" ]
check start-no-repository "outside a git repository there is no focus to read, nothing is recorded, and the start exits 0" $?
unfocus

section 'SubagentStart: a resume keeps the issue it started on'

# R17. A resume with SendMessage re-fires SubagentStart for the same agent id.
# It keeps the record its first start wrote, and reads the focus only to log it.
r17() { gh_reset; seed 1; seed 2; state_reset s-r; }

r17; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
focus '#2'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
[ "$(labels 1)" = "status:in-progress" ] && [ "$(touches 2)" -eq 0 ] && log_has "keeping #1" && log_has "focus is now #2"
check resume-keeps-first-binding "a resume after a refocus keeps the issue it started on, never the focus, and logs both" $?

run_gh board-subagent-start.sh "$(start_ev s-r a-r2)"
[ "$(labels 2)" = "status:in-progress" ]; check first-start-other-agent-reads-focus "a new agent in the same session is bound by the focus" $?

gh_calls_reset
run_gh board-subagent-stop.sh "$(stop_ev s-r a-r "$(handoff_blockers 'which key?')")"
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:blocked-by-human" ] && [ "$(ncomments 1)" -eq 1 ] && [ "$(touches 2)" -eq 0 ]
check resume-blocker-comments-first "a Blocker after a refocused resume moves and comments on the first issue only" $?

r17; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
log_has "keeping #1" && ! log_has "focus is now"; check resume-same-focus-no-mismatch "a resume with the focus unchanged logs no mismatch" $?

r17; unfocus
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
focus '#2'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
no_writes && log_has "started with no item"; check resume-unbound-stays-unbound "an agent that started with no issue stays unbound on a resume, whatever the focus" $?

r17; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
set_issue 1 '.state = "CLOSED"'; gh_calls_reset
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
no_writes && log_has "which is Done"; check resume-done-left "a resume on a closed issue leaves it closed and says so" $?

# A Blocker, then the human answers every action, then a resume: the issue
# goes back to In Progress. With an action still open, it stays.
r17; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
run_gh board-subagent-stop.sh "$(stop_ev s-r a-r "$(handoff_blockers 'which key?' '7 days or 30?')")"
set_issue 1 '.body |= sub("- \\[ \\] 1\\."; "- [x] 1.")'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
held_one="$(labels 1)"
log_has "waiting on the human: 1 open action(s) on #1"; held_log=$?
set_issue 1 '.body |= sub("- \\[ \\] 2\\."; "- [x] 2.")'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
[ "$held_one" = "status:blocked-by-human" ] && [ "$held_log" -eq 0 ] && [ "$(labels 1)" = "status:in-progress" ]
check resume-moves-blocked-human "a resume holds a Blocked by human issue while an action is open, and moves it once all are ticked" $?

# No agent_id: nothing to key a record by, so none is written.
r17; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-r '' | jq -c 'del(.agent_id)')"
NOID_LOG1="$(cat "$LOG")"
focus '#2'
run_gh board-subagent-start.sh "$(start_ev s-r '' | jq -c 'del(.agent_id)')"
[ ! -e "$CODER_FLEET_STATE_DIR/sessions/s-r/agents/unknown-agent" ] \
  && ! grep -qF "binding stands" <<<"$NOID_LOG1" && ! log_has "binding stands" && [ "$(labels 2)" = "status:in-progress" ]
check start-no-agent-id-records-nothing "starts with no agent_id write no shared record and claim no binding" $?

# A focus read that failed is not "nothing focused": no record, so the next
# start binds from the focus.
r17; focus '#2'
run_gh board-subagent-start.sh "$(start_ev s-r a-r coder-fleet:coder "$TMP/not-a-repo")"
FAIL_LOG="$(cat "$LOG")"
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
[ "$RC" -eq 0 ] && grep -qF "could not read the focus" <<<"$FAIL_LOG" && [ "$(labels 2)" = "status:in-progress" ]
check start-focus-failed-no-record "a failed focus read records nothing, and the next start binds from the focus" $?

r17; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-r a-r)"
gh_calls_reset
run_gh board-subagent-start.sh "$(start_ev s-r a-r)" BOARD_DRY_RUN=1
no_gh_calls && log_has "Done check was skipped" && log_has "hold check" && ! log_has "would move #1"
check resume-dry-run-skips-checks "a dry-run resume reads nothing, says the Done and hold checks were skipped, and claims no move" $?
unfocus

section 'SubagentStart: a cleared focus binds nothing, and Done stays Done'

cf_reset() { gh_reset; seed 1; seed 2; state_reset s-c; }

cf_reset; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-c a-c1)"
unfocus; gh_calls_reset
run_gh board-subagent-start.sh "$(start_ev s-c a-c2 coder-fleet:scout)"
[ "$RC" -eq 0 ] && no_gh_calls && log_has "nothing is focused" && ! log_has "picked up" \
  && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-c/agents/a-c2" ] && [ -z "$(record_page s-c a-c2)" ]
check start-cleared-focus-binds-nothing "after #1 was bound, a start with the focus cleared binds nothing and calls no gh" $?

run_gh board-subagent-stop.sh "$(stop_ev s-c a-c2 "$H_CLEAN" coder-fleet:scout)"
[ "$RC" -eq 0 ] && no_gh_calls; check stop-cleared-focus-comments-nowhere "the unfocused agent's stop comments on no issue" $?
grep -F "a-c2" "$LOG" | grep -qF "bound to no item"
check stop-log-names-agent-unbound "an unbound stop's log line names the agent id and says it bound no issue" $?

run_gh board-subagent-stop.sh "$(stop_ev s-c a-c1 "$H_CLEAN")"
[ "$(ncomments 1)" -eq 1 ] && grep -F "a-c1" "$LOG" | grep -qF "on #1"
check stop-log-names-agent-and-item "a bound stop's log line names the agent id and the issue it comments on" $?

run_gh board-subagent-stop.sh "$(stop_ev s-c a-c1 "$(handoff_blockers 'which key?')")"
grep -F "blocker(s) from" "$LOG" | grep -F "a-c1" | grep -qF "on #1"
check stop-log-blocker-names-agent-and-item "the Blocker line names the agent id and the issue" $?

run_gh board-subagent-stop.sh "$(stop_ev s-c a-c1 'Prose, not a handoff.')"
[ "$RC" -eq 2 ] && grep -F "malformed" "$LOG" | grep -F "a-c1" | grep -qF "on #1"
check stop-log-malformed-names-agent-and-item "the malformed-handoff line names the agent id and the issue" $?

mk_transcript "$TMP/t-cf-structured.jsonl" structured
run_gh board-subagent-stop.sh "$(stop_ev s-c a-c2 '' coder-fleet:scout "$TMP/t-cf-structured.jsonl" | jq -c 'del(.last_assistant_message)')"
grep -F "StructuredOutput" "$LOG" | grep -F "a-c2" | grep -qF "bound to no item"
check stop-log-structured-names-agent-unbound "the StructuredOutput line names the agent id and says it bound no issue" $?

gh_calls_reset
run_gh board-subagent-stop.sh "$(stop_ev s-c a-c2 "$(handoff_blockers 'which key?')" coder-fleet:scout)"
no_gh_calls && grep -F "blocker(s) from" "$LOG" | grep -F "a-c2" | grep -qF "bound to no item" \
  && ! grep -F "blocker(s) from" "$LOG" | grep -qF "moving to"
check stop-log-unbound-blocker-claims-no-move "an unbound Blocker calls no gh, names the agent, says it bound no issue, and claims no move" $?

cf_reset; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-c a-c6)"
unfocus
run_gh board-subagent-start.sh "$(start_ev s-c a-c7 coder-fleet:scout)"
focus '#2'; gh_calls_reset
run_gh board-subagent-stop.sh "$(stop_ev s-c a-c7 "$H_CLEAN" coder-fleet:scout)"
[ "$RC" -eq 0 ] && no_gh_calls; check stop-unbound-ignores-later-focus "an agent started unfocused comments on neither issue after #2 is focused" $?

# A first start never moves a closed issue, whatever binds it.
cf_reset; unfocus; set_issue 1 '.state = "CLOSED"'
run_gh board-subagent-start.sh "$(start_ev s-c a-c4 coder-fleet:scout)" CODER_FLEET_BOARD_PAGE_ID='#1'
[ "$RC" -eq 0 ] && no_writes && log_has "#1, which is Done" && [ "$(record_page s-c a-c4)" = "#1" ]
check start-done-env-stays-done "a start bound by CODER_FLEET_BOARD_PAGE_ID to a closed issue binds it and leaves it closed" $?

cf_reset; set_issue 1 '.state = "CLOSED"'
run_gh board-subagent-start.sh \
    "$(jq -nc --arg c "$REPO" '{session_id:"s-c",agent_id:"a-c8",agent_type:"coder-fleet:coder",cwd:$c,instructions:"Build it.\nIssue: #1\n"}')"
[ "$RC" -eq 0 ] && no_writes && log_has "Issue: line" && log_has "#1, which is Done" && [ "$(record_page s-c a-c8)" = "#1" ]
check start-done-issue-line-stays-done "a start bound by an Issue: line to a closed issue binds it and leaves it closed" $?

cf_reset; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-c a-c5 coder-fleet:scout)" BOARD_DRY_RUN=1
no_gh_calls && log_has "Done check was skipped" && ! log_has "would move #1"
check start-dry-run-skips-done-check "a dry-run first start reads nothing and says the Done check was skipped" $?
unfocus

section 'SubagentStart: a focus on a closed issue is stale, and binds nothing'

# A focus left on an issue that has since closed is almost always stale, so a
# first start bound from the focus to a closed issue records the agent
# unbound; its stop then comments nowhere. An Issue: line or the launch
# variable is deliberate and still binds.
sf_reset() { gh_reset; seed 1 CLOSED; seed 2; state_reset s-s; }
CF70_BLOCKER="$(handoff_blockers 'which key?')"

sf_reset; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-s a-s1 coder-fleet:scout)"
[ "$RC" -eq 0 ] && no_writes && log_has "the focus names #1, which is Done" && ! log_has "picked up #1" \
  && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-s/agents/a-s1" ] && [ -z "$(record_page s-s a-s1)" ]
check stale-focus-start-binds-nothing "a start focused on a closed issue moves nothing, binds nothing and logs the stale focus" $?

gh_calls_reset
run_gh board-subagent-stop.sh "$(stop_ev s-s a-s1 "$H_CLEAN" coder-fleet:scout)"
[ "$RC" -eq 0 ] && no_gh_calls && grep -F "a-s1" "$LOG" | grep -qF "stale focus on #1"
check stale-focus-stop-comments-nowhere "its stop posts nothing on the closed issue and its log names the stale focus" $?

run_gh board-subagent-stop.sh "$(stop_ev s-s a-s1 "$CF70_BLOCKER" coder-fleet:scout)"
[ "$RC" -eq 0 ] && no_gh_calls && [ "$(issue_q 1 .state)" = CLOSED ] && [ "$(labels 1)" = "" ]
check stale-focus-stop-blocker-moves-nothing "a Blocker from that agent neither comments on nor labels the closed issue" $?

run_gh board-subagent-stop.sh "$(stop_ev s-s a-s1 "$H_CLEAN" coder-fleet:scout)" CODER_FLEET_BOARD_PAGE_ID='#1'
[ "$RC" -eq 0 ] && no_gh_calls; check stale-focus-stop-ignores-launch-variable "an unbound record keeps the stop off CODER_FLEET_BOARD_PAGE_ID too" $?

set_issue 1 '.state = "OPEN"'
run_gh board-subagent-start.sh "$(start_ev s-s a-s1 coder-fleet:scout)"
[ "$RC" -eq 0 ] && no_writes && [ -z "$(record_page s-s a-s1)" ]
check stale-focus-resume-stays-unbound "a resume of an agent that refused a stale focus stays unbound, the issue reopened or not" $?

sf_reset; focus '#2'
run_gh board-subagent-start.sh \
    "$(jq -nc --arg c "$REPO" '{session_id:"s-s",agent_id:"a-s2",agent_type:"coder-fleet:coder",cwd:$c,instructions:"Build it.\nIssue: #1\n"}')"
[ "$RC" -eq 0 ] && no_writes && [ "$(record_page s-s a-s2)" = "#1" ] && ! log_has "the focus names"
check stale-focus-issue-line-still-binds "an Issue: line naming a closed issue still binds it and leaves it closed" $?

sf_reset; focus '#2'
run_gh board-subagent-start.sh "$(start_ev s-s a-s3)"
[ "$RC" -eq 0 ] && [ "$(labels 2)" = "status:in-progress" ] && [ "$(record_page s-s a-s3)" = "#2" ] && log_has "picked up #2 (from the focus file)"
check stale-focus-open-focus-unchanged "a focus on an open issue binds and moves it, as before" $?

sf_reset; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-s a-s4)" FAKE_GH_FAIL='issue view'
[ "$RC" -eq 0 ] && no_writes && [ "$(record_page s-s a-s4)" = "#1" ] && log_has "could not read #1"
check stale-focus-unread-card-binds "a focused issue that cannot be read binds as before and moves nothing" $?
unfocus

section 'SubagentStart: an open action for the human holds the issue'

# R20. While any action under Actions for human is unticked, an issue in
# Blocked by human stays there, on a first start and a resume, read from one
# gh issue view.
BODY_OPEN2='## Actions for human
- [ ] 1. which key?
- [ ] 2. [not a question] Pick one

Words.
'
BODY_ONE_OPEN='## Actions for human
- [x] 1. which key?
* [ ] 2. 7 days or 30?

Words.
'
BODY_TICKED2='## ACTIONS FOR HUMAN
- [x] 1. which key?
* [X] 2. 7 days or 30?

## Notes
- [ ] not an action, under another heading
'
hold() {
    # $1 labels JSON, $2 body
    gh_reset; seed 1 OPEN "$1" "$2"; state_reset s-h; focus '#1'
    run_gh board-subagent-start.sh "$(start_ev s-h a-h)"
}
hold '["status:blocked-by-human"]' "$BODY_OPEN2"
[ "$RC" -eq 0 ] && no_writes && [ "$(calls '.[1] == "view"')" -eq 1 ] && log_has "waiting on the human: 2 open action(s) on #1"
check start-holds-open-actions "a first start leaves a Blocked by human issue with open actions where it is, from one view" $?

hold '["status:blocked-by-human"]' "$BODY_ONE_OPEN"
no_writes && log_has "waiting on the human: 1 open action(s) on #1"
check start-holds-one-open "one open action beside a ticked one, in either list marker, still holds the issue" $?

hold '["status:blocked-by-human"]' "$BODY_TICKED2"
[ "$(labels 1)" = "status:in-progress" ] && ! log_has "waiting on the human"
check start-moves-all-ticked "with every action ticked, in any case of heading, the start moves it; a box under another heading is no action" $?

hold '["status:blocked-by-human"]' "Words only."
[ "$(labels 1)" = "status:in-progress" ] && ! log_has "waiting on the human"
check start-moves-no-section "with no section the start moves the issue to In Progress" $?

hold '[]' "$BODY_OPEN2"
[ "$(labels 1)" = "status:in-progress" ] && ! log_has "waiting on the human"
check start-open-actions-outside-queue-moves "open actions on an issue outside Blocked by human hold nothing" $?

hold '["status:blocked-by-human"]' "$BODY_OPEN2"
focus '#2'; gh_calls_reset
run_gh board-subagent-start.sh "$(start_ev s-h a-h)"
[ "$RC" -eq 0 ] && no_writes && [ "$(calls '.[1] == "view"')" -eq 1 ] && log_has "keeping #1" && log_has "waiting on the human: 2 open action(s) on #1"
check resume-holds-open-actions "a resume holds the issue it started on while an action is open, from one view" $?

gh_reset; seed 1 OPEN '["status:blocked-by-human"]' "$BODY_OPEN2"; state_reset s-h; focus '#1'
run_gh board-subagent-start.sh "$(start_ev s-h a-h)" FAKE_GH_FAIL='issue view'
[ "$RC" -eq 0 ] && no_writes && log_has "could not read #1"
check start-read-fails-moves-nothing "a start whose issue read fails moves nothing, so a timeout never takes an issue out of the queue" $?

run_gh board-subagent-start.sh "$(start_ev s-h a-h)" FAKE_GH_FAIL='issue view'
[ "$RC" -eq 0 ] && no_writes && log_has "could not read #1"
check resume-read-fails-moves-nothing "a resume whose issue read fails moves nothing either" $?
unfocus

section 'SubagentStop: Blocker lines move the issue and ask the human'

# Each Blocker: line becomes a numbered action at the top of the body, after
# the label move and before the Blocker comment, flagged when it is not a
# question.
bh() { gh_reset; seed 1 OPEN '["status:in-progress"]' "${1:-$BODY_TICKED}"; state_reset s-b; }
run_blocker() { run_gh board-subagent-stop.sh "$(stop_ev s-b a-b "$(handoff_blockers "$@")")" CODER_FLEET_BOARD_PAGE_ID='#1'; }

bh; run_blocker 'which key?' 'Pick the key'
want_body="$(printf '## Actions for human\n- [ ] 1. which key?\n- [ ] 2. [not a question] Pick the key\n\n%s' "$BODY_TICKED")"
want_comment="$(printf 'Blocked by human. coder-fleet:coder raised 2 blocker(s). From "## Decisions needed" in its handoff:\n\n- which key?\n- Pick the key')"
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:blocked-by-human" ] && [ "$(write_order)" = "labels body comment" ] \
  && [ "$(body 1)" = "$want_body" ] && [ "$(ncomments 1)" -eq 1 ] && [ "$(last_comment 1)" = "$want_comment" ]
check stop-blocker-moves-and-asks "the labels move, then one body edit makes the section at the top, then the Blocker comment" $?

bh "$BODY_ONE_OPEN"; run_blocker 'Which colour?'
want_body='## Actions for human
- [x] 1. which key?
* [ ] 2. 7 days or 30?
- [ ] 3. Which colour?

Words.
'
[ "$(body 1)" = "$(printf '%s' "$want_body")" ]; check stop-blocker-appends "a second Blocker appends after the last action, numbered after the rest, with the ticks kept" $?

bh "$(printf 'Intro\n\n## Actions for human\n\nText\n\n## Acceptance criteria\n- [x] a\n')"; run_blocker 'which key?'
[ "$(body 1)" = "$(printf 'Intro\n\n## Actions for human\n- [ ] 1. which key?\n\nText\n\n## Acceptance criteria\n- [x] a\n')" ]
check stop-blocker-empty-section "an empty section anywhere in the body gets its first action straight under the heading" $?

bh; run_blocker '-v or -q?'
[ "$(body 1 | sed -n 2p)" = "- [ ] 1. -v or -q?" ] && [ "$(labels 1)" = "status:blocked-by-human" ]
check stop-blocker-leading-dash "an ask starting with a dash reaches the body whole" $?

bh; run_gh board-subagent-stop.sh "$(stop_ev s-b a-b "$(handoff_blockers 'which key?')")" CODER_FLEET_BOARD_PAGE_ID='#1' FAKE_GH_FAIL=board-body
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:blocked-by-human" ] && [ "$(body 1)" = "$(printf '%s' "$BODY_TICKED")" ] && [ "$(ncomments 1)" -eq 1 ] \
  && last_comment 1 | grep -qF 'which key?' && log_has "did not reach #1"
check stop-actions-fail-comment-still-posts "a body edit that fails still leaves the move and the comment, and is logged" $?

bh; run_gh board-subagent-stop.sh "$(stop_ev s-b a-b "$(handoff_blockers 'which key?')")" CODER_FLEET_BOARD_PAGE_ID='#1' FAKE_GH_FAIL=--add-label
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:in-progress" ] && body 1 | grep -qxF -- '- [ ] 1. which key?' && [ "$(ncomments 1)" -eq 1 ] \
  && log_has "could not move #1 to Blocked by human"
check stop-move-fails-still-asks "a move that fails still adds the action and posts the comment, so the human finds the question" $?

bh; run_gh board-subagent-stop.sh "$(stop_ev s-b a-b "$H_CLEAN")" CODER_FLEET_BOARD_PAGE_ID='#1'
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:in-progress" ] && [ "$(edits 1)" -eq 0 ] && [ "$(ncomments 1)" -eq 1 ] \
  && [ "$(last_comment 1)" = "$(printf 'Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:\n\n- Shipped it')" ]
check stop-clean-comments-only "a clean handoff posts its Done items as one comment and edits nothing" $?

bh; run_gh board-subagent-stop.sh "$(stop_ev s-b a-b "$(printf '## Done\n- None\n\n## Not done\n- All of it\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n')")" CODER_FLEET_BOARD_PAGE_ID='#1'
[ "$RC" -eq 0 ] && no_writes; check stop-empty-done-no-comment "a Done of nothing but None earns no comment" $?

gh_reset; state_reset s-b
run_gh board-subagent-stop.sh "$(stop_ev s-b a-b "$(handoff_blockers 'which key?')")" CODER_FLEET_BOARD_PAGE_ID='#99'
[ "$RC" -eq 0 ] && no_writes && log_has "issue #99 not found; nothing moved"
check stop-unknown-issue "a Blocker on an issue gh cannot find writes nothing and exits 0" $?

bh; run_gh board-subagent-stop.sh "$(stop_ev s-b a-b "$(handoff_blockers 'which key?')")" CODER_FLEET_BOARD_PAGE_ID='#1' BOARD_GH=gh-not-installed-here
[ "$RC" -eq 0 ] && no_gh_calls && log_has "gh is not installed"
check stop-gh-missing "with gh missing a valid handoff exits 0 and logs why nothing moved" $?

bh; run_gh board-subagent-stop.sh "$(stop_ev s-b a-b 'Prose.')" CODER_FLEET_BOARD_PAGE_ID='#1' FAKE_GH_FAIL=issue
[ "$RC" -eq 2 ]; check stop-gh-failing-still-gates "a failing gh never softens the handoff gate" $?
bh; run_gh board-subagent-stop.sh "$(stop_ev s-b a-b "$(handoff_blockers 'which key?')")" CODER_FLEET_BOARD_PAGE_ID='#1' FAKE_GH_FAIL=issue
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:in-progress" ] && log_has "failed (exit 1)"
check stop-gh-failing-exits-0 "and never decides the exit of a valid one" $?

section 'SubagentStop: an agent let go at the re-emit cap says so on its issue'

gh_reset; seed 1 OPEN '["status:in-progress"]'; state_reset s-capc
CAPC_BAD="$(stop_ev s-capc a-capc "$(printf '## Done\n- Half of it\n- Blocker: which key should it use?\n')" | jq -c '.stop_hook_active = true')"
capc_rcs=""
for i in 1 2 3 4; do
    run_gh board-subagent-stop.sh "$CAPC_BAD" CODER_FLEET_BOARD_PAGE_ID='#1'
    capc_rcs="$capc_rcs$RC"
done
[ "$capc_rcs" = "2220" ] && [ "$(ncomments 1)" -eq 1 ] && [ "$(edits 1)" -eq 0 ] \
  && last_comment 1 | grep -qF 'still malformed' && last_comment 1 | grep -qF 'coder-fleet:coder' \
  && last_comment 1 | grep -qF 'which key should it use?'
check stop-cap-comments-on-card "the cap comments on the bound issue with the type and the Blocker lines, and moves nothing" $?
run_gh board-subagent-stop.sh "$CAPC_BAD" CODER_FLEET_BOARD_PAGE_ID='#1'
[ "$RC" -eq 2 ]; check stop-cap-clears-count "a stop let go at the cap clears its count, so a resume starts fresh" $?

section 'SubagentStop: a long comment is cut, and the whole of it archived'

LONG_DONE="$(printf -- '- Did step %s of the long run, carefully and with evidence\n' $(seq 1 40))"
LONG_HANDOFF="$(printf '## Done\n%s\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n' "$LONG_DONE")"
gh_reset; seed 1; state_reset s-long; rm -rf "$CODER_FLEET_STATE_DIR/archives/s-long"
run_gh board-subagent-stop.sh "$(stop_ev s-long a-long "$LONG_HANDOFF")" CODER_FLEET_BOARD_PAGE_ID='#1' BOARD_COMMENT_MAX_CHARS=300
archive="$(ls "$CODER_FLEET_STATE_DIR/archives/s-long"/*.md 2>/dev/null | head -1)"
cut="$(last_comment 1)"
[ "$RC" -eq 0 ] && [ -n "$archive" ] && [ "$(ncomments 1)" -eq 1 ] \
  && [ "$(printf '%s' "${cut%%"[Cut to fit"*}" | wc -m | tr -d ' ')" -le 302 ] \
  && grep -qF "[Cut to fit an issue comment. The other" <<<"$cut" && grep -qF "$archive]" <<<"$cut" \
  && grep -qF -- '- Did step 40 of the long run' "$archive" && grep -qF -- '- Issue: #1' "$archive" \
  && grep -qF -- '- Agent: coder-fleet:coder (a-long)' "$archive" && grep -qF -- '- Session: s-long' "$archive"
check comment-cap-archives "a comment over the cap is cut, names its archive, and the archive holds the whole text and the run" $?

if perms_bind; then
    [ "$(ls -ld "$CODER_FLEET_STATE_DIR/archives/s-long" | cut -c1-10)" = "drwx------" ] && [ "$(ls -l "$archive" | cut -c1-10)" = "-rw-------" ]
    check comment-archive-private "the archive directory is 700 and the archive 600" $?
else
    skip_case comment-archive-private "chmod binds nothing here (running as root?), so modes say nothing"
fi

gh_reset; seed 1; state_reset s-long2; rm -rf "$CODER_FLEET_STATE_DIR/archives/s-long2"
run_gh board-subagent-stop.sh "$(stop_ev s-long2 a-long "$LONG_HANDOFF")" CODER_FLEET_BOARD_PAGE_ID='#1'
[ "$RC" -eq 0 ] && [ ! -e "$CODER_FLEET_STATE_DIR/archives/s-long2" ] && ! last_comment 1 | grep -qF "Cut to fit"
check comment-under-cap-whole "a comment under the default cap goes on whole and archives nothing" $?

gh_reset; seed 1; state_reset s-long3
run_gh board-subagent-stop.sh "$(stop_ev s-long3 a-long "$LONG_HANDOFF")" CODER_FLEET_BOARD_PAGE_ID='#1' BOARD_COMMENT_MAX_CHARS=lots
[ "$RC" -eq 0 ] && log_has "not a positive integer; using 8000" && [ "$(ncomments 1)" -eq 1 ]
check comment-cap-bad-value "a cap that is not a positive integer falls back to 8000 and says so" $?

gh_reset; seed 1; state_reset s-long4
run_gh board-subagent-stop.sh "$(stop_ev s-long4 a-long "$LONG_HANDOFF")" CODER_FLEET_BOARD_PAGE_ID='#1' BOARD_COMMENT_MAX_CHARS=99999999
[ "$RC" -eq 0 ] && log_has "above the hard ceiling; using 60000"
check comment-cap-ceiling "a cap above GitHub's limit is held to the hard ceiling" $?

# The cut counts characters, so a multi-byte character is never split: fake-gh
# reads the body as UTF-8 and a split character would fail the comment.
WIDE="$(printf 'é%.0s' $(seq 1 400))"
gh_reset; seed 1; state_reset s-wide
run_gh board-subagent-stop.sh "$(stop_ev s-wide a-wide "$(printf '## Done\n- %s\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n' "$WIDE")")" \
    CODER_FLEET_BOARD_PAGE_ID='#1' BOARD_COMMENT_MAX_CHARS=120
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 1 ] && last_comment 1 | grep -qF "Cut to fit"
check comment-cap-multibyte "a cut through multi-byte text still posts a valid comment" $?

gh_reset; seed 1; state_reset s-noarch
mv "$CODER_FLEET_STATE_DIR/archives" "$TMP/archives.kept" 2>/dev/null
: > "$CODER_FLEET_STATE_DIR/archives"
run_gh board-subagent-stop.sh "$(stop_ev s-noarch a-long "$LONG_HANDOFF")" CODER_FLEET_BOARD_PAGE_ID='#1' BOARD_COMMENT_MAX_CHARS=300
rm -f "$CODER_FLEET_STATE_DIR/archives"
mv "$TMP/archives.kept" "$CODER_FLEET_STATE_DIR/archives" 2>/dev/null
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 1 ] && last_comment 1 | grep -qF "could not be archived" && log_has "characters are lost"
check comment-cap-no-archive "with no archive possible the cut text still posts, and says the rest was lost" $?

section 'SubagentStop: a workflow run comments on the issue it was launched on'

# A workflow starts its lanes over minutes and each start binds from the focus
# as it is then, so a refocus mid-run would send a late lane's handoff to the
# newly focused issue. The stop records the run's issue once, from the start
# binding of the run's earliest-started agent, and every stop of that run
# comments there. Session s-w.
WF_RUNS="$TMP/wf/subagents/workflows"
WF_CLEAN="$H_CLEAN"
WF_BLOCKER="$(handoff_blockers 'which key?')"
wf_lane() { mkdir -p "$WF_RUNS/$1"; : > "$WF_RUNS/$1/agent-$2.jsonl"; }
wf_reset() { gh_reset; seed 1; seed 2; state_reset s-w; rm -rf "$TMP/wf"; }
wf_start() { focus "$3"; run_gh board-subagent-start.sh "$(start_ev s-w "$1" "$2")"; }
wf_stop() { run_gh board-subagent-stop.sh "$(stop_ev s-w "$1" "$4" "$2" "$3")" "${@:5}"; }
WF_RECORD="$CODER_FLEET_STATE_DIR/sessions/s-w/runs/wf_X"

wf_reset
wf_start wz1 coder-fleet:scout '#1'; wf_lane wf_X wz1
wf_start wa2 coder-fleet:refuter '#2'; wf_lane wf_X wa2
gh_calls_reset
wf_stop wa2 coder-fleet:refuter "$WF_RUNS/wf_X/agent-wa2.jsonl" "$WF_CLEAN"
WF_LOG_WA2="$(cat "$LOG")"
wf_stop wz1 coder-fleet:scout "$WF_RUNS/wf_X/agent-wz1.jsonl" "$WF_CLEAN"
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 2 ] && [ "$(ncomments 2)" -eq 0 ] && [ "$(touches 2)" -eq 0 ]
check wf-late-lane-comments-on-launch-item "both lanes of a run refocused mid-run comment on the launch issue, never the new focus" $?
printf '%s\n' "$WF_LOG_WA2" | grep -F "wa2" | grep -F "wf_X" | grep -qF "on #1"
check wf-typed-lane-log-names-run "a typed lane's stop line names its agent id, its run and the run's issue" $?

wf_reset
wf_start wz1 workflow-subagent '#1'; wf_lane wf_X wz1
wf_start wa2 coder-fleet:refuter '#2'; wf_lane wf_X wa2
wf_start wa3 coder-fleet:reviewer '#2'; wf_lane wf_X wa3
wf_stop wa2 coder-fleet:refuter "$WF_RUNS/wf_X/agent-wa2.jsonl" "$WF_CLEAN"
WF_REC1="$(cat "$WF_RECORD" 2>/dev/null)"
[ "$(sed -n 's/^page_id=//p' "$WF_RECORD" 2>/dev/null)" = "#1" ] && [ "$(sed -n 's/^agent_id=//p' "$WF_RECORD" 2>/dev/null)" = "wz1" ]
check wf-record-written-by-first-stop "the first stop of a run records the run's issue and the agent it came from" $?
rm -f "$WF_RUNS/wf_X/agent-wz1.jsonl" "$CODER_FLEET_STATE_DIR/sessions/s-w/agents/wz1"
gh_calls_reset
wf_stop wa3 coder-fleet:reviewer "$WF_RUNS/wf_X/agent-wa3.jsonl" "$WF_CLEAN"
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 2 ] && [ "$(touches 2)" -eq 0 ] && [ "$(cat "$WF_RECORD")" = "$WF_REC1" ] && log_has "from the run record"
check wf-record-read-by-later-stop "a later stop reads the record, unchanged, rather than recomputing" $?

wf_reset
wf_start wz1 workflow-subagent '#1'; wf_lane wf_X wz1
wf_start wa2 coder-fleet:refuter '#2'; wf_lane wf_X wa2
wf_stop wa2 coder-fleet:refuter "$WF_RUNS/wf_X/agent-wa2.jsonl" "$WF_BLOCKER"
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:blocked-by-human" ] && body 1 | grep -qxF -- '- [ ] 1. which key?' \
  && [ "$(ncomments 1)" -eq 1 ] && [ "$(labels 2)" = "status:in-progress" ] && [ "$(ncomments 2)" -eq 0 ]
check wf-late-lane-blocker-on-launch-item "a late lane's Blocker moves, asks and comments on the launch issue only" $?

wf_reset
unfocus; run_gh board-subagent-start.sh "$(start_ev s-w wz1 workflow-subagent)"; wf_lane wf_Y wz1
wf_start wa2 coder-fleet:refuter '#2'; wf_lane wf_Y wa2
gh_calls_reset
wf_stop wa2 coder-fleet:refuter "$WF_RUNS/wf_Y/agent-wa2.jsonl" "$WF_BLOCKER"
[ "$RC" -eq 0 ] && no_gh_calls && grep -F "wa2" "$LOG" | grep -F "wf_Y" | grep -qF "bound to no item"
check wf-unfocused-first-lane-comments-nowhere "a run whose first lane bound nothing comments and moves nowhere" $?

wf_reset
wf_start d1 coder-fleet:coder '#1'
wf_start d2 coder-fleet:scout '#2'
mkdir -p "$TMP/wf/subagents"; : > "$TMP/wf/subagents/agent-d1.jsonl"; : > "$TMP/wf/subagents/agent-d2.jsonl"
focus '#1'; gh_calls_reset
wf_stop d2 coder-fleet:scout "$TMP/wf/subagents/agent-d2.jsonl" "$WF_CLEAN"
[ "$RC" -eq 0 ] && [ "$(ncomments 2)" -eq 1 ] && [ "$(touches 1)" -eq 0 ] \
  && [ ! -e "$CODER_FLEET_STATE_DIR/sessions/s-w/runs" ] && ! log_has "run wf_"
check wf-direct-spawn-unchanged "a direct spawn's stop comments on its own binding and records no run" $?

# Two lanes stopping at once agree, and one record stands.
wf_reset
wf_start wz1 workflow-subagent '#1'; wf_lane wf_X wz1
wf_start wa2 coder-fleet:refuter '#2'; wf_lane wf_X wa2
wf_start wa3 coder-fleet:reviewer '#2'; wf_lane wf_X wa3
wf_race_stop() {
    stop_ev s-w "$1" "$WF_CLEAN" coder-fleet:refuter "$WF_RUNS/wf_X/agent-$1.jsonl" \
      | env -u CODER_FLEET_BOARD_PAGE_ID CODER_FLEET_BOARD=on BOARD_LOG_FILE="$TMP/log.race.$1" \
            "$HOOKS/board-subagent-stop.sh" >/dev/null 2>&1
}
wf_race_stop wa2 & RACE_PID2=$!
wf_race_stop wa3 & RACE_PID3=$!
RACE_RC2=0; wait "$RACE_PID2" || RACE_RC2=$?
RACE_RC3=0; wait "$RACE_PID3" || RACE_RC3=$?
[ "$RACE_RC2" -eq 0 ] && [ "$RACE_RC3" -eq 0 ] && [ "$(ncomments 1)" -eq 2 ] && [ "$(ncomments 2)" -eq 0 ] \
  && [ "$(ls -A "$CODER_FLEET_STATE_DIR/sessions/s-w/runs" | wc -l | tr -d ' ')" -eq 1 ] \
  && [ "$(sed -n 's/^page_id=//p' "$WF_RECORD")" = "#1" ]
check wf-concurrent-stops-agree "concurrent stops both exit 0, agree on the launch issue, and leave one record and no temp file" $?

# The race loser, without timing: a fake ln first on PATH writes the winner's
# record just before the real ln runs.
wf_reset
unfocus; focus '#1'; run_gh board-subagent-start.sh "$(start_ev s-w wz1 workflow-subagent)"
wf_start wa2 coder-fleet:refuter '#2'; wf_lane wf_X wa2
WF_BIN="$TMP/wf-bin"; mkdir -p "$WF_BIN"
cat > "$WF_BIN/ln" <<LN_EOF
#!/bin/sh
[ -e "\$WF_WINNER" ] || printf 'page_id=#1\nagent_id=wz1\nrecorded_at=winner\n' > "\$WF_WINNER"
exec $(command -v ln) "\$@"
LN_EOF
chmod +x "$WF_BIN/ln"
wf_stop wa2 coder-fleet:refuter "$WF_RUNS/wf_X/agent-wa2.jsonl" "$WF_BLOCKER" PATH="$WF_BIN:$PATH" WF_WINNER="$WF_RECORD"
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:blocked-by-human" ] && [ "$(ncomments 1)" -eq 1 ] && [ "$(ncomments 2)" -eq 0 ] \
  && [ "$(sed -n 's/^recorded_at=//p' "$WF_RECORD")" = "winner" ] && log_has "another stop recorded it first" \
  && [ -z "$(ls -A "$CODER_FLEET_STATE_DIR/sessions/s-w/runs" | grep -v '^wf_X$')" ]
check wf-race-loser-takes-record "a stop that loses the record race comments on the recorded issue, not the one it computed" $?

wf_reset
wf_start wz1 workflow-subagent '#1'; wf_lane wf_X wz1
wf_start wa2 coder-fleet:refuter '#2'; wf_lane wf_X wa2
: > "$CODER_FLEET_STATE_DIR/sessions/s-w/runs"
wf_stop wa2 coder-fleet:refuter "$WF_RUNS/wf_X/agent-wa2.jsonl" "$WF_CLEAN"
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 1 ] && [ "$(ncomments 2)" -eq 0 ] \
  && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-w/runs" ] && [ ! -s "$CODER_FLEET_STATE_DIR/sessions/s-w/runs" ] \
  && log_has "could not write or read the run record" && log_has "for this stop only"
check wf-record-unwritable-uses-computed "with no record possible, a stop comments on the issue it computed and says so" $?

wf_reset
wf_start wm1 workflow-subagent '#1'; wf_lane wf_X wm1
wf_start wa2 coder-fleet:refuter '#2'; wf_lane wf_X wa2
wf_start wz3 coder-fleet:reviewer '#2'; wf_lane wf_X wz3
wf_stop wa2 coder-fleet:refuter "$WF_RUNS/wf_X/agent-wa2.jsonl" "$WF_CLEAN"
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 1 ] && [ "$(ncomments 2)" -eq 0 ] && [ "$(sed -n 's/^agent_id=//p' "$WF_RECORD" 2>/dev/null)" = "wm1" ]
check wf-earliest-by-start-not-name "the earliest-started lane wins when it sorts in the middle by name" $?

wf_reset; focus '#1'
wf_lane wf_X wn1; wf_lane wf_X wn2
gh_calls_reset
wf_stop wn2 coder-fleet:refuter "$WF_RUNS/wf_X/agent-wn2.jsonl" "$WF_BLOCKER"
[ "$RC" -eq 0 ] && no_gh_calls && [ ! -e "$WF_RECORD" ] && log_has "no agent of the run has a start record"
check wf-no-start-records-comments-nowhere "a run with no start record comments nowhere, focus or not, and records nothing" $?

# Hostile transcript paths write nothing outside sessions/<sid>/runs/.
wf_reset
WF_ODD='wf_x y;$(touch pwn)*'
wf_start h1 coder-fleet:refuter '#1'; wf_lane "$WF_ODD" h1
wf_start h2 coder-fleet:refuter '#2'; mkdir -p "$WF_RUNS/wf_a/b"; : > "$WF_RUNS/wf_a/b/agent-h2.jsonl"
wf_start h3 coder-fleet:refuter '#2'; mkdir -p "$TMP/wf/escape"; : > "$TMP/wf/escape/agent-h3.jsonl"
wf_start h4 coder-fleet:refuter '#1'; wf_lane 'wf_..' h4
: > "$TMP/wf/marker"
wf_stop h1 coder-fleet:refuter "$WF_RUNS/$WF_ODD/agent-h1.jsonl" "$WF_CLEAN"; cat "$LOG" > "$TMP/wf/hostile.log"
wf_stop h2 coder-fleet:refuter "$WF_RUNS/wf_a/b/agent-h2.jsonl" "$WF_CLEAN"; cat "$LOG" >> "$TMP/wf/hostile.log"
wf_stop h3 coder-fleet:refuter "$WF_RUNS/wf_ok/../../escape/agent-h3.jsonl" "$WF_CLEAN"; cat "$LOG" >> "$TMP/wf/hostile.log"
wf_stop h4 coder-fleet:refuter "$WF_RUNS/wf_../agent-h4.jsonl" "$WF_CLEAN"; cat "$LOG" >> "$TMP/wf/hostile.log"
WF_RUNDIR="$CODER_FLEET_STATE_DIR/sessions/s-w/runs"
WF_STRAY="$(find "$TMP" -type f -newer "$TMP/wf/marker" \
    ! -path "$FAKE_GH_DIR/*" ! -path "$LOG" ! -path "$TMP/out" ! -path "$TMP/err" \
    ! -path "$TMP/wf/hostile.log" ! -path "$CODER_FLEET_STATE_DIR/sessions/s-w/agents/*" \
    ! -path "$WF_RUNDIR/*" 2>/dev/null)"
[ -z "$WF_STRAY" ] && [ ! -e "$TMP/wf/pwn" ] && [ ! -e "$REPO/pwn" ] \
  && [ -z "$(ls -A "$WF_RUNDIR" | grep -vE '^[A-Za-z0-9._-]+$')" ] && [ -z "$(find "$WF_RUNDIR" -mindepth 1 ! -type f)" ]
check wf-hostile-paths-stay-in-runs "hostile run paths write nothing outside runs/, and every record there is a plain, sanitised file" $?
[ "$(sed -n 's/^page_id=//p' "$WF_RUNDIR/wf_x_y___touch_pwn__")" = "#1" ] && [ "$(sed -n 's/^page_id=//p' "$WF_RUNDIR/wf_..")" = "#1" ] \
  && [ "$(ncomments 1)" -eq 2 ] && [ "$(ncomments 2)" -eq 2 ] \
  && ! grep -F 'run wf_a/' "$TMP/wf/hostile.log" >/dev/null && ! grep -F 'run wf_ok/' "$TMP/wf/hostile.log" >/dev/null
check wf-hostile-paths-resolve-safely "odd characters and wf_.. are runs under a sanitised name; a slash or .. in the run id makes a direct spawn" $?
unfocus

section 'PostToolUse on Agent: a run that ended without SubagentStop'

# R21. SubagentStop does not fire when maxTurns cuts a run off, so the issue
# would sit silent in In Progress. SubagentStop leaves a stopped marker before
# any branch that can exit, and board-agent-return.sh comments once on the bound
# issue when a completed foreground run has none. It never moves a column.
R21_CAP_NOTE='NOTE: this agent stopped at its 3-turn limit before finishing. The text below is PARTIAL output; treat it as incomplete. Send the agent a message (SendMessage) to let it continue from where it stopped.'
r21_return() {
    # $1 session, $2 agent id, $3 status, $4 the first text block, $5 agent type
    jq -nc --arg c "$REPO" --arg s "$1" --arg a "$2" --arg st "$3" --arg x "$4" --arg t "${5:-coder-fleet:coder}" \
        '{session_id:$s,cwd:$c,hook_event_name:"PostToolUse",tool_name:"Agent",tool_use_id:"toolu_r21",
          transcript_path:"/dev/null",tool_input:{subagent_type:$t,prompt:"p",description:"d"},
          tool_response:{agentId:$a,agentType:$t,status:$st,content:[{type:"text",text:$x},{type:"text",text:"agentId: x"}]}}'
}
r21() { gh_reset; seed 1; rm -rf "$CODER_FLEET_STATE_DIR"/sessions/s-t*; focus '#1'; }
R21_STDOUT=""
r21_run_return() {
    run_gh board-agent-return.sh "$@"
    if [ -s "$TMP/out" ]; then R21_STDOUT="$R21_STDOUT $(head -c 80 "$TMP/out" | tr '\n' ' ')"; fi
}

r21; run_gh board-subagent-start.sh "$(start_ev s-t1 a-t1)"; gh_calls_reset
r21_run_return "$(r21_return s-t1 a-t1 completed "$R21_CAP_NOTE")"
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 1 ] && [ "$(edits 1)" -eq 0 ] \
  && last_comment 1 | grep -qF '3-turn cap' && last_comment 1 | grep -qF 'SendMessage' && last_comment 1 | grep -qF 'no handoff'
check return-cap-comments "a capped, bound run with no stopped marker gets one comment naming the cap, and nothing moves" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t2 a-t2)"
r21_run_return "$(r21_return s-t2 a-t2 completed 'All done, nothing to add.')"
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 1 ] && last_comment 1 | grep -qF 'without SubagentStop' \
  && last_comment 1 | grep -qF 'no handoff check' && ! last_comment 1 | grep -qF 'turn cap'
check return-no-stop-comments "a bound run with no marker and no cap note gets the ended-without-SubagentStop comment" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t3 a-t3)"
run_gh board-subagent-stop.sh "$(stop_ev s-t3 a-t3 "$H_CLEAN")"
gh_calls_reset
r21_run_return "$(r21_return s-t3 a-t3 completed '## Done')"
[ "$RC" -eq 0 ] && no_gh_calls && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-t3/agents/a-t3.stopped" ]
check return-after-stop-silent "a normal stop leaves a marker beside the record, and the return then posts nothing" $?

r21; unfocus; run_gh board-subagent-start.sh "$(start_ev s-t4 a-t4)"
r21_run_return "$(r21_return s-t4 a-t4 completed "$R21_CAP_NOTE")"
[ -f "$CODER_FLEET_STATE_DIR/sessions/s-t4/agents/a-t4" ] && [ -z "$(record_page s-t4 a-t4)" ] && [ "$RC" -eq 0 ] && no_gh_calls
check return-unbound-silent "an agent recorded with no issue gets no comment" $?

r21; r21_run_return "$(r21_return s-t5 a-t5 completed "$R21_CAP_NOTE")"
[ "$RC" -eq 0 ] && no_gh_calls; check return-no-record-silent "an agent with no record at all gets no comment" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t6 a-t6)"; gh_calls_reset
r21_run_return "$(r21_return s-t6 a-t6 async_launched 'Async agent launched successfully.')"
RC6="$RC"
r21_run_return "$(r21_return s-t6 a-t6 error "$R21_CAP_NOTE")"
[ "$RC6" -eq 0 ] && [ "$RC" -eq 0 ] && no_gh_calls && log_has "not completed"
check return-not-completed-silent "a background launch, or any status but completed, gets no comment" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t7 a-t7)"
run_gh board-subagent-stop.sh "$(stop_ev s-t7 a-t7 'I finished, no headings here.')"
RC7="$RC"; gh_calls_reset
r21_run_return "$(r21_return s-t7 a-t7 completed 'I finished, no headings here.')"
[ "$RC7" -eq 2 ] && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-t7/agents/a-t7.stopped" ] && [ "$RC" -eq 0 ] && no_gh_calls
check stop-exit2-leaves-marker "a SubagentStop that exits 2 on a malformed handoff still leaves the marker" $?

r21; run_gh board-subagent-stop.sh "$(jq -nc --arg c "$REPO" '{session_id:"s-t8",agent_id:"a-t8",cwd:$c,stop_hook_active:false,agent_transcript_path:"/dev/null"}')"
[ "$RC" -eq 0 ] && [ -f "$CODER_FLEET_STATE_DIR/sessions/s-t8/agents/a-t8.stopped" ]
check stop-untyped-leaves-marker "an untyped stop, which exits before any board work, still leaves the marker" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t9 a-t9)"; gh_calls_reset
r21_run_return "$(r21_return s-t9 a-t9 completed "$R21_CAP_NOTE")" BOARD_DRY_RUN=1
[ "$RC" -eq 0 ] && no_gh_calls && log_has "would comment on #1" && log_has "3-turn cap"
check return-dry-run-reports "a dry run calls no gh and reports the comment it would post" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t10 a-t10 general-purpose)"; gh_calls_reset
r21_run_return "$(r21_return s-t10 a-t10 completed "$R21_CAP_NOTE" general-purpose)"
[ "$RC" -eq 0 ] && no_gh_calls; check return-non-fleet-silent "a non-fleet agent, which SubagentStop's matcher never covers, gets no comment" $?

r21; r21_run_return 'not json at all'
[ "$RC" -eq 0 ] && no_gh_calls; check return-bad-input-exits-0 "input that is not JSON exits 0 and calls no gh" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t11 a-t11)"
run_gh board-subagent-stop.sh "$(stop_ev s-t11 a-t11 'Half done, no headings.')"
RC11="$RC"
r21_run_return "$(r21_return s-t11 a-t11 completed "$R21_CAP_NOTE")"
[ "$RC11" -eq 2 ] && [ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 1 ] && last_comment 1 | grep -qF '3-turn cap'
check return-cap-beats-marker "a marked agent whose return carries the cap note still gets one cap comment" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t12 a-t12)"; gh_calls_reset
r21_run_return "$(r21_return s-t12 a-t12 completed "$R21_CAP_NOTE")" CODER_FLEET_BOARD=off
[ "$RC" -eq 0 ] && no_gh_calls && log_has "the board is off" && ! log_has "dry run: the comment"
check return-board-off-says-off "a disabled board is logged as off, not as a dry run" $?

r21; run_gh board-subagent-start.sh "$(start_ev s-t13 a-t13)"
r21_run_return "$(r21_return s-t13 a-t13 completed "$R21_CAP_NOTE")" FAKE_GH_FAIL='issue comment'
[ "$RC" -eq 0 ] && [ "$(ncomments 1)" -eq 0 ] && log_has "failed (exit 1)"
check return-gh-failing-exits-0 "a comment gh refuses is logged and the return exits 0" $?

[ -z "$R21_STDOUT" ]; check return-stdout-silent "the return hook writes nothing to stdout in any case" $?
unfocus

section 'TaskCompleted: the card gate, and the columns a verdict writes'

# An [issue:#N] task the test gate lets through completes only when the issue
# has at least one acceptance criterion and every criterion and Definition of
# Done item is ticked. Anything else labels it Blocked with each unticked item
# listed, and exits 2. A pass writes no Done: the merge closes the issue, and a
# pass only lifts an issue a red run left in Blocked back to In Progress.
CG_DIR="$TMP/cg"
mkdir -p "$CG_DIR/.claude"
cg_status() { if [ -n "$1" ]; then printf '%s\n' "$1" > "$CG_DIR/.claude/test-status"; else rm -f "$CG_DIR/.claude/test-status"; fi; }
cg() {
    # $1 labels JSON, $2 body, $3 test status, then VAR=value for the hook
    gh_reset; seed 1 OPEN "$1" "$2"; cg_status "$3"; shift 3
    run_gh board-task-completed.sh "$(task_ev 'Ship the parser [issue:#1]' "$CG_DIR")" "$@"
}
body_view() { calls '.[1] == "view" and (index("body") != null)'; }
BODY_AC_OPEN='Words.

## Acceptance criteria
- [x] Parser rejects empty input
- [ ] Errors name the line

## Definition of Done
- [x] check-all passes
'
BODY_DOD_OPEN='## acceptance criteria
* [X] Parser rejects empty input

## Definition of Done
- [x] check-all passes
- [ ] The reviewer approved
  - [ ] an indented box is no item
'
BODY_NO_AC='## Definition of Done
- [x] check-all passes
'
BODY_NO_AC_OPEN_DOD='## Definition of Done
- [ ] The reviewer approved
'
BODY_NO_DOD='## Acceptance criteria
- [x] Parser rejects empty input

## Notes
- [ ] a box under another heading is not a criterion
'

cg '["status:in-progress"]' "$BODY_AC_OPEN" pass
[ "$RC" -eq 2 ] && [ "$(labels 1)" = "status:blocked" ] && [ "$(ncomments 1)" -eq 1 ] \
  && last_comment 1 | grep -qF 'Acceptance criteria not ticked:' && last_comment 1 | grep -qxF -- '- 2. Errors name the line' \
  && ! last_comment 1 | grep -qF 'Parser rejects' && err_has "- 2. Errors name the line" && ! err_has "Parser rejects empty input"
check cg-unticked-criterion "an unticked criterion labels the issue Blocked, lists that criterion alone, and exits 2" $?

cg '["status:in-progress"]' "$BODY_DOD_OPEN" pass
[ "$RC" -eq 2 ] && [ "$(labels 1)" = "status:blocked" ] && last_comment 1 | grep -qF 'Definition of Done items not ticked:' \
  && last_comment 1 | grep -qxF -- '- 2. The reviewer approved' && ! last_comment 1 | grep -qF 'indented' && ! err_has "check-all passes"
check cg-unticked-dod "an unticked DoD item blocks under its own heading; heading case, * and [X] read, an indented box is no item" $?

cg '[]' "$BODY_NO_AC" pass
[ "$RC" -eq 2 ] && [ "$(labels 1)" = "status:blocked" ] && err_has "no acceptance criteria" && ! err_has "Tick each one"
check cg-no-criteria "an issue with no criteria is refused and says so, and is not told to tick anything" $?

cg '[]' "$BODY_NO_AC_OPEN_DOD" pass
[ "$RC" -eq 2 ] && err_has "no acceptance criteria" && err_has "- 1. The reviewer approved" && err_has "Tick each one"
check cg-no-criteria-open-dod "no criteria and an unticked DoD item gets both, and the ticking advice" $?

cg '["status:in-progress"]' "$BODY_TICKED" pass
[ "$RC" -eq 0 ] && no_writes && [ "$(issue_q 1 .state)" = OPEN ] && log_has "every criterion and Definition of Done item is ticked" \
  && log_has "#1 is in In Progress; nothing to move"
check cg-all-ticked "a ticked issue completes, is not closed and not relabelled: its merge closes it" $?

cg '[]' "$BODY_NO_DOD" pass
[ "$RC" -eq 0 ] && no_writes && log_has "every criterion and Definition of Done item is ticked"
check cg-no-dod-ticked "ticked criteria and no DoD section pass; a box under another heading is no criterion" $?

cg '["status:in-progress","status:next"]' "$BODY_TICKED" "$(printf 'fail\nparser.test.ts: 1 failed')"
[ "$RC" -eq 2 ] && err_has "Tests are not passing" && [ "$(body_view)" -eq 0 ] && [ "$(labels 1)" = "status:blocked" ] \
  && last_comment 1 | grep -qF 'The test gate failed on "Ship the parser [issue:#1]"' && last_comment 1 | grep -qF 'parser.test.ts: 1 failed'
check cg-test-fail-wins "a failing test gate labels Blocked, alone, with its output, without reading the checklists" $?

cg '[]' "$BODY_AC_OPEN" ""
[ "$RC" -eq 2 ] && [ "$(labels 1)" = "status:blocked" ] && err_has "- 2. Errors name the line"
check cg-lenient-no-result-gated "the lenient no-result path is gated on the checklists too" $?

cg '[]' "$BODY_TICKED" ""
[ "$RC" -eq 0 ] && no_writes && log_has "no test gate configured"
check cg-lenient-no-result-ticked "and a ticked issue still completes on that path" $?

cg '[]' "$BODY_TICKED" "" CODER_FLEET_TEST_GATE=strict
[ "$RC" -eq 2 ] && [ "$(labels 1)" = "status:blocked" ] && err_has "CODER_FLEET_TEST_GATE is strict"
check cg-strict-no-result-blocks "a strict gate with no result labels Blocked and exits 2" $?

cg '[]' "$BODY_TICKED" pass CODER_FLEET_TEST_GATE=strict FAKE_GH_FAIL='issue view'
[ "$RC" -eq 2 ] && err_has "could not read" && no_writes
check cg-unreadable-strict "under a strict gate an issue gh cannot read is refused, and nothing is written" $?

cg '[]' "$BODY_AC_OPEN" pass FAKE_GH_FAIL='issue view'
[ "$RC" -eq 0 ] && log_has "could not read" && log_has "lenient"
check cg-unreadable-lenient "under a lenient gate an unreadable issue goes through and the log says so" $?

cg '[]' "$BODY_AC_OPEN" pass BOARD_GH=gh-not-installed-here
[ "$RC" -eq 0 ] && no_gh_calls && log_has "gh is not installed"
check cg-gh-missing-lenient "with gh missing a lenient gate logs it and exits 0" $?

cg '[]' "$BODY_AC_OPEN" pass CODER_FLEET_BOARD=off CODER_FLEET_TEST_GATE=strict
[ "$RC" -eq 0 ] && no_gh_calls && log_has "the board is off, so the card gate is skipped"
check cg-board-off-skips "a disabled board skips the card gate with a log line and calls no gh" $?

gh_reset; seed 1 OPEN '[]' "$BODY_AC_OPEN"; cg_status pass
run_gh board-task-completed.sh "$(task_ev 'Tidy the parser' "$CG_DIR")"
[ "$RC" -eq 0 ] && no_gh_calls; check cg-unmarked-unread "an unmarked task reads no issue and is not held by one" $?

# A dry run reads the checklists, so it exits as a live run would, and writes nothing.
cg '[]' "$BODY_AC_OPEN" pass BOARD_DRY_RUN=1
[ "$RC" -eq 2 ] && [ "$(body_view)" -ge 1 ] && no_writes && log_has "dry run: would move #1 to Blocked with a comment"
check cg-dry-run-reads-and-refuses "a dry run reads the issue, exits 2 on an unticked item, and writes nothing" $?

cg '["status:blocked"]' "$BODY_TICKED" pass BOARD_DRY_RUN=1
[ "$RC" -eq 0 ] && no_writes; check cg-dry-run-pass-writes-nothing "a dry-run pass lifts nothing" $?

cg '["status:blocked","status:next"]' "$BODY_TICKED" pass
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:in-progress" ] && [ "$(ncomments 1)" -eq 1 ] \
  && last_comment 1 | grep -qF 'Unblocked. The test gate passed on "Ship the parser [issue:#1]"' && last_comment 1 | grep -qF 'reports a pass'
check pass-lifts-blocked "a pass on an issue in Blocked labels it In Progress, removing the rest, with an Unblocked comment" $?

cg '["status:blocked"]' "$BODY_TICKED" ""
[ "$RC" -eq 0 ] && [ "$(labels 1)" = "status:in-progress" ] && last_comment 1 | grep -qF 'No test gate is configured, so nothing was run.'
check pass-lifts-blocked-says-unrun "a lenient pass with no result says nothing was run when it lifts Blocked" $?

lift_ok=0
for lb in '[]' '["status:next"]' '["status:in-progress"]' '["status:blocked-by-human"]'; do
    cg "$lb" "$BODY_TICKED" pass
    if [ "$RC" -ne 0 ] || ! no_writes; then lift_ok=1; printf '        %s was written\n' "$lb"; fi
done
[ "$lift_ok" -eq 0 ]; check pass-leaves-other-columns "a pass writes nothing to an issue in To Do, Next, In Progress or Blocked by human" $?

gh_reset; seed 1 CLOSED '["status:blocked"]' "$BODY_TICKED"; cg_status pass
run_gh board-task-completed.sh "$(task_ev 'Ship the parser [issue:#1]' "$CG_DIR")"
[ "$RC" -eq 0 ] && no_writes && [ "$(issue_q 1 .state)" = CLOSED ]
check pass-leaves-closed "a pass on a closed issue writes nothing and reopens nothing" $?
cg_status ""

section 'focus.sh: focusing the checkout on one issue'

focus_run() {
    # [VAR=value ...] -- args: runs focus.sh from $FOCUS_CWD, sets RC, $TMP/out, $TMP/err
    local envs=()
    while [ "$#" -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
    shift
    RC=0
    ( cd "${FOCUS_CWD:-$REPO}" && env "${envs[@]+"${envs[@]}"}" "$FOCUS_SH" "$@" ) >"$TMP/out" 2>"$TMP/err" || RC=$?
}
out_is() { [ "$(cat "$TMP/out")" = "$1" ]; }

gh_reset; seed 12; seed 13 CLOSED; unfocus
focus_run -- '#12'
[ "$RC" -eq 0 ] && out_is '#12 Issue 12' && [ "$(cat "$FOCUS_FILE")" = '#12' ]
check focus-open-issue "focusing an open issue writes #N to the common dir and prints it with its title" $?

for ref in 12 'https://github.com/o/r/issues/12'; do
    unfocus; focus_run -- "$ref"
    [ "$RC" -eq 0 ] && [ "$(cat "$FOCUS_FILE" 2>/dev/null)" = '#12' ]
    check "focus-normalises-$(printf '%s' "$ref" | tr -c 'a-z0-9' '-' | sed 's/-*$//' | cut -c1-20)" "focus.sh $ref focuses #12" $?
done

focus '#12'; focus_run -- '#13'
[ "$RC" -eq 1 ] && [ "$(cat "$FOCUS_FILE")" = '#12' ] && err_has "#13 is closed"
check focus-refuses-closed "a closed issue is refused and the focus left as it was" $?

focus_run -- '#77'
[ "$RC" -eq 1 ] && [ "$(cat "$FOCUS_FILE")" = '#12' ] && err_has "no issue #77"
check focus-refuses-unknown "an issue gh cannot find is refused" $?

focus_run -- 'BD-12'
[ "$RC" -eq 1 ] && [ "$(cat "$FOCUS_FILE")" = '#12' ] && err_has "is not an issue ref"
check focus-refuses-bad-ref "a value that is not an issue ref is refused" $?

unfocus; focus_run BOARD_GH=gh-not-installed-here -- '#12'
[ "$RC" -eq 0 ] && [ "$(cat "$FOCUS_FILE")" = '#12' ] && err_has "gh is not installed" && out_is '#12'
check focus-gh-missing "with gh missing it says so and focuses anyway, since the hooks read the file" $?

unfocus; focus_run FAKE_GH_FAIL=issue -- '#12'
[ "$RC" -eq 0 ] && [ "$(cat "$FOCUS_FILE")" = '#12' ] && err_has "gh could not check #12"
check focus-gh-failing "a gh that fails for another reason is reported and the focus written" $?

focus_run -- --show
[ "$RC" -eq 0 ] && out_is '#12'; check focus-show "--show prints the focus" $?
focus_run -- --clear
[ "$RC" -eq 0 ] && [ ! -e "$FOCUS_FILE" ]; check focus-clear "--clear removes it" $?
focus_run -- --show
[ "$RC" -eq 0 ] && out_is ''; check focus-show-empty "--show with nothing focused prints nothing" $?

git -C "$REPO" worktree add -q "$TMP/repo-wt" -b wt-focus 2>/dev/null
FOCUS_CWD="$TMP/repo-wt" focus_run -- '#12'
[ "$RC" -eq 0 ] && [ "$(cat "$FOCUS_FILE" 2>/dev/null)" = '#12' ] && [ ! -e "$TMP/repo-wt/.git/coder-fleet" ]
check focus-from-worktree "focusing from a linked worktree writes the main checkout's focus, which every worktree shares" $?

FOCUS_CWD="$TMP/not-a-repo" focus_run -- '#12'
[ "$RC" -eq 2 ] && err_has "not inside a git repository"; check focus-outside-repo "outside a repository it exits 2" $?
focus_run -- '#1' '#2'
[ "$RC" -eq 2 ]; check focus-usage "two arguments are a usage error" $?
unfocus

section 'SessionStart: a focus from an earlier session is cleared'

fc_event() { jq -nc --arg c "$REPO" --arg s "$1" '{session_id:"s-fc",hook_event_name:"SessionStart",source:$s,cwd:$c}'; }

gh_reset; focus '#1'
run_gh board-focus-clear.sh "$(fc_event startup)"
[ "$RC" -eq 0 ] && [ ! -e "$FOCUS_FILE" ] && grep -qF "#1" "$TMP/out" && log_has "cleared the focus on #1" && no_gh_calls
check focus-clear-startup "a new session clears a stale focus, says so in its context, logs it and calls no gh" $?

gh_reset; seed 1; state_reset s-fc
run_gh board-subagent-start.sh "$(start_ev s-fc a-fc coder-fleet:scout)"
[ "$RC" -eq 0 ] && no_writes && log_has "nothing is focused" && [ -z "$(record_page s-fc a-fc)" ]
check focus-clear-then-spawn-unbound "the new session's first spawn binds nothing and moves nothing" $?

for fc_src in clear resume; do
    focus '#1'
    run_gh board-focus-clear.sh "$(fc_event "$fc_src")"
    [ "$RC" -eq 0 ] && [ ! -e "$FOCUS_FILE" ]
    check "focus-clear-on-$fc_src" "a session started by $fc_src clears the focus" $?
done

focus '#1'
run_gh board-focus-clear.sh "$(fc_event compact)"
[ "$RC" -eq 0 ] && [ "$(cat "$FOCUS_FILE" 2>/dev/null)" = '#1' ] && [ ! -s "$TMP/out" ]
check focus-clear-compact-keeps "a compaction is the same session going on, and keeps its focus" $?

unfocus
run_gh board-focus-clear.sh "$(fc_event startup)"
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out" ]; check focus-clear-nothing-focused "with nothing focused it clears nothing and prints nothing" $?

focus '#1'
run_gh board-focus-clear.sh "$(fc_event startup)" CODER_FLEET_BOARD=off
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out" ] && [ -e "$FOCUS_FILE" ]
check focus-clear-board-off "with the board off it clears nothing and prints nothing" $?

run_gh board-focus-clear.sh "$(fc_event startup)" BOARD_DRY_RUN=1
[ "$RC" -eq 0 ] && [ -e "$FOCUS_FILE" ] && log_has "dry run: would clear the focus on #1"
check focus-clear-dry-run "a dry run reads the focus and says it would clear it, and clears nothing" $?

run_gh board-focus-clear.sh "$(jq -nc --arg c "$TMP/not-a-repo" '{source:"startup",cwd:$c}')"
[ "$RC" -eq 0 ] && [ -e "$FOCUS_FILE" ] && [ ! -s "$TMP/out" ]
check focus-clear-read-fails "outside a repository it clears nothing, prints nothing and exits 0" $?

# An event that cannot be read is taken as a new session in the hook's own
# directory, which here is the scratch repository.
run_gh board-focus-clear.sh 'not json'
[ "$RC" -eq 0 ] && [ ! -e "$FOCUS_FILE" ]
check focus-clear-bad-input "an unreadable event is taken as a new session: the focus is cleared and the hook exits 0" $?
unfocus

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'A board hook is reading a field the runtime does not send, or moving an issue without evidence.\n'
    exit 1
fi
printf 'The board hooks match the runtime event shapes and move issues only on evidence.\n'
