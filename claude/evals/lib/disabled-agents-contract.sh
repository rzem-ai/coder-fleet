#!/usr/bin/env bash
#
# disabled-agents-contract.sh - a project that lists an agent under
# disabledAgents in .claude/coder-fleet.json never gets one from the Agent tool,
# and a project that lists nothing, or lists a core agent, gets today's fleet.
#
# CF-111. The hook is enforce-disabled-agents.sh, a PreToolUse hook on the Agent
# tool; the reading and validation it relies on live in hooks/lib/fleet-config.sh
# so a command script can reuse them. Both halves are held here: what a listed
# agent is denied, and everything that must not be denied - an unlisted agent, a
# different plugin's agent of the same name, a core agent listed by mistake, a
# missing or broken file. The file is read on every call, so a flip of the file
# between two calls changes the second decision with nothing restarted.
#
# The hook is driven through /bin/bash rather than its shebang, so on macOS the
# cases exercise bash 3.2, the oldest shell it must run under.
#
# Usage:  evals/lib/disabled-agents-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
HOOK="$PLUGIN_ROOT/hooks/enforce-disabled-agents.sh"
HELPER="$PLUGIN_ROOT/hooks/lib/fleet-config.sh"

command -v jq >/dev/null 2>&1 || {
    printf 'disabled-agents-contract: jq is needed to drive the hook\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/disabled-agents.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT
export CODER_FLEET_STATE_DIR="$TMP/state"
mkdir -p "$CODER_FLEET_STATE_DIR"

PROJECT="$TMP/project"
mkdir -p "$PROJECT/.claude" "$PROJECT/src/deep"
CONFIG="$PROJECT/.claude/coder-fleet.json"
# A real repository, because the hook finds the checkout through git, so a call
# from a subdirectory still reads the file at the top.
HAVE_GIT=0
if command -v git >/dev/null 2>&1 && git -C "$PROJECT" init -q . 2>/dev/null; then HAVE_GIT=1; fi

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"; return 0; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL  %s\n' "$1"; [ -n "${2:-}" ] && printf '        %s\n' "$2"; return 0; }

if [ ! -f "$HOOK" ]; then
    fail hook-exists "$HOOK does not exist"
    printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
    exit 1
fi

agent_event() {
    # $1 subagent_type ("" for none), $2 cwd, $3 tool name (default Agent)
    jq -nc --arg t "$1" --arg w "$2" --arg n "${3:-Agent}" \
        '{hook_event_name:"PreToolUse",tool_name:$n,cwd:$w,
          tool_input:({description:"d",prompt:"p"} + (if $t == "" then {} else {subagent_type:$t} end))}'
}

run_hook() {
    # $1 event; prints the hook's stdout. CLAUDE_PROJECT_DIR points somewhere
    # with no config, so a pass proves the hook read the cwd's checkout.
    printf '%s' "$1" | CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null
}

decision() {
    local out="$1"
    if [ -z "$out" ]; then printf 'allow\n'; else
        printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "allow"' 2>/dev/null || printf 'garbled\n'
    fi
}

expect() {
    # $1 want (allow|deny), $2 label, $3 subagent_type, [$4 cwd], [$5 tool]
    local out got
    out=$(run_hook "$(agent_event "$3" "${4:-$PROJECT}" "${5:-Agent}")")
    got=$(decision "$out")
    if [ "$got" = "$1" ]; then pass "$1 $2"; else fail "$2" "wanted $1, got $got: ${out:0:160}"; fi
}

reason_of() {
    printf '%s' "$1" | jq -r '.hookSpecificOutput.permissionDecisionReason // ""' 2>/dev/null
}

# The warning an invalid config produces: shown to the human and to the model.
warning_of() {
    printf '%s' "$1" | jq -r '[.systemMessage // "", .hookSpecificOutput.additionalContext // ""] | join(" ")' 2>/dev/null
}

set_config() { printf '%s' "$1" > "$CONFIG"; }

# --- no file: today's fleet --------------------------------------------------

rm -f "$CONFIG"
expect allow "no config file: refuter allowed" refuter
expect allow "no config file: coder-fleet:refuter allowed" coder-fleet:refuter
out=$(run_hook "$(agent_event refuter "$PROJECT")")
[ -z "$out" ] && pass "no config file: the hook prints nothing" || fail "no config file prints nothing" "$out"

