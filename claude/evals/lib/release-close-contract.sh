#!/usr/bin/env bash
#
# release-close-contract.sh - a merged, fully ticked card reaches Done without
# the lead remembering a close: hooks/board-release-close.sh closes the cards a
# release commit's subject names when its tag is pushed, through the card gate
# and the test gate TaskCompleted runs, and hooks/board-merged-cards.sh names,
# at session start, the In Progress cards that are fully ticked and whose pull
# requests have merged, moving nothing.
#
# Every case runs the real hook against a stub board binary (BOARD_SHIM) that
# serves one JSON file per card and records every status edit and comment, a
# throwaway repository holding a tagged release commit, and, for the session
# start, a stub gh on PATH. Nothing reaches a network or a real board.
#
# Case names, by the card's criteria (CF-205):
#   1 closed on a tag push    R01 fully ticked card moved to Done, R02 refs/tags
#                             form, R03 strict with no result refuses
#   1 red test gate           R04 the card stays where it is, with a comment
#   2 left alone              R05 unticked, R06 already Done, R07 not on this
#                             board, R08 no criteria
#   once per tag              R09 a second push of the tag closes nothing
#   not a release push        R10 no tag, R11 a delete, R12 git's rejection on
#                             stderr, R13 a subject not starting with the tag
#   3 session start           S01 a merged card named and an unmerged one
#                             omitted, S02 unticked or no PR comment omitted,
#                             S03 nothing to report prints nothing, S04 no gh,
#                             S05 gh failing, S06 gh hanging is cut off,
#                             S07 a card landed without a pull request (CF-2.1)
#   wiring                    W01 hooks.json registers both, W02 both close
#                             hooks source lib/gates.sh
#
# Usage:  claude/evals/lib/release-close-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
HOOKS="$PLUGIN_ROOT/hooks"
RELEASE="$HOOKS/board-release-close.sh"
MERGED="$HOOKS/board-merged-cards.sh"

command -v jq >/dev/null 2>&1 || { printf 'release-close-contract: jq is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/release-close-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
trap 'rm -rf "$TMP"' EXIT

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); [ "$VERBOSE" = 1 ] && printf 'ok   %s\n' "$1"; return 0; }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL %s: %s\n' "$1" "$2"; }
check() { if eval "$2"; then ok "$1"; else bad "$1" "$3"; fi; }

