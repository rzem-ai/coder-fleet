#!/usr/bin/env bash
#
# agents-command-contract.sh - /coder-fleet:agents lists, enables and disables
# fleet agents by editing .claude/coder-fleet.json, and never breaks the file.
#
# CF-111.1. The command markdown runs scripts/fleet-agents.sh, which does the
# edit; the model never rewrites the file. The script reads and validates the
# file through hooks/lib/fleet-config.sh, the same reading the spawn hook uses,
# so what this suite writes is checked with that reading and with the hook
# itself: a refuter the command disables is a refuter the hook denies.
#
# Every refusal - a core agent, a name not on the roster, an invalid file - is
# checked byte for byte against a copy taken before the call.
#
# Driven through /bin/bash, so on macOS the cases exercise bash 3.2.
#
# Usage:  evals/lib/agents-command-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)
SCRIPT="$PLUGIN_ROOT/scripts/fleet-agents.sh"
COMMAND_MD="$PLUGIN_ROOT/commands/agents.md"
HOOK="$PLUGIN_ROOT/hooks/enforce-disabled-agents.sh"
HELPER="$PLUGIN_ROOT/hooks/lib/fleet-config.sh"

command -v jq >/dev/null 2>&1 || {
    printf 'agents-command-contract: jq is needed to read what the script writes\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/agents-command.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT
export CODER_FLEET_STATE_DIR="$TMP/state"
mkdir -p "$CODER_FLEET_STATE_DIR"

PROJECT="$TMP/project"
mkdir -p "$PROJECT/src/deep"
CONFIG="$PROJECT/.claude/coder-fleet.json"
HAVE_GIT=0
if command -v git >/dev/null 2>&1 && git -C "$PROJECT" init -q . 2>/dev/null; then HAVE_GIT=1; fi

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"; return 0; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; return 0; }

if [ ! -f "$SCRIPT" ]; then
    fail script-exists "$SCRIPT does not exist"
    printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
    exit 1
fi

# The roster, read the way roster-contract.sh reads it: one agent per body
# under agents/, with any -fable editor variant folded into its base name.
ROSTER=$(for f in "$PLUGIN_ROOT"/agents/*.md; do b=$(basename "$f" .md); printf '%s\n' "${b%-fable}"; done | sort -u)

OUT=""
CODE=0
fa() {
    # Runs the script from $PROJECT (or $FA_CWD) with the given arguments.
    OUT=$(cd "${FA_CWD:-$PROJECT}" && /bin/bash "$SCRIPT" "$@" 2>&1)
    CODE=$?
}

disabled_list() { jq -c '.disabledAgents' "$CONFIG" 2>/dev/null; }
set_config() { mkdir -p "$PROJECT/.claude"; printf '%s' "$1" > "$CONFIG"; }
snapshot() { if [ -e "$CONFIG" ]; then cp -p "$CONFIG" "$TMP/before"; else rm -f "$TMP/before"; fi; }
unchanged() {
    if [ -e "$TMP/before" ]; then cmp -s "$TMP/before" "$CONFIG"; else [ ! -e "$CONFIG" ]; fi
}
says() { printf '%s' "$OUT" | grep -qiF -- "$1"; }

hook_decision() {
    local out
    out=$(jq -nc --arg t "$1" --arg w "$PROJECT" \
        '{hook_event_name:"PreToolUse",tool_name:"Agent",cwd:$w,tool_input:{description:"d",prompt:"p",subagent_type:$t}}' \
        | /bin/bash "$HOOK" 2>/dev/null)
    if [ -z "$out" ]; then printf 'allow\n'; else
        printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "allow"' 2>/dev/null
    fi
}

# --- #3: no argument lists the roster ----------------------------------------

rm -rf "$PROJECT/.claude"
fa
[ "$CODE" -eq 0 ] && pass "list with no file exits 0" || fail "list with no file exits 0" "exit $CODE: $OUT"
missing=""
for a in $ROSTER; do
    printf '%s\n' "$OUT" | grep -qE "^[[:space:]]*$a[[:space:]]+enabled" || missing="$missing $a"
done
[ -z "$missing" ] && pass "list names every roster agent as enabled" || fail "list names every roster agent as enabled" "missing:$missing; got: $OUT"
printf '%s' "$OUT" | grep -qF -- '-fable' && fail "list folds -fable variants into their base agent" "$OUT" || pass "list folds -fable variants into their base agent"
[ ! -e "$CONFIG" ] && pass "list does not create the file" || fail "list does not create the file"
fa list
[ "$CODE" -eq 0 ] && pass "'list' is the same as no argument" || fail "'list' is the same as no argument" "exit $CODE: $OUT"

# --- #1: disable creates the file and stores the name bare -------------------

fa disable refuter
[ "$CODE" -eq 0 ] && pass "disable refuter with no file exits 0" || fail "disable refuter with no file exits 0" "exit $CODE: $OUT"
[ "$(disabled_list)" = '["refuter"]' ] && pass "disable creates the file with refuter listed" || fail "disable creates the file with refuter listed" "$(cat "$CONFIG" 2>&1)"
# #6: the output says when it applies.
says "next spawn" && says "no restart" && pass "a toggle says it applies from the next spawn with no restart" \
    || fail "a toggle says it applies from the next spawn with no restart" "$OUT"
says "commit" && pass "a toggle says the file is not committed" || fail "a toggle says the file is not committed" "$OUT"
got=$(/bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED"' _ "$HELPER" "$PROJECT")
[ "$got" = "ok|refuter" ] && pass "the shared reading accepts what the script wrote" || fail "the shared reading accepts what the script wrote" "$got"
[ "$(hook_decision coder-fleet:refuter)" = deny ] && pass "the spawn hook denies the refuter the command disabled" || fail "the spawn hook denies the refuter the command disabled"
[ "$(hook_decision scout)" = allow ] && pass "the spawn hook still allows scout" || fail "the spawn hook still allows scout"
leftover=$(ls -A "$PROJECT/.claude" | grep -vx 'coder-fleet.json')
[ -z "$leftover" ] && pass "the write leaves no temporary file behind" || fail "the write leaves no temporary file behind" "$leftover"

fa disable coder-fleet:Scout
[ "$CODE" -eq 0 ] && [ "$(disabled_list)" = '["refuter","scout"]' ] \
    && pass "a coder-fleet:-prefixed, mixed-case name is stored bare and the list stays sorted" \
    || fail "a coder-fleet:-prefixed, mixed-case name is stored bare and the list stays sorted" "exit $CODE: $(cat "$CONFIG")"

# Hand-formatted, so a no-op that rewrote the file through jq would show.
set_config '{"disabledAgents":["refuter","scout"]}'
snapshot
fa disable refuter
[ "$CODE" -eq 0 ] && says "already disabled" && unchanged \
    && pass "disabling a disabled agent is a no-op that says so and leaves the file alone" \
    || fail "disabling a disabled agent is a no-op that says so and leaves the file alone" "exit $CODE: $OUT"

set_config '{"other": {"keep": [1, 2]}, "disabledAgents": ["Scout", "scout", "coder-fleet:tech-writer"]}'
fa disable refuter
[ "$CODE" -eq 0 ] && [ "$(jq -c '.other' "$CONFIG")" = '{"keep":[1,2]}' ] \
    && pass "another top-level key survives an edit" || fail "another top-level key survives an edit" "$(cat "$CONFIG")"
[ "$(disabled_list)" = '["refuter","scout","tech-writer"]' ] \
    && pass "an edit leaves the list normalised, sorted and deduplicated" || fail "an edit leaves the list normalised, sorted and deduplicated" "$(disabled_list)"

if [ "$HAVE_GIT" -eq 1 ]; then
    set_config '{"disabledAgents": []}'
    FA_CWD="$PROJECT/src/deep" fa disable scout
    [ "$CODE" -eq 0 ] && [ "$(disabled_list)" = '["scout"]' ] && [ ! -e "$PROJECT/src/deep/.claude" ] \
        && pass "run from a subdirectory, it edits the checkout's file" \
        || fail "run from a subdirectory, it edits the checkout's file" "exit $CODE: $OUT"
else
    printf '  skip  run from a subdirectory (git is not on PATH)\n'
fi

# Run from a linked worktree, it edits the main checkout's file - the one the
# spawn hook and review-round read - and leaves the linked worktree's copy alone.
if [ "$HAVE_GIT" -eq 1 ]; then
    if git -C "$PROJECT" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init 2>/dev/null \
        && git -C "$PROJECT" worktree add -q "$TMP/linked" -b linked 2>/dev/null; then
        LINKED="$TMP/linked"
        mkdir -p "$LINKED/.claude" "$LINKED/src"
        printf '%s' '{"disabledAgents":["tech-writer"]}' > "$LINKED/.claude/coder-fleet.json"
        cp -p "$LINKED/.claude/coder-fleet.json" "$TMP/linked-before"
        set_config '{"disabledAgents": []}'
        FA_CWD="$LINKED/src" fa disable scout
        [ "$CODE" -eq 0 ] && [ "$(disabled_list)" = '["scout"]' ] \
            && pass "run from a linked worktree, disable edits the main checkout's file" \
            || fail "run from a linked worktree, disable edits the main checkout's file" "exit $CODE: $OUT; main: $(cat "$CONFIG")"
        cmp -s "$TMP/linked-before" "$LINKED/.claude/coder-fleet.json" \
            && pass "and leaves the linked worktree's copy byte for byte" \
            || fail "and leaves the linked worktree's copy byte for byte" "$(cat "$LINKED/.claude/coder-fleet.json")"
        FA_CWD="$LINKED" fa
        printf '%s\n' "$OUT" | grep -qE '^[[:space:]]*scout[[:space:]]+disabled' && printf '%s\n' "$OUT" | grep -qE '^[[:space:]]*tech-writer[[:space:]]+enabled' \
            && pass "list from a linked worktree reports the main checkout's file" \
            || fail "list from a linked worktree reports the main checkout's file" "$OUT"
        rm -rf "$LINKED/.claude"
    else
        fail "linked worktree fixture" "git could not commit or add a worktree in $PROJECT"
    fi
else
    printf '  skip  run from a linked worktree (git is not on PATH)\n'
fi

# Outside any repository there is no main checkout, so nothing is read or
# written - never a file in the cwd.
NOGIT="$TMP/nogit"
mkdir -p "$NOGIT"
if [ "$HAVE_GIT" -eq 1 ] && ! git -C "$NOGIT" rev-parse --git-dir >/dev/null 2>&1; then
    FA_CWD="$NOGIT" fa disable scout
    [ "$CODE" -eq 1 ] && [ ! -e "$NOGIT/.claude" ] && says "main checkout" \
        && pass "outside any repository, disable refuses and creates nothing" \
        || fail "outside any repository, disable refuses and creates nothing" "exit $CODE: $OUT"
else
    printf '  skip  outside any repository (git missing, or %s is inside one)\n' "$NOGIT"
fi

# --- #3 again: the list shows state -------------------------------------------

set_config '{"disabledAgents": ["refuter", "retired-agent"]}'
fa
printf '%s\n' "$OUT" | grep -qE '^[[:space:]]*refuter[[:space:]]+disabled' && pass "list shows refuter disabled" || fail "list shows refuter disabled" "$OUT"
printf '%s\n' "$OUT" | grep -qE '^[[:space:]]*scout[[:space:]]+enabled' && pass "list shows scout enabled" || fail "list shows scout enabled" "$OUT"
printf '%s\n' "$OUT" | grep -qE '^[[:space:]]*coder[[:space:]]+enabled.*core' && pass "list marks coder as core" || fail "list marks coder as core" "$OUT"
says "retired-agent" && pass "list names a disabled entry that is not on the roster" || fail "list names a disabled entry that is not on the roster" "$OUT"

# --- #2: enable ----------------------------------------------------------------

set_config '{"disabledAgents": ["refuter", "scout"], "other": true}'
fa enable coder-fleet:refuter
[ "$CODE" -eq 0 ] && [ "$(disabled_list)" = '["scout"]' ] && [ "$(jq -c '.other' "$CONFIG")" = true ] \
    && pass "enable removes the agent and keeps the rest" || fail "enable removes the agent and keeps the rest" "exit $CODE: $(cat "$CONFIG")"
says "next spawn" && says "no restart" && pass "enable says it applies from the next spawn with no restart" \
    || fail "enable says it applies from the next spawn with no restart" "$OUT"
[ "$(hook_decision refuter)" = allow ] && pass "the spawn hook allows the refuter once enabled" || fail "the spawn hook allows the refuter once enabled"

set_config '{"disabledAgents":["scout"],"other":true}'
snapshot
fa enable refuter
[ "$CODE" -eq 0 ] && says "not disabled" && unchanged \
    && pass "enabling an agent that is not disabled is a no-op that says so" \
    || fail "enabling an agent that is not disabled is a no-op that says so" "exit $CODE: $OUT"

fa enable scout
[ "$CODE" -eq 0 ] && [ "$(disabled_list)" = '[]' ] && jq -e . "$CONFIG" >/dev/null 2>&1 \
    && pass "enabling the last agent leaves valid JSON with an empty list" \
    || fail "enabling the last agent leaves valid JSON with an empty list" "exit $CODE: $(cat "$CONFIG")"
/bin/bash "$HOOK" --check "$PROJECT" >/dev/null 2>&1 && pass "the file passes the hook's --check after the last enable" || fail "the file passes the hook's --check after the last enable"

rm -rf "$PROJECT/.claude"
fa enable refuter
[ "$CODE" -eq 0 ] && says "not disabled" && [ ! -e "$CONFIG" ] \
    && pass "enable with no file is a no-op and creates nothing" || fail "enable with no file is a no-op and creates nothing" "exit $CODE: $OUT"

set_config '{"disabledAgents": ["retired-agent"]}'
fa enable retired-agent
[ "$CODE" -eq 0 ] && [ "$(disabled_list)" = '[]' ] \
    && pass "enable removes a listed name even when it is no longer on the roster" \
    || fail "enable removes a listed name even when it is no longer on the roster" "exit $CODE: $OUT"

# --- #4: refusals leave the file byte for byte ---------------------------------

set_config '{ "disabledAgents" : [ "refuter" ] ,"x":1 }'
for name in lead coder reviewer coder-fleet:Coder; do
    snapshot
    fa disable "$name"
    [ "$CODE" -eq 1 ] && says "cannot be disabled" && unchanged \
        && pass "disable $name is refused and the file is unchanged" \
        || fail "disable $name is refused and the file is unchanged" "exit $CODE: $OUT"
done
# Two neighbouring roster names as one argument: a membership test on a
# space-separated list would match it, and the file would gain both names.
PAIR=$(printf '%s\n' $ROSTER | sed -n '1,2p' | tr '\n' ' ' | sed 's/ $//')
for name in frobnicator other-plugin:refuter '../refuter' 're futer' "$PAIR"; do
    snapshot
    fa disable "$name"
    [ "$CODE" -eq 1 ] && says "not a fleet agent" && unchanged \
        && pass "disable '$name' is refused as not on the roster and the file is unchanged" \
        || fail "disable '$name' is refused as not on the roster and the file is unchanged" "exit $CODE: $OUT"
done
snapshot
fa enable frobnicator
[ "$CODE" -eq 1 ] && says "not a fleet agent" && unchanged \
    && pass "enable of a name neither listed nor on the roster is refused" \
    || fail "enable of a name neither listed nor on the roster is refused" "exit $CODE: $OUT"

rm -rf "$PROJECT/.claude"
snapshot
fa disable reviewer
[ "$CODE" -eq 1 ] && [ ! -e "$CONFIG" ] && [ ! -e "$PROJECT/.claude" ] \
    && pass "a refused disable with no file creates nothing" || fail "a refused disable with no file creates nothing" "exit $CODE: $OUT"

# --- an invalid file is never overwritten --------------------------------------

for bad in '{"disabledAgents": ["refuter"' '{"disabledAgents": ["lead"]}' '{"disabledAgents": "scout"}' '["refuter"]' ''; do
    for verb in disable enable; do
        set_config "$bad"
        snapshot
        fa "$verb" scout
        [ "$CODE" -eq 1 ] && says "invalid" && unchanged \
            && pass "$verb on an invalid file (${bad:-<empty>}) is refused and the file is unchanged" \
            || fail "$verb on an invalid file (${bad:-<empty>}) is refused and the file is unchanged" "exit $CODE: $OUT"
    done
done
set_config '{"disabledAgents": ["lead"]}'
fa
[ "$CODE" -eq 1 ] && says "invalid" && says "lead" \
    && pass "list on an invalid file says why and exits 1" || fail "list on an invalid file says why and exits 1" "exit $CODE: $OUT"

# --- usage ---------------------------------------------------------------------

set_config '{"disabledAgents": ["refuter"]}'
snapshot
fa toggle refuter
[ "$CODE" -eq 2 ] && unchanged && pass "an unknown verb is a usage error" || fail "an unknown verb is a usage error" "exit $CODE: $OUT"
fa disable
[ "$CODE" -eq 2 ] && unchanged && pass "disable with no name is a usage error" || fail "disable with no name is a usage error" "exit $CODE: $OUT"
fa disable refuter scout
[ "$CODE" -eq 2 ] && unchanged && pass "disable with two names is a usage error" || fail "disable with two names is a usage error" "exit $CODE: $OUT"

# --- the command and its documentation -----------------------------------------

[ -x "$SCRIPT" ] && pass "the script is executable" || fail "the script is executable"
if [ -f "$COMMAND_MD" ]; then
    grep -qF '"${CLAUDE_PLUGIN_ROOT}/scripts/fleet-agents.sh"' "$COMMAND_MD" && pass "the command runs the script through CLAUDE_PLUGIN_ROOT" || fail "the command runs the script through CLAUDE_PLUGIN_ROOT"
    grep -qF '$ARGUMENTS' "$COMMAND_MD" && pass "the command passes its arguments" || fail "the command passes its arguments"
    sed -n '2,/^---$/p' "$COMMAND_MD" | grep -q '^description:' && pass "the command has a description" || fail "the command has a description"
else
    fail "the command exists" "$COMMAND_MD"
fi
grep -qF '/coder-fleet:agents' "$REPO_ROOT/README.md" && pass "README documents /coder-fleet:agents" || fail "README documents /coder-fleet:agents"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf '/coder-fleet:agents can write a file the fleet misreads, or change one it should have refused.\n'
    exit 1
fi
printf '/coder-fleet:agents edits only through the shared validation, refuses without touching the file, and says when a toggle applies.\n'