set_config '{}'
expect allow "no disabledAgents key: refuter allowed" refuter
set_config '{"disabledAgents": []}'
expect allow "empty disabledAgents: refuter allowed" coder-fleet:refuter

# --- the refuter disabled ----------------------------------------------------

set_config '{"disabledAgents": ["refuter"]}'
expect deny "refuter listed: bare refuter denied" refuter
expect deny "refuter listed: coder-fleet:refuter denied" coder-fleet:refuter
expect allow "refuter listed: coder allowed" coder-fleet:coder
expect allow "refuter listed: reviewer allowed" reviewer
expect allow "refuter listed: scout allowed" coder-fleet:scout
expect allow "refuter listed: another plugin's refuter allowed" other-plugin:refuter
expect allow "refuter listed: a spawn with no subagent_type allowed" ""
expect allow "refuter listed: a Bash call is not the hook's business" refuter Bash
if [ "$HAVE_GIT" -eq 1 ]; then
    expect deny "refuter listed: a cwd in a subdirectory reads the checkout's config" refuter "$PROJECT/src/deep"
else
    printf '  skip  a cwd in a subdirectory (git is not on PATH)\n'
fi

out=$(run_hook "$(agent_event coder-fleet:refuter "$PROJECT")")
r=$(reason_of "$out")
if printf '%s' "$r" | grep -qF '.claude/coder-fleet.json' && printf '%s' "$r" | grep -qF 'refuter'; then
    pass "the deny names .claude/coder-fleet.json and the agent"
else
    fail "the deny names .claude/coder-fleet.json and the agent" "$r"
fi

set_config '{"disabledAgents": ["coder-fleet:refuter"]}'
expect deny "a prefixed name in the config disables the bare type" refuter
set_config '{"disabledAgents": ["  Refuter "]}'
expect deny "a name in the config is trimmed and read without case" coder-fleet:refuter
set_config '{"disabledAgents": ["refuter"], "somethingElse": true}'
expect deny "another top-level key does not invalidate the file" refuter
set_config '{"disabledAgents": [" coder-fleet:refuter"]}'
expect deny "a padded, prefixed name is trimmed before the prefix is dropped" refuter

# The subagent_type side reads case-blind too, prefix included.
set_config '{"disabledAgents": ["refuter"]}'
expect deny "refuter listed: Coder-Fleet:refuter denied" Coder-Fleet:refuter
expect deny "refuter listed: CODER-FLEET:REFUTER denied" CODER-FLEET:REFUTER
expect allow "refuter listed: Other-Plugin:Refuter allowed" Other-Plugin:Refuter

# --- general, not a refuter switch -------------------------------------------

set_config '{"disabledAgents": ["scout", "ui-designer"]}'
expect deny "scout listed: scout denied" coder-fleet:scout
expect deny "ui-designer listed: ui-designer denied" ui-designer
expect allow "scout listed: refuter allowed" refuter

# --- core agents cannot be disabled ------------------------------------------

for core in lead coder reviewer coder-fleet:coder Lead; do
    set_config "{\"disabledAgents\": [\"refuter\", \"$core\"]}"
    norm=$(printf '%s' "$core" | tr 'A-Z' 'a-z'); norm="${norm#coder-fleet:}"
    out=$(run_hook "$(agent_event "coder-fleet:$norm" "$PROJECT")")
    [ "$(decision "$out")" = allow ] && pass "$core listed: $norm still allowed" || fail "$core listed: $norm still allowed" "$out"
    w=$(warning_of "$out")
    if printf '%s' "$w" | grep -qi 'invalid' && printf '%s' "$w" | grep -qF '.claude/coder-fleet.json' && printf '%s' "$w" | grep -qF "$norm"; then
        pass "$core listed: the hook reports the config invalid, naming the file and $norm"
    else
        fail "$core listed: the hook reports the config invalid, naming the file and $norm" "$w"
    fi
    expect allow "$core listed: the invalid config honours nothing, so refuter is allowed" refuter
done

# --- a broken file honours nothing and says so -------------------------------

for bad in '{"disabledAgents": ["refuter"' '{"disabledAgents": "refuter"}' '["refuter"]' '{"disabledAgents": [1]}' '{"disabledAgents": ["re futer"]}' ''; do
    set_config "$bad"
    out=$(run_hook "$(agent_event refuter "$PROJECT")")
    w=$(warning_of "$out")
    if [ "$(decision "$out")" = allow ] && printf '%s' "$w" | grep -qi 'invalid'; then
        pass "invalid config ${bad:-<empty>}: allowed, reported invalid"
    else
        fail "invalid config ${bad:-<empty>}: allowed, reported invalid" "$out"
    fi