# --- the stub board ----------------------------------------------------------
#
# Each card is $STUB_CARDS/<ID>.json, the .task object a view answers with. A
# view of a card with no file fails as the binary does. `task list --status S`
# lists the cards whose status is S, and refuses a status not in the fleet's
# six. A status edit records "edit <id> <status>" in $STUB_CALLS and rewrites
# the card's status, a comment records "comment <id>" and its body in
# $STUB_CALLS.body.
STUB="$TMP/stub-board"
cat > "$STUB" <<'STUB_EOF'
#!/usr/bin/env bash
printf 'call: %s\n' "$*" >> "$STUB_CALLS"
norm() { printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -d ' '; }
canon() {
    local want s
    want="$(norm "$1")"
    for s in "To Do" "Next" "In Progress" "Blocked" "Blocked by human" "Done"; do
        if [ "$(norm "$s")" = "$want" ]; then printf '%s' "$s"; return 0; fi
    done
    printf 'invalid status "%s"\n' "$1" >&2
    return 1
}
case "$1 ${2:-}" in
    "task view")
        f="$STUB_CARDS/$3.json"
        [ -f "$f" ] || { printf 'no task %s\n' "$3" >&2; exit 1; }
        jq -c '{task: .}' "$f" ;;
    "task list")
        want="$(canon "$4")" || exit 1
        for f in "$STUB_CARDS"/*.json; do
            [ -f "$f" ] || continue
            if [ "$(jq -r .status "$f")" = "$want" ]; then
                printf '%s  %s  %s\n' "$(jq -r .id "$f")" "$want" "$(jq -r '.title // "t"' "$f")"
            fi
        done ;;
    "task edit")
        id="$3"
        if [ "${4:-}" = "-s" ]; then
            c="$(canon "$5")" || exit 1
            printf 'edit %s %s\n' "$id" "$c" >> "$STUB_CALLS"
            jq --arg s "$c" '.status = $s' "$STUB_CARDS/$id.json" > "$STUB_CARDS/$id.tmp" && mv "$STUB_CARDS/$id.tmp" "$STUB_CARDS/$id.json"
        else
            printf 'comment %s\n' "$id" >> "$STUB_CALLS"
            printf '%s\n' "${5:-}" >> "$STUB_CALLS.body"
        fi ;;
    *) printf 'stub: unexpected call: %s\n' "$*" >&2; exit 1 ;;
esac
STUB_EOF
chmod +x "$STUB"

# card ID STATUS AC DOD [COMMENT...]: writes a card. AC and DOD are strings of
# x (ticked) and o (unticked), one letter per item.
card() {
    local id="$1" status="$2" ac="$3" dod="$4"; shift 4
    local comments='[]' c
    for c in "$@"; do comments="$(jq -c --arg b "$c" '. + [{index: (length + 1), body: $b}]' <<<"$comments")"; done
    jq -n --arg id "$id" --arg s "$status" --arg ac "$ac" --arg dod "$dod" --argjson cm "$comments" '
        def items($p): [range(0; $p | length) as $i | {index: ($i + 1), text: "item \($i + 1)", checked: ($p[$i:$i+1] == "x")}];
        {id: $id, title: "card \($id)", status: $s, acceptanceCriteria: items($ac), definitionOfDone: items($dod), comments: $cm}' \
        > "$STUB_CARDS/$id.json"
}

# --- the release repository --------------------------------------------------

REPO="$TMP/repo"
git init -q -b main "$REPO"
git -C "$REPO" commit -q --allow-empty -m "start"
git -C "$REPO" commit -q --allow-empty -m "v1.2.0: release four cards [T-1, T-2, T-3, T-4]"
git -C "$REPO" tag -a v1.2.0 -m "v1.2.0: release"
git -C "$REPO" commit -q --allow-empty -m "not a release [T-1]"
git -C "$REPO" tag -a v9.9.9 -m "v9.9.9"
git -C "$REPO" commit -q --allow-empty -m "v1.3.0: names nothing"
git -C "$REPO" tag -a v1.3.0 -m "v1.3.0"

# fresh: a clean board, state directory and call log for one case.
N=0
fresh() {
    N=$((N + 1))
    STUB_CARDS="$TMP/cards.$N"; mkdir -p "$STUB_CARDS"
    STUB_CALLS="$TMP/calls.$N"; : > "$STUB_CALLS"
    STATE="$TMP/state.$N"
    LOG="$TMP/log.$N"; : > "$LOG"
}

# release COMMAND [STDERR] [VAR=value ...] -> $RC, $OUT, and the log in $LOG
release() {
    local cmd="$1" err="${2:-}"; shift 2 2>/dev/null || shift $#
    RC=0
    jq -nc --arg c "$REPO" --arg cmd "$cmd" --arg e "$err" \
        '{session_id:"s1", cwd:$c, hook_event_name:"PostToolUse", tool_name:"Bash", tool_input:{command:$cmd}, tool_response:{stdout:"", stderr:$e, interrupted:false}}' \
      | env -u CODER_FLEET_TEST_COMMAND -u CODER_FLEET_TEST_GATE -u CODER_FLEET_TEST_STATUS_FILE -u BOARD_DRY_RUN \
            CODER_FLEET_BOARD=on CODER_FLEET_STATE_DIR="$STATE" BOARD_SHIM="$STUB" \
            STUB_CARDS="$STUB_CARDS" STUB_CALLS="$STUB_CALLS" BOARD_LOG_FILE="$LOG" "$@" \
            "$RELEASE" >"$TMP/out" 2>"$TMP/err" || RC=$?
    OUT="$(cat "$TMP/out")"
}

has_call() { grep -qxF "$1" "$STUB_CALLS"; }
no_edit() { ! grep -q '^edit ' "$STUB_CALLS"; }
log_has() { grep -qF "$1" "$LOG"; }

PUSH="git push origin v1.2.0"

# R01: a fully ticked In Progress card is moved to Done, with a comment naming
# the tag, after a passing test command; the others are left as they are.
fresh
card T-1 "In Progress" xx x
card T-2 "In Progress" xo x
release "$PUSH" "" CODER_FLEET_TEST_COMMAND=true CODER_FLEET_TEST_GATE=strict
check R01a '[ "$RC" -eq 0 ] && has_call "edit T-1 Done"' "T-1 not moved to Done (rc $RC): $(cat "$STUB_CALLS")"
check R01b '! grep -q "^edit T-2" "$STUB_CALLS"' "T-2, unticked, was moved"
check R01c 'grep -q "Closed on release v1.2.0" "$STUB_CALLS.body"' "no comment naming the tag"
check R01d 'log_has "running the test command" && log_has "T-1 is fully ticked and the test gate allows it; moved to Done"' "log does not show the gate and the close"
check R01e 'printf "%s" "$OUT" | jq -e ".hookSpecificOutput.additionalContext | test(\"T-1 is fully ticked\")" >/dev/null' "no additionalContext naming the close: $OUT"

# R02: the refs/tags form, in a compound command from another directory, is a
# release push too.
fresh
card T-1 "In Progress" x x
release "cd /tmp && git -C $REPO push origin refs/tags/v1.2.0" "" CODER_FLEET_TEST_COMMAND=true
check R02 'has_call "edit T-1 Done"' "refs/tags/v1.2.0 push did not close T-1: $(cat "$LOG")"

# R03: strict with no test result refuses, as TaskCompleted does.
fresh
card T-1 "In Progress" x x
release "$PUSH" "" CODER_FLEET_TEST_GATE=strict
check R03 'no_edit && log_has "no test result was available and CODER_FLEET_TEST_GATE is strict; left where it is"' "strict with no result moved a card or did not say why: $(cat "$STUB_CALLS")"

# R04: a red test gate leaves the fully ticked card where it is, says so in the
# log and on the card, and never moves it to Blocked.
fresh
card T-1 "In Progress" x x
release "$PUSH" "" CODER_FLEET_TEST_COMMAND="echo boom; exit 3" CODER_FLEET_TEST_GATE=strict
check R04a '[ "$RC" -eq 0 ] && no_edit' "a red gate moved a card (rc $RC): $(cat "$STUB_CALLS")"
check R04b 'log_has "T-1 is fully ticked, but the test gate failed; left where it is"' "the log does not say the gate refused T-1"
check R04c 'has_call "comment T-1" && grep -q "Not closed on release v1.2.0: the test gate failed" "$STUB_CALLS.body" && grep -q boom "$STUB_CALLS.body"' "no comment on T-1 with the failure"
check R04d '[ "$(jq -r .status "$STUB_CARDS/T-1.json")" = "In Progress" ]' "T-1 is no longer In Progress"

# R05-R08: unticked, already Done, not on this board and no criteria are each
# left alone, the log naming which and why, and the test gate never runs.
fresh
card T-1 "In Progress" xo x
card T-2 "Done" x x
card T-4 "In Progress" "" x
release "$PUSH" "" CODER_FLEET_TEST_COMMAND="touch $TMP/gate-ran"
check R05 'log_has "T-1 is not fully ticked (2 acceptance criteria, 1 unticked item(s)); left in \"In Progress\""' "unticked T-1 not logged as left alone: $(cat "$LOG")"
check R06 'log_has "T-2 is already Done; left alone"' "Done T-2 not logged as left alone"
check R07 'log_has "T-3 is not on this board, or could not be read; left alone"' "missing T-3 not logged"
check R08 'log_has "T-4 is not fully ticked (0 acceptance criteria"' "T-4 with no criteria not logged as unticked"
check R05x 'no_edit && ! grep -q "^comment " "$STUB_CALLS" && [ ! -e "$TMP/gate-ran" ]' "a card was touched or the test gate ran with no candidate"

# R09: once per tag. A second push of v1.2.0 closes nothing, even for a card
# that has become ready since.
fresh
card T-1 "In Progress" xo x
release "$PUSH" "" CODER_FLEET_TEST_COMMAND=true
card T-1 "In Progress" xx x
: > "$STUB_CALLS"
release "$PUSH" "" CODER_FLEET_TEST_COMMAND=true
check R09 'no_edit && log_has "v1.2.0 has already been handled in this repository"' "a second push of the tag acted again"

# R10-R13: commands that are not a release push close nothing.
fresh
card T-1 "In Progress" x x
release "git push origin cf-205-close-cards-on-release" "" CODER_FLEET_TEST_COMMAND=true
check R10 'no_edit && [ ! -s "$STUB_CALLS" ] && [ -z "$OUT" ]' "a branch push touched the board"
release "git push origin --delete v1.2.0" "" CODER_FLEET_TEST_COMMAND=true
check R11 'no_edit' "a tag delete closed a card"
release "$PUSH" " ! [rejected]        v1.2.0 -> v1.2.0 (already exists)" CODER_FLEET_TEST_COMMAND=true
check R12 'no_edit && log_has "reported a failure, so no card is closed"' "a rejected push closed a card"
release "git push origin v9.9.9" "" CODER_FLEET_TEST_COMMAND=true
check R13 'no_edit && log_has "whose subject does not start with v9.9.9"' "a tag on a non-release commit closed a card"
release "git push origin v1.3.0" "" CODER_FLEET_TEST_COMMAND=true
check R13b 'no_edit && log_has "Release v1.3.0 names no cards"' "a release naming no cards was not logged"

# --- the session-start listing -------------------------------------------------

GHBIN="$TMP/ghbin"; mkdir -p "$GHBIN"
cat > "$GHBIN/gh" <<'GH_EOF'
#!/usr/bin/env bash
# gh pr view N --json state --jq .state, answered from $GH_STATES ("N STATE"
# lines). GH_MODE=fail fails as an offline gh does; GH_MODE=hang hangs.
printf '%s\n' "$*" >> "$GH_CALLS"
case "${GH_MODE:-}" in
    fail) printf 'error connecting to api.github.com\n' >&2; exit 1 ;;
    hang) exec sleep 30 ;;
esac
awk -v n="$3" '$1 == n {print $2; found=1} END {exit !found}' "$GH_STATES"
GH_EOF
chmod +x "$GHBIN/gh"

# A PATH with no gh at all, for S04: the tools the hook and the stub use, linked.
NOGH="$TMP/nogh"; mkdir -p "$NOGH"
for t in bash env jq git awk sed tr grep cat head tail cut date mkdir mktemp rm sleep dirname basename cksum printf wc sort uniq mv python3 timeout gtimeout; do
    p="$(command -v "$t" 2>/dev/null)" && case "$p" in /*) ln -sf "$p" "$NOGH/$t" ;; esac
done

GH_STATES="$TMP/gh-states"
printf '11 MERGED\n12 OPEN\n13 MERGED\n' > "$GH_STATES"

# merged_cards [VAR=value ...] -> $RC, $OUT, the log in $LOG
merged_cards() {
    RC=0
    GH_CALLS="$TMP/gh-calls.$N"; : > "$GH_CALLS"
    jq -nc --arg c "$REPO" '{session_id:"s1", cwd:$c, hook_event_name:"SessionStart", source:"startup"}' \
      | env -u BOARD_DRY_RUN CODER_FLEET_BOARD=on CODER_FLEET_STATE_DIR="$STATE" BOARD_SHIM="$STUB" \
            STUB_CARDS="$STUB_CARDS" STUB_CALLS="$STUB_CALLS" BOARD_LOG_FILE="$LOG" \
            GH_STATES="$GH_STATES" GH_CALLS="$GH_CALLS" PATH="$GHBIN:$PATH" "$@" \
            "$MERGED" >"$TMP/out" 2>"$TMP/err" || RC=$?
    OUT="$(cat "$TMP/out")"
}
ctx() { printf '%s' "$OUT" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null; }

# S01: the fully ticked card whose PR merged is named, the one whose PR is open
# is not, and nothing moves.
fresh
card M-1 "In Progress" xx x "Sub-issue 1 of 1: ready to merge in PR #11. Done still needs: nothing."
card M-2 "In Progress" x x "Sub-issue 1 of 1: ready to merge in PR #12. Done still needs: nothing."
card M-6 "In Progress" x x "Sub-issue 1 of 2: ready to merge in PR #13." "Sub-issue 2 of 2: ready to merge in PR #12."
merged_cards
check S01a '[ "$RC" -eq 0 ] && ctx | grep -q "M-1 (PR #11)"' "the merged card is not named (rc $RC): $OUT $(cat "$TMP/err")"
check S01b '! ctx | grep -q "M-2" && ! ctx | grep -q "M-6"' "a card with an unmerged PR is named: $(ctx)"
check S01c '! grep -q "^edit \|^comment " "$STUB_CALLS"' "the session-start listing wrote to the board"
check S01d '[ "$(printf "%s" "$OUT" | jq -r .hookSpecificOutput.hookEventName)" = SessionStart ]' "the context is not SessionStart additionalContext"

# S02: an unticked card with a merged PR, and a ticked card naming no PR, are
# omitted, and gh is never asked about either.
fresh
card M-3 "In Progress" xo x "Sub-issue 1 of 1: ready to merge in PR #11."
card M-4 "In Progress" x x "Sub-issue 1 of 1: started."
card M-5 "Done" x x "Sub-issue 1 of 1: ready to merge in PR #11."
merged_cards
check S02 '[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ ! -s "$GH_CALLS" ]' "an unticked, unnamed or Done card reached gh or the context: $OUT"

# S03: nothing In Progress prints nothing.
fresh
merged_cards
check S03 '[ "$RC" -eq 0 ] && [ -z "$OUT" ]' "an empty column printed something"

# S04: no gh on PATH: nothing printed, the log says why, exit 0.
fresh
card M-1 "In Progress" x x "Sub-issue 1 of 1: ready to merge in PR #11."
RC=0
jq -nc --arg c "$REPO" '{cwd:$c, source:"startup"}' \
  | env -u BOARD_DRY_RUN CODER_FLEET_BOARD=on CODER_FLEET_STATE_DIR="$STATE" BOARD_SHIM="$STUB" \
        STUB_CARDS="$STUB_CARDS" STUB_CALLS="$STUB_CALLS" BOARD_LOG_FILE="$LOG" PATH="$NOGH" \
        "$NOGH/bash" "$MERGED" >"$TMP/out" 2>"$TMP/err" || RC=$?
check S04 '[ "$RC" -eq 0 ] && [ ! -s "$TMP/out" ] && log_has "gh is not installed"' "no gh: rc $RC, out $(cat "$TMP/out"), log $(cat "$LOG")"

# S05: gh failing, as offline: nothing printed, the log says why, one call only.
fresh
card M-1 "In Progress" x x "Sub-issue 1 of 1: ready to merge in PR #11."
card M-7 "In Progress" x x "Sub-issue 1 of 1: ready to merge in PR #13."
merged_cards GH_MODE=fail
check S05 '[ "$RC" -eq 0 ] && [ -z "$OUT" ] && log_has "gh is offline or unauthorised" && [ "$(wc -l < "$GH_CALLS" | tr -d " ")" = 1 ]' "a failing gh: rc $RC, out $OUT, calls $(cat "$GH_CALLS")"

# S06: gh hanging is cut off at CODER_FLEET_GH_TIMEOUT and the session goes on.
fresh
card M-1 "In Progress" x x "Sub-issue 1 of 1: ready to merge in PR #11."
start=$(date +%s)
merged_cards GH_MODE=hang CODER_FLEET_GH_TIMEOUT=1
took=$(( $(date +%s) - start ))
check S06 '[ "$RC" -eq 0 ] && [ -z "$OUT" ] && [ "$took" -lt 10 ] && log_has "gh is offline or unauthorised"' "a hanging gh: rc $RC after ${took}s"

# S07: work landed on the base branch without a pull request (CF-2.1). A card
# whose `landed on <base> at <sha>` commit is on the trunk is named, one whose
# commit is not is omitted, and gh is never asked about either.
fresh
LANDED_SHA="$(git -C "$REPO" rev-parse HEAD~1)"
git -C "$REPO" commit -q --allow-empty -m "off the trunk"
OFF_SHA="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" reset -q --hard HEAD~1
card L-1 "In Progress" x x "Sub-issue 1 of 1: ready to land on main at abc1234." "Sub-issue 1 of 1: landed on main at $LANDED_SHA. Done still needs: nothing."
card L-2 "In Progress" x x "Sub-issue 1 of 1: landed on main at $OFF_SHA. Done still needs: nothing."
merged_cards
check S07a '[ "$RC" -eq 0 ] && ctx | grep -q "L-1 (landed $LANDED_SHA)"' "the landed card is not named (rc $RC): $OUT $(cat "$TMP/err")"
check S07b '! ctx | grep -q "L-2"' "a card whose commit is not on the trunk is named: $(ctx)"
check S07c '[ ! -s "$GH_CALLS" ]' "gh was asked about a landed card: $(cat "$GH_CALLS")"

# --- wiring ----------------------------------------------------------------------

HJ="$HOOKS/hooks.json"
check W01a 'jq -e "[.hooks.PostToolUse[] | select(.matcher == \"Bash\") | .hooks[].command] | any(test(\"board-release-close.sh\"))" "$HJ" >/dev/null' "hooks.json does not run board-release-close.sh on PostToolUse Bash"
check W01b 'jq -e "[.hooks.SessionStart[].hooks[].command] | any(test(\"board-merged-cards.sh\"))" "$HJ" >/dev/null' "hooks.json does not run board-merged-cards.sh on SessionStart"
check W02 'grep -q "lib/gates.sh" "$RELEASE" && grep -q "lib/gates.sh" "$HOOKS/board-task-completed.sh"' "the two close hooks do not share lib/gates.sh"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