done

# Inputs the hook once honoured and review-round refused (CF-111 round 1):
# a multi-value stream, a leading byte order mark, a non-ASCII or control
# character in a name, and literals jq accepts but JSON does not. Each is
# invalid, so the refuter is allowed and the warning says so.
for bad in \
    '{"disabledAgents":["refuter"]} {"disabledAgents":["lead"]}' \
    '{"disabledAgents":["refuter"]} {"disabledAgents":["scout"]}' \
    "$(printf '\357\273\277{"disabledAgents": ["refuter"]}')" \
    "$(printf '{"disabledAgents": ["refuter", "\342\204\252eeper"]}')" \
    "$(printf '{"disabledAgents": ["refuter\302\205"]}')" \
    "$(printf '{"disabledAgents": ["refuter\357\273\277"]}')" \
    "$(printf '{"disabledAgents": ["refuter\302\240"]}')" \
    '{"disabledAgents": ["refuter\nx"]}' \
    '{"disabledAgents": ["refuter"], "x": NaN}'; do
    set_config "$bad"
    out=$(run_hook "$(agent_event refuter "$PROJECT")")
    w=$(warning_of "$out")
    if [ "$(decision "$out")" = allow ] && printf '%s' "$w" | grep -qi 'invalid'; then
        pass "invalid config $bad: allowed, reported invalid"
    else
        fail "invalid config $bad: allowed, reported invalid" "$out"
    fi
    if /bin/bash "$HOOK" --check "$PROJECT" >/dev/null 2>&1; then
        fail "--check fails on $bad" "exit 0"
    else
        pass "--check fails on $bad"
    fi
done
set_config "$(printf '\357\273\277{}')"
out=$(run_hook "$(agent_event refuter "$PROJECT")")
printf '%s' "$(warning_of "$out")" | grep -qi 'byte order mark' \
    && pass "a leading byte order mark is named in the warning" \
    || fail "a leading byte order mark is named in the warning" "$out"

# A directory where the file should be cannot be read, and says so.
rm -f "$CONFIG"; mkdir "$CONFIG"
got=$(/bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s" "$FLEET_CONFIG_STATE"' _ "$HELPER" "$PROJECT")
[ "$got" = unreadable ] && pass "a directory at the config path is unreadable" || fail "a directory at the config path is unreadable" "$got"
expect allow "a directory at the config path: refuter allowed" refuter
rmdir "$CONFIG"

# --- read on every call: a flip takes effect on the next spawn ---------------

set_config '{"disabledAgents": ["refuter"]}'
expect deny "flip 1: refuter listed, denied" refuter
set_config '{}'
expect allow "flip 2: entry removed, the next call is allowed" refuter
set_config '{"disabledAgents": ["refuter"]}'
expect deny "flip 3: entry restored, the next call is denied again" refuter
rm -f "$CONFIG"
expect allow "flip 4: file deleted, the next call is allowed" refuter
[ -z "$(ls -A "$CODER_FLEET_STATE_DIR" 2>/dev/null | grep -v '^log$')" ] \
    && pass "the hook keeps no cache in the state directory" \
    || fail "the hook keeps no cache in the state directory" "$(ls -A "$CODER_FLEET_STATE_DIR")"

# --- the main checkout's file, never a linked worktree's ---------------------
#
# A branch under review lives in a linked worktree, and its copy of the file
# must not decide what the project disables: the file read is always the one
# in the repository's main worktree, uncommitted edits included.

if [ "$HAVE_GIT" -eq 1 ] && git -C "$PROJECT" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init 2>/dev/null \
    && git -C "$PROJECT" worktree add -q "$TMP/linked" -b linked 2>/dev/null; then
    LINKED="$TMP/linked"
    mkdir -p "$LINKED/.claude" "$LINKED/src"
    set_config '{"disabledAgents": ["refuter"]}'
    printf '%s' '{}' > "$LINKED/.claude/coder-fleet.json"
    expect deny "main disables the refuter, the linked worktree does not: a call from the linked worktree is denied" refuter "$LINKED"
    expect deny "and from a subdirectory of the linked worktree" refuter "$LINKED/src"
    set_config '{}'
    printf '%s' '{"disabledAgents": ["refuter"]}' > "$LINKED/.claude/coder-fleet.json"
    expect allow "the linked worktree disables the refuter, main does not: allowed" refuter "$LINKED"
    rm -f "$CONFIG"
    expect allow "the linked worktree disables the refuter, main has no file: allowed" refuter "$LINKED"
    out=$(run_hook "$(agent_event refuter "$LINKED")")
    [ -z "$out" ] && pass "main has no file: the linked worktree's file is not even read" || fail "main has no file: the linked worktree's file is not even read" "$out"
    printf '%s' '{"disabledAgents": ["reviewer"]}' > "$LINKED/.claude/coder-fleet.json"
    if out=$(/bin/bash "$HOOK" --check "$LINKED" 2>&1); then
        pass "--check from a linked worktree reads main's file, not the linked worktree's invalid one"
    else
        fail "--check from a linked worktree reads main's file, not the linked worktree's invalid one" "$out"
    fi
    set_config '{"disabledAgents": ["lead"]}'
    printf '%s' '{}' > "$LINKED/.claude/coder-fleet.json"
    if /bin/bash "$HOOK" --check "$LINKED" >/dev/null 2>&1; then
        fail "--check from a linked worktree fails on main's invalid file" "exit 0"
    else
        pass "--check from a linked worktree fails on main's invalid file"
    fi
    got=$(/bin/bash -c '. "$1"; fleet_config_root "$2"' _ "$HELPER" "$LINKED/src")
    want=$(cd "$PROJECT" && pwd -P)
    [ "$got" = "$want" ] && pass "fleet_config_root names the main worktree from inside a linked one" || fail "fleet_config_root names the main worktree from inside a linked one" "got $got, want $want"
    rm -f "$CONFIG"
elif [ "$HAVE_GIT" -eq 1 ]; then
    fail "linked worktree fixture" "git could not commit or add a worktree in $PROJECT"
else
    printf '  skip  linked worktree cases (git is not on PATH)\n'
fi

# --- the helper, sourced on its own ------------------------------------------

set_config '{"disabledAgents": ["coder-fleet:Refuter", "scout"]}'
got=$(/bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED"' _ "$HELPER" "$PROJECT")
[ "$got" = "ok|refuter scout" ] && pass "the helper sources alone and normalises names" || fail "the helper sources alone and normalises names" "$got"
got=$(/bin/bash -c '. "$1"; fleet_config_read "$2"; fleet_agent_disabled coder-fleet:scout && echo yes || echo no' _ "$HELPER" "$PROJECT")
[ "$got" = yes ] && pass "fleet_agent_disabled answers for a prefixed type" || fail "fleet_agent_disabled answers for a prefixed type" "$got"

# --- the check mode check-all runs ------------------------------------------

rm -f "$CONFIG"
if out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); then pass "--check passes with no file"; else fail "--check passes with no file" "$out"; fi
set_config '{"disabledAgents": ["refuter"]}'
if out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1) && printf '%s' "$out" | grep -qF refuter; then
    pass "--check passes on a valid file and names what it disables"
else
    fail "--check passes on a valid file and names what it disables" "$out"
fi
set_config '{"disabledAgents": ["reviewer"]}'
if out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); then
    fail "--check fails when a core agent is listed" "exit 0: $out"
elif printf '%s' "$out" | grep -qF reviewer && printf '%s' "$out" | grep -qF '.claude/coder-fleet.json'; then
    pass "--check fails when a core agent is listed, naming it and the file"
else
    fail "--check fails when a core agent is listed, naming it and the file" "$out"
fi

# --- registration ------------------------------------------------------------

registered=$(jq -r '[ .hooks.PreToolUse[]?
    | select((.matcher // "") | test("(^|\\|)Agent(\\||$)"))
    | .hooks[]? | .command | select(endswith("hooks/enforce-disabled-agents.sh\"")) ] | length > 0' \
    "$PLUGIN_ROOT/hooks/hooks.json" 2>/dev/null)
[ "$registered" = true ] && pass "hooks.json registers the hook on PreToolUse for Agent" \
    || fail "hooks.json registers the hook on PreToolUse for Agent"
[ -x "$HOOK" ] && pass "the hook is executable" || fail "the hook is executable" "$HOOK"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'A disabled agent can still be spawned, or a project that disabled nothing has lost one.\n'
    exit 1
fi
printf 'A listed agent is denied by name, core agents cannot be listed, and the file is read on every call.\n'
