#!/usr/bin/env bash
#
# disabled-agents-contract.sh - a project that lists an agent under
# disabledAgents in .claude/coder-fleet.json never gets one from the Agent tool,
# and a project that lists nothing, or lists a core agent, gets today's fleet.
#
# The hook is enforce-disabled-agents.sh, a PreToolUse hook on the Agent
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
    # $1 event; prints the hook's stdout. CLAUDE_PROJECT_DIR is $TMP/elsewhere,
    # which is never created: the hook ignores a CLAUDE_PROJECT_DIR that is not
    # a directory and starts from the event's cwd, so every case through here
    # exercises the cwd fallback. Creating $TMP/elsewhere would make the hook
    # start there instead, find no repository, and turn these cases unresolved.
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
expect allow "no config file: researcher allowed" researcher
expect allow "no config file: coder-fleet:researcher allowed" coder-fleet:researcher
out=$(run_hook "$(agent_event researcher "$PROJECT")")
[ -z "$out" ] && pass "no config file: the hook prints nothing" || fail "no config file prints nothing" "$out"

set_config '{}'
expect allow "no disabledAgents key: researcher allowed" researcher
set_config '{"disabledAgents": []}'
expect allow "empty disabledAgents: researcher allowed" coder-fleet:researcher

# --- the researcher disabled ----------------------------------------------------

set_config '{"disabledAgents": ["researcher"]}'
expect deny "researcher listed: bare researcher denied" researcher
expect deny "researcher listed: coder-fleet:researcher denied" coder-fleet:researcher
expect allow "researcher listed: coder allowed" coder-fleet:coder
expect allow "researcher listed: reviewer allowed" reviewer
expect allow "researcher listed: scout allowed" coder-fleet:scout
expect allow "researcher listed: another plugin's researcher allowed" other-plugin:researcher
expect allow "researcher listed: a spawn with no subagent_type allowed" ""
expect allow "researcher listed: a Bash call is not the hook's business" researcher Bash
if [ "$HAVE_GIT" -eq 1 ]; then
    expect deny "researcher listed: a cwd in a subdirectory reads the checkout's config" researcher "$PROJECT/src/deep"
else
    printf '  skip  a cwd in a subdirectory (git is not on PATH)\n'
fi

out=$(run_hook "$(agent_event coder-fleet:researcher "$PROJECT")")
r=$(reason_of "$out")
if grep -qF '.claude/coder-fleet.json' <<<"$r" && grep -qF 'researcher' <<<"$r"; then
    pass "the deny names .claude/coder-fleet.json and the agent"
else
    fail "the deny names .claude/coder-fleet.json and the agent" "$r"
fi

set_config '{"disabledAgents": ["coder-fleet:researcher"]}'
expect deny "a prefixed name in the config disables the bare type" researcher
set_config '{"disabledAgents": ["  Researcher "]}'
expect deny "a name in the config is trimmed and read without case" coder-fleet:researcher
set_config '{"disabledAgents": ["researcher"], "somethingElse": true}'
expect deny "another top-level key does not invalidate the file" researcher
set_config '{"disabledAgents": [" coder-fleet:researcher"]}'
expect deny "a padded, prefixed name is trimmed before the prefix is dropped" researcher

# The subagent_type side reads case-blind too, prefix included.
set_config '{"disabledAgents": ["researcher"]}'
expect deny "researcher listed: Coder-Fleet:researcher denied" Coder-Fleet:researcher
expect deny "researcher listed: CODER-FLEET:RESEARCHER denied" CODER-FLEET:RESEARCHER
expect allow "researcher listed: Other-Plugin:Researcher allowed" Other-Plugin:Researcher

# --- general, not a researcher switch -------------------------------------------

set_config '{"disabledAgents": ["scout", "ui-designer"]}'
expect deny "scout listed: scout denied" coder-fleet:scout
expect deny "ui-designer listed: ui-designer denied" ui-designer
expect allow "scout listed: researcher allowed" researcher

# --- core agents cannot be disabled ------------------------------------------

for core in lead coder reviewer coder-fleet:coder Lead; do
    set_config "{\"disabledAgents\": [\"researcher\", \"$core\"]}"
    norm=$(printf '%s' "$core" | tr 'A-Z' 'a-z'); norm="${norm#coder-fleet:}"
    out=$(run_hook "$(agent_event "coder-fleet:$norm" "$PROJECT")")
    [ "$(decision "$out")" = allow ] && pass "$core listed: $norm still allowed" || fail "$core listed: $norm still allowed" "$out"
    w=$(warning_of "$out")
    if grep -qi 'invalid' <<<"$w" && grep -qF '.claude/coder-fleet.json' <<<"$w" && grep -qF "$norm" <<<"$w"; then
        pass "$core listed: the hook reports the config invalid, naming the file and $norm"
    else
        fail "$core listed: the hook reports the config invalid, naming the file and $norm" "$w"
    fi
    expect allow "$core listed: the invalid config honours nothing, so researcher is allowed" researcher
done

# --- a broken file honours nothing and says so -------------------------------

for bad in '{"disabledAgents": ["researcher"' '{"disabledAgents": "researcher"}' '["researcher"]' '{"disabledAgents": [1]}' '{"disabledAgents": ["re futer"]}' ''; do
    set_config "$bad"
    out=$(run_hook "$(agent_event researcher "$PROJECT")")
    w=$(warning_of "$out")
    if [ "$(decision "$out")" = allow ] && grep -qi 'invalid' <<<"$w"; then
        pass "invalid config ${bad:-<empty>}: allowed, reported invalid"
    else
        fail "invalid config ${bad:-<empty>}: allowed, reported invalid" "$out"
    fi
done

# Inputs a lax reader would honour and review-round refuses:
# a multi-value stream, a leading byte order mark, a non-ASCII or control
# character in a name, and literals jq accepts but JSON does not. Each is
# invalid, so the researcher is allowed and the warning says so.
for bad in \
    '{"disabledAgents":["researcher"]} {"disabledAgents":["lead"]}' \
    '{"disabledAgents":["researcher"]} {"disabledAgents":["scout"]}' \
    "$(printf '\357\273\277{"disabledAgents": ["researcher"]}')" \
    "$(printf '{"disabledAgents": ["researcher", "\342\204\252eeper"]}')" \
    "$(printf '{"disabledAgents": ["researcher\302\205"]}')" \
    "$(printf '{"disabledAgents": ["researcher\357\273\277"]}')" \
    "$(printf '{"disabledAgents": ["researcher\302\240"]}')" \
    '{"disabledAgents": ["researcher\nx"]}' \
    '{"disabledAgents": ["researcher"], "x": NaN}'; do
    set_config "$bad"
    out=$(run_hook "$(agent_event researcher "$PROJECT")")
    w=$(warning_of "$out")
    if [ "$(decision "$out")" = allow ] && grep -qi 'invalid' <<<"$w"; then
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
# Inputs jq 1.6 honours and JSON.parse refuses, which the shell refuses too
# because it parses with python3's json module: number forms, raw control
# characters inside a string or key, bytes after the value that are not JSON
# whitespace, and nesting past 64 levels. Each is invalid to the hook and to
# --check, as it is to review-round.
deep="$(printf '%*s' 65 '' | tr ' ' '[')$(printf '%*s' 65 '' | tr ' ' ']')"
for bad in \
    '{"disabledAgents":["researcher"],"x":01}' \
    '{"disabledAgents":["researcher"],"x":1.}' \
    '{"disabledAgents":["researcher"],"x":.5}' \
    '{"disabledAgents":["researcher"],"x":+1}' \
    '{"disabledAgents":["researcher"],"x":-01}' \
    '{"disabledAgents":["researcher"],"x":1.e5}' \
    '{"disabledAgents":["researcher"],"x":00}' \
    "$(printf '{"disabledAgents":["researcher"],"x":"a\tb"}')" \
    "$(printf '{"disabledAgents":["researcher"],"a\nb":1}')" \
    "$(printf '{"disabledAgents":["researcher"]}\f')" \
    "$(printf '{"disabledAgents":["researcher"]}\v')" \
    "{\"disabledAgents\":[\"researcher\"],\"x\":$deep}"; do
    set_config "$bad"
    out=$(run_hook "$(agent_event researcher "$PROJECT")")
    w=$(warning_of "$out")
    if [ "$(decision "$out")" = allow ] && grep -qi 'invalid' <<<"$w"; then
        pass "strict JSON: $bad allowed, reported invalid"
    else
        fail "strict JSON: $bad allowed, reported invalid" "$out"
    fi
    if /bin/bash "$HOOK" --check "$PROJECT" >/dev/null 2>&1; then
        fail "--check fails on $bad" "exit 0"
    else
        pass "--check fails on $bad"
    fi
done
# And what JSON allows still reads: its own whitespace around the value, every
# number form it has, and an integer longer than python's 4300-digit default.
for good in \
    "$(printf '\n\t {"disabledAgents":["researcher"]}\r\n\t ')" \
    '{"disabledAgents":["researcher"],"x":-0.5e+10,"y":-0,"z":1E-2,"w":1e400}' \
    "{\"disabledAgents\":[\"researcher\"],\"x\":$(printf '%*s' 5000 '' | tr ' ' '7')}"; do
    set_config "$good"
    expect deny "strict JSON still reads $(printf '%s' "$good" | cut -c1-60)" researcher
done

# No python3, no parsing: the file is invalid, nothing is honoured, and the
# reason names python3. PATH keeps every other tool the hook uses.
NOPY="$TMP/nopy-bin"
mkdir -p "$NOPY"
old_ifs=$IFS; IFS=:
for d in $PATH; do
    [ -d "$d" ] || continue
    for f in "$d"/*; do
        b=$(basename "$f")
        case "$b" in python3*|python) continue ;; esac
        [ -x "$f" ] && [ ! -e "$NOPY/$b" ] && ln -s "$f" "$NOPY/$b" 2>/dev/null
    done
done
IFS=$old_ifs
set_config '{"disabledAgents": ["researcher"]}'
got=$(PATH="$NOPY" /bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED" "$FLEET_CONFIG_REASON"' _ "$HELPER" "$PROJECT")
case "$got" in
    "invalid||"*python3*) pass "no python3: the file is invalid, nothing is disabled, and the reason names python3" ;;
    *) fail "no python3: the file is invalid, nothing is disabled, and the reason names python3" "$got" ;;
esac
out=$(printf '%s' "$(agent_event researcher "$PROJECT")" | PATH="$NOPY" CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null)
if [ "$(decision "$out")" = allow ] && grep -qF python3 <<<"$(warning_of "$out")"; then
    pass "no python3: the hook allows the researcher and the warning names python3"
else
    fail "no python3: the hook allows the researcher and the warning names python3" "$out"
fi

# A python3 that is on PATH but cannot run - the macOS developer-tools stub
# exits non-zero and prints nothing - is not a file that is invalid JSON. The
# file is still invalid and honours nothing, but the reason says python3 could
# not run.
STUBPY="$TMP/stub-python-bin"
mkdir -p "$STUBPY"
printf '#!/bin/sh\nexit 1\n' > "$STUBPY/python3"
chmod +x "$STUBPY/python3"
got=$(PATH="$STUBPY:$PATH" /bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED" "$FLEET_CONFIG_REASON"' _ "$HELPER" "$PROJECT")
case "$got" in
    *"not valid JSON"*) fail "python3 that cannot run: the reason says python3 could not run, not invalid JSON" "$got" ;;
    "invalid||"*python3*"could not run"*) pass "python3 that cannot run: the file is invalid, nothing is disabled, and the reason says python3 could not run" ;;
    *) fail "python3 that cannot run: the file is invalid, nothing is disabled, and the reason says python3 could not run" "$got" ;;
esac
out=$(printf '%s' "$(agent_event researcher "$PROJECT")" | PATH="$STUBPY:$PATH" CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null)
if [ "$(decision "$out")" = allow ] && grep -qF 'python3 could not run' <<<"$(warning_of "$out")"; then
    pass "python3 that cannot run: the hook allows the researcher and the warning says python3 could not run"
else
    fail "python3 that cannot run: the hook allows the researcher and the warning says python3 could not run" "$out"
fi

# -I on the python3 call: no PYTHON* variable can put another json module in
# place of the real one. FAKEPY holds a json package whose loads says the
# researcher is disabled whatever the file holds; with PYTHONPATH pointing at it
# and a file of {}, the researcher is still allowed and --check disables nothing.
FAKEPY="$TMP/fake-pythonpath"
mkdir -p "$FAKEPY/json"
printf '%s\n' \
    'def loads(*args, **kwargs):' \
    '    return {"disabledAgents": ["researcher"]}' \
    'def dumps(*args, **kwargs):' \
    '    return "\"\""' > "$FAKEPY/json/__init__.py"
set_config '{}'
out=$(printf '%s' "$(agent_event researcher "$PROJECT")" | PYTHONPATH="$FAKEPY" CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null)
[ "$(decision "$out")" = allow ] && pass "a PYTHONPATH json package cannot disable the researcher" \
    || fail "a PYTHONPATH json package cannot disable the researcher" "$out"
if out=$(PYTHONPATH="$FAKEPY" /bin/bash "$HOOK" --check "$PROJECT" 2>&1) && grep -qF 'disables nothing' <<<"$out"; then
    pass "--check under a PYTHONPATH json package reads the real file and disables nothing"
else
    fail "--check under a PYTHONPATH json package reads the real file and disables nothing" "$out"
fi

set_config "$(printf '\357\273\277{}')"
out=$(run_hook "$(agent_event researcher "$PROJECT")")
grep -qi 'byte order mark' <<<"$(warning_of "$out")" \
    && pass "a leading byte order mark is named in the warning" \
    || fail "a leading byte order mark is named in the warning" "$out"

# A directory where the file should be cannot be read, and says so.
rm -f "$CONFIG"; mkdir "$CONFIG"
got=$(/bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s" "$FLEET_CONFIG_STATE"' _ "$HELPER" "$PROJECT")
[ "$got" = unreadable ] && pass "a directory at the config path is unreadable" || fail "a directory at the config path is unreadable" "$got"
expect allow "a directory at the config path: researcher allowed" researcher
rmdir "$CONFIG"

# --- read on every call: a flip takes effect on the next spawn ---------------

set_config '{"disabledAgents": ["researcher"]}'
expect deny "flip 1: researcher listed, denied" researcher
set_config '{}'
expect allow "flip 2: entry removed, the next call is allowed" researcher
set_config '{"disabledAgents": ["researcher"]}'
expect deny "flip 3: entry restored, the next call is denied again" researcher
rm -f "$CONFIG"
expect allow "flip 4: file deleted, the next call is allowed" researcher
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
    set_config '{"disabledAgents": ["researcher"]}'
    printf '%s' '{}' > "$LINKED/.claude/coder-fleet.json"
    expect deny "main disables the researcher, the linked worktree does not: a call from the linked worktree is denied" researcher "$LINKED"
    expect deny "and from a subdirectory of the linked worktree" researcher "$LINKED/src"
    set_config '{}'
    printf '%s' '{"disabledAgents": ["researcher"]}' > "$LINKED/.claude/coder-fleet.json"
    expect allow "the linked worktree disables the researcher, main does not: allowed" researcher "$LINKED"
    rm -f "$CONFIG"
    expect allow "the linked worktree disables the researcher, main has no file: allowed" researcher "$LINKED"
    out=$(run_hook "$(agent_event researcher "$LINKED")")
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

    # Hardening. OTHER is an unrelated repository whose file disables the
    # researcher; the project's own main checkout disables nothing. None of these
    # may reach OTHER's file, or fall back to the copy in the cwd.
    OTHER="$TMP/other"
    mkdir -p "$OTHER/.claude"
    git -C "$OTHER" init -q . 2>/dev/null
    printf '%s' '{"disabledAgents": ["researcher"]}' > "$OTHER/.claude/coder-fleet.json"
    set_config '{}'
    printf '%s' '{}' > "$LINKED/.claude/coder-fleet.json"

    # (1) The environment cannot redirect the resolution.
    out=$(printf '%s' "$(agent_event researcher "$LINKED")" | GIT_DIR="$OTHER/.git" GIT_WORK_TREE="$OTHER" GIT_COMMON_DIR="$OTHER/.git" CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null)
    [ "$(decision "$out")" = allow ] && pass "GIT_DIR, GIT_WORK_TREE and GIT_COMMON_DIR pointing at another repository are ignored" \
        || fail "GIT_DIR, GIT_WORK_TREE and GIT_COMMON_DIR pointing at another repository are ignored" "$out"
    got=$(GIT_CEILING_DIRECTORIES="$PROJECT" /bin/bash -c '. "$1"; fleet_config_root "$2"' _ "$HELPER" "$PROJECT/src/deep")
    [ "$got" = "$(cd "$PROJECT" && pwd -P)" ] && pass "GIT_CEILING_DIRECTORIES cannot stop the search short of the repository" \
        || fail "GIT_CEILING_DIRECTORIES cannot stop the search short of the repository" "got $got"

    # (2) A directory whose .git file claims another repository, which does not
    # list it as a worktree, gets no main checkout at all.
    FAKE="$TMP/fake"
    mkdir -p "$FAKE/.claude"
    printf 'gitdir: %s\n' "$OTHER/.git" > "$FAKE/.git"
    printf '%s' '{}' > "$FAKE/.claude/coder-fleet.json"
    expect allow "a .git file pointing at a repository that does not list the worktree: nothing is read" researcher "$FAKE"
    got=$(/bin/bash -c '. "$1"; fleet_config_root "$2"; printf "|%s" "$?"' _ "$HELPER" "$FAKE")
    [ "$got" = "|1" ] && pass "fleet_config_root refuses a worktree its main checkout does not list" || fail "fleet_config_root refuses a worktree its main checkout does not list" "got $got"
    # The same through a linked worktree's own .git file, edited to point at
    # OTHER's administrative directory.
    cp -p "$LINKED/.git" "$TMP/linked-git"
    printf 'gitdir: %s\n' "$OTHER/.git" > "$LINKED/.git"
    expect allow "a linked worktree whose .git file was edited to point elsewhere: nothing is read" researcher "$LINKED"
    cp -p "$TMP/linked-git" "$LINKED/.git"
    expect allow "restored, the linked worktree reads main's file again" researcher "$LINKED"
    set_config '{"disabledAgents": ["researcher"]}'
    expect deny "and main's file decides again" researcher "$LINKED"
    rm -f "$CONFIG"

    # (3) A forged worktree passes the circular check: EVIL is a repository
    # that really does register FORGED as its worktree, so FORGED's main is
    # EVIL and EVIL's list names FORGED. With CLAUDE_PROJECT_DIR at the real
    # main, resolution starts there, so a cwd in FORGED cannot move it and the
    # real main's file decides, both ways round.
    EVIL="$TMP/evil"
    FORGED="$TMP/forged"
    mkdir -p "$EVIL/.claude"
    if git -C "$EVIL" init -q . 2>/dev/null \
        && git -C "$EVIL" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init 2>/dev/null \
        && git -C "$EVIL" worktree add -q "$FORGED" -b forged 2>/dev/null; then
        mkdir -p "$FORGED/.claude"
        printf '%s' '{"disabledAgents": ["researcher"]}' > "$EVIL/.claude/coder-fleet.json"
        printf '%s' '{"disabledAgents": ["researcher"]}' > "$FORGED/.claude/coder-fleet.json"
        set_config '{}'
        out=$(printf '%s' "$(agent_event researcher "$FORGED")" | CLAUDE_PROJECT_DIR="$PROJECT" /bin/bash "$HOOK" 2>/dev/null)
        [ "$(decision "$out")" = allow ] && pass "CLAUDE_PROJECT_DIR at the real main, cwd in a forged worktree whose repository disables the researcher: allowed" \
            || fail "CLAUDE_PROJECT_DIR at the real main, cwd in a forged worktree whose repository disables the researcher: allowed" "$out"
        printf '%s' '{}' > "$EVIL/.claude/coder-fleet.json"
        printf '%s' '{}' > "$FORGED/.claude/coder-fleet.json"
        set_config '{"disabledAgents": ["researcher"]}'
        out=$(printf '%s' "$(agent_event researcher "$FORGED")" | CLAUDE_PROJECT_DIR="$PROJECT" /bin/bash "$HOOK" 2>/dev/null)
        [ "$(decision "$out")" = deny ] && pass "CLAUDE_PROJECT_DIR at the real main that disables the researcher, cwd in a forged worktree: denied" \
            || fail "CLAUDE_PROJECT_DIR at the real main that disables the researcher, cwd in a forged worktree: denied" "$out"
        # A CLAUDE_PROJECT_DIR that is not a directory is ignored and the cwd
        # is used, as before; here that reaches EVIL, which is what the
        # variable exists to stop.
        printf '%s' '{"disabledAgents": ["researcher"]}' > "$EVIL/.claude/coder-fleet.json"
        set_config '{}'
        out=$(printf '%s' "$(agent_event researcher "$FORGED")" | CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null)
        [ "$(decision "$out")" = deny ] && pass "with CLAUDE_PROJECT_DIR not a directory, the cwd decides (the gap the variable closes)" \
            || fail "with CLAUDE_PROJECT_DIR not a directory, the cwd decides (the gap the variable closes)" "$out"
        rm -f "$CONFIG"
    else
        fail "forged worktree fixture" "git could not set up $EVIL with a worktree at $FORGED"
    fi
elif [ "$HAVE_GIT" -eq 1 ]; then
    fail "linked worktree fixture" "git could not commit or add a worktree in $PROJECT"
else
    printf '  skip  linked worktree cases (git is not on PATH)\n'
fi

# (3) No repository, no file. A cwd outside git carries a file that disables
# the researcher; with no main checkout to find, nothing is read and the researcher
# stays on, rather than the cwd's copy deciding.
NOGIT="$TMP/nogit"
mkdir -p "$NOGIT/.claude"
printf '%s' '{"disabledAgents": ["researcher"]}' > "$NOGIT/.claude/coder-fleet.json"
if [ "$HAVE_GIT" -eq 1 ] && ! git -C "$NOGIT" rev-parse --git-dir >/dev/null 2>&1; then
    expect allow "a cwd outside any repository: its own file is not read, the researcher is allowed" researcher "$NOGIT"
    out=$(printf '%s' "$(agent_event researcher "")" | CLAUDE_PROJECT_DIR="$NOGIT" /bin/bash "$HOOK" 2>/dev/null)
    [ "$(decision "$out")" = allow ] && pass "no cwd and CLAUDE_PROJECT_DIR outside any repository: nothing is read" \
        || fail "no cwd and CLAUDE_PROJECT_DIR outside any repository: nothing is read" "$out"
    # A CLAUDE_PROJECT_DIR that is a directory but in no repository is where
    # resolution starts, and finding nothing there ends it: the event's cwd is
    # not tried next, even when it is in a repository whose file disables the
    # researcher.
    set_config '{"disabledAgents": ["researcher"]}'
    out=$(printf '%s' "$(agent_event researcher "$PROJECT")" | CLAUDE_PROJECT_DIR="$NOGIT" /bin/bash "$HOOK" 2>/dev/null)
    [ "$(decision "$out")" = allow ] && pass "CLAUDE_PROJECT_DIR outside any repository, cwd in one that disables the researcher: no fallback to the cwd, allowed" \
        || fail "CLAUDE_PROJECT_DIR outside any repository, cwd in one that disables the researcher: no fallback to the cwd, allowed" "$out"
    rm -f "$CONFIG"
    got=$(/bin/bash -c '. "$1"; fleet_config_read ""; printf "%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED"' _ "$HELPER")
    [ "$got" = "unresolved|" ] && pass "fleet_config_read with no main checkout reads nothing and says unresolved" || fail "fleet_config_read with no main checkout reads nothing and says unresolved" "$got"
    if out=$(/bin/bash "$HOOK" --check "$NOGIT" 2>&1) && grep -qi 'main checkout' <<<"$out"; then
        pass "--check outside a repository passes and says there is no main checkout"
    else
        fail "--check outside a repository passes and says there is no main checkout" "$out"
    fi
else
    printf '  skip  a cwd outside any repository (git missing, or %s is inside one)\n' "$NOGIT"
fi

# --- the helper, sourced on its own ------------------------------------------

set_config '{"disabledAgents": ["coder-fleet:Researcher", "scout"]}'
got=$(/bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED"' _ "$HELPER" "$PROJECT")
[ "$got" = "ok|researcher scout" ] && pass "the helper sources alone and normalises names" || fail "the helper sources alone and normalises names" "$got"
got=$(/bin/bash -c '. "$1"; fleet_config_read "$2"; fleet_agent_disabled coder-fleet:scout && echo yes || echo no' _ "$HELPER" "$PROJECT")
[ "$got" = yes ] && pass "fleet_agent_disabled answers for a prefixed type" || fail "fleet_agent_disabled answers for a prefixed type" "$got"

# --- the check mode check-all runs ------------------------------------------

rm -f "$CONFIG"
if out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); then pass "--check passes with no file"; else fail "--check passes with no file" "$out"; fi
set_config '{"disabledAgents": ["researcher"]}'
if out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1) && grep -qF researcher <<<"$out"; then
    pass "--check passes on a valid file and names what it disables"
else
    fail "--check passes on a valid file and names what it disables" "$out"
fi
set_config '{"disabledAgents": ["reviewer"]}'
if out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); then
    fail "--check fails when a core agent is listed" "exit 0: $out"
elif grep -qF reviewer <<<"$out" && grep -qF '.claude/coder-fleet.json' <<<"$out"; then
    pass "--check fails when a core agent is listed, naming it and the file"
else
    fail "--check fails when a core agent is listed, naming it and the file" "$out"
fi

# --- an entry that matches no fleet agent warns ---------------------

warns_of() { printf '%s\n' "$1" | grep -i 'warning'; }

set_config '{"disabledAgents": ["researchr"]}'
out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); code=$?
if [ "$code" -eq 0 ] && warns_of "$out" | grep -qF researchr; then
    pass "--check warns on an entry that matches no fleet agent, names it and exits 0"
else
    fail "--check warns on an entry that matches no fleet agent, names it and exits 0" "exit $code: $out"
fi
set_config '{"disabledAgents": ["researcher"]}'
out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1)
if [ -z "$(warns_of "$out")" ]; then pass "--check gives no warning for a known name"; else fail "--check gives no warning for a known name" "$out"; fi
set_config '{"disabledAgents": ["researcher", "researchr", "scout", "nonesuch"]}'
out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); code=$?
w=$(warns_of "$out")
if [ "$code" -eq 0 ] && grep -qF '"researchr"' <<<"$w" && grep -qF '"nonesuch"' <<<"$w" \
    && ! grep -qE '"(researcher|scout)"' <<<"$w"; then
    pass "--check warns about every unknown entry and only those"
else
    fail "--check warns about every unknown entry and only those" "exit $code: $out"
fi
expect deny "a known name is still denied beside an unknown one" researcher
expect deny "a second known name is still denied beside an unknown one" scout
expect allow "an unlisted agent is allowed beside an unknown entry" tech-writer
# CF-192 folded refuter and evaluator into the reviewer. A project that still
# lists either keeps a valid file: --check exits 0 and warns about both, the
# roster no longer has them, and nothing else in the list stops working.
set_config '{"phase": "harden", "disabledAgents": ["refuter", "coder-fleet:Evaluator", "scout"]}'
out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); code=$?
w=$(warns_of "$out")
if [ "$code" -eq 0 ] && grep -qF '"refuter"' <<<"$w" && grep -qF '"evaluator"' <<<"$w" && ! grep -qF '"scout"' <<<"$w"; then
    pass "a stale refuter or evaluator entry keeps the file valid and is warned about"
else
    fail "a stale refuter or evaluator entry keeps the file valid and is warned about" "exit $code: $out"
fi
expect allow "a stale refuter entry leaves the reviewer enabled" reviewer
expect allow "a stale refuter entry leaves coder-fleet:reviewer enabled" coder-fleet:reviewer
expect deny "a known name beside the stale entries is still denied" scout
out=$(run_hook "$(agent_event coder "$PROJECT" Agent)")
if [ -z "$out" ]; then pass "a spawn beside the stale entries gets no invalid-file warning"; else fail "a spawn beside the stale entries gets no invalid-file warning" "${out:0:160}"; fi
out=$(/bin/bash -c '. "$1"; fleet_roster "$2"' _ "$HELPER" "$PLUGIN_ROOT" 2>/dev/null)
if ! printf '%s\n' "$out" | tr ' ' '\n' | grep -qx -E 'refuter|evaluator'; then
    pass "the roster names neither refuter nor evaluator"
else
    fail "the roster names neither refuter nor evaluator" "$out"
fi
out=$(/bin/bash -c '. "$1"; fleet_roster "$2"' _ "$HELPER" "$PLUGIN_ROOT" 2>/dev/null)
expected=$(for f in "$PLUGIN_ROOT"/agents/*.md; do basename "$f" .md; done | LC_ALL=C sort | tr '\n' ' ' | sed 's/ $//')
if printf '%s\n' "$out" | tr ' ' '\n' | grep -qx researcher && [ "$out" = "$expected" ]; then
    pass "fleet_roster lists the plugin's agents, one per body"
else
    fail "fleet_roster lists the plugin's agents, one per body" "$out"
fi

# --- baseBranch, push and release, and the trunk resolver ---------------------

# Three keys read beside phase and disabledAgents, each judged apart. A throwaway
# repository per case, with a remote whose HEAD names develop, so a trunk of
# develop or main can only come from the rule meant to give it. No fetch: the
# remote's refs are written by hand.
TRUNK_SCRIPT="$PLUGIN_ROOT/scripts/fleet-trunk.sh"
settings_of() {
    # $1 root; prints base|state|push|state|release|state, then the three reasons
    /bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s|%s|%s|%s|%s\n%s\n%s\n%s" "$FLEET_CONFIG_BASE" "$FLEET_CONFIG_BASE_STATE" "$FLEET_CONFIG_PUSH" "$FLEET_CONFIG_PUSH_STATE" "$FLEET_CONFIG_RELEASE" "$FLEET_CONFIG_RELEASE_STATE" "$FLEET_CONFIG_BASE_REASON" "$FLEET_CONFIG_PUSH_REASON" "$FLEET_CONFIG_RELEASE_REASON"' _ "$HELPER" "$1"
}
list_of() {
    /bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED" "$FLEET_CONFIG_PHASE"' _ "$HELPER" "$1"
}
trunk_fn() {
    # The resolver as a hook calls it, sourced. Prints trunk|from, or fail|reason.
    /bin/bash -c '. "$1"; if fleet_trunk "$2"; then printf "%s|%s" "$FLEET_TRUNK" "$FLEET_TRUNK_FROM"; else printf "fail|%s" "$FLEET_TRUNK_REASON"; fi' _ "$HELPER" "$1"
}
new_repo() {
    # $1 dir; a repository on main with one commit and a feat/x branch
    mkdir -p "$1/.claude"
    git -C "$1" init -q . 2>/dev/null
    git -C "$1" symbolic-ref HEAD refs/heads/main
    git -C "$1" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
    git -C "$1" branch feat/x
}
with_remote_head() {
    # $1 repo, $2 remote name, $3 the branch its HEAD names
    git -C "$1" remote add "$2" "https://example.invalid/$2.git"
    git -C "$1" update-ref "refs/remotes/$2/$3" HEAD
    git -C "$1" symbolic-ref "refs/remotes/$2/HEAD" "refs/remotes/$2/$3"
}

if [ "$HAVE_GIT" -eq 1 ]; then
    R="$TMP/settings"
    new_repo "$R"
    with_remote_head "$R" origin develop
    RC="$R/.claude/coder-fleet.json"

    # Criterion 1: a file setting none of them reads as today, and all three
    # come back beside the list and the phase.
    for f in '' '{}' '{"phase": "harden", "disabledAgents": ["researcher"]}'; do
        rm -f "$RC"; [ -n "$f" ] && printf '%s' "$f" > "$RC"
        got=$(settings_of "$R" | sed -n 1p)
        [ "$got" = "|unset|all|unset|unset|unset" ] && pass "a file setting none of the three reads them unset: ${f:-no file}" \
            || fail "a file setting none of the three reads them unset: ${f:-no file}" "$got"
    done
    [ "$(list_of "$R")" = "ok|researcher|harden" ] && pass "the list and the phase read as before beside the unset keys" \
        || fail "the list and the phase read as before beside the unset keys" "$(list_of "$R")"
    printf '%s' '{"phase": "harden", "disabledAgents": ["scout"], "baseBranch": "feat/x", "push": "base-only", "release": "tag"}' > "$RC"
    got=$(settings_of "$R" | sed -n 1p)
    [ "$got" = "feat/x|ok|base-only|ok|tag|ok" ] && [ "$(list_of "$R")" = "ok|scout|harden" ] \
        && pass "the reader returns baseBranch, push and release alongside phase and disabledAgents" \
        || fail "the reader returns baseBranch, push and release alongside phase and disabledAgents" "$got / $(list_of "$R")"

    # Criterion 2: the trunk by each rule, with a remote HEAD naming develop.
    printf '%s' '{"baseBranch": "feat/x"}' > "$RC"
    [ "$(trunk_fn "$R")" = "feat/x|setting" ] && [ "$(/bin/bash "$TRUNK_SCRIPT" "$R" 2>/dev/null)" = feat/x ] \
        && pass "baseBranch set: the trunk is feat/x, not develop, sourced and from the script" \
        || fail "baseBranch set: the trunk is feat/x, not develop, sourced and from the script" "$(trunk_fn "$R")"
    [ "$(cd "$R/.claude" && /bin/bash "$TRUNK_SCRIPT" 2>/dev/null)" = feat/x ] \
        && pass "the script with no argument resolves the repository it runs in" || fail "the script with no argument resolves the repository it runs in"
    printf '%s' '{"push": "base-only"}' > "$RC"
    [ "$(trunk_fn "$R")" = "develop|remote" ] && [ "$(/bin/bash "$TRUNK_SCRIPT" "$R" 2>/dev/null)" = develop ] \
        && pass "baseBranch unset: the trunk is what origin's HEAD names" || fail "baseBranch unset: the trunk is what origin's HEAD names" "$(trunk_fn "$R")"
    R1="$TMP/settings-one-remote"
    new_repo "$R1"
    with_remote_head "$R1" upstream develop
    [ "$(trunk_fn "$R1")" = "develop|remote" ] && pass "the only remote, not named origin, gives the trunk" || fail "the only remote, not named origin, gives the trunk" "$(trunk_fn "$R1")"
    git -C "$R1" symbolic-ref --delete refs/remotes/upstream/HEAD
    [ "$(trunk_fn "$R1")" = "main|fallback" ] && pass "a remote with no HEAD: the trunk is main" || fail "a remote with no HEAD: the trunk is main" "$(trunk_fn "$R1")"
    R2="$TMP/settings-two-remotes"
    new_repo "$R2"
    with_remote_head "$R2" upstream develop
    with_remote_head "$R2" fork develop
    [ "$(trunk_fn "$R2")" = "main|fallback" ] && [ "$(/bin/bash "$TRUNK_SCRIPT" "$R2" 2>/dev/null)" = main ] \
        && pass "no origin, two remotes whose HEAD names develop: the trunk is main" \
        || fail "no origin, two remotes whose HEAD names develop: the trunk is main" "$(trunk_fn "$R2")"
    printf '%s' '{"baseBranch": "feat/x"}' > "$R2/.claude/coder-fleet.json"
    [ "$(trunk_fn "$R2")" = "feat/x|setting" ] && pass "baseBranch wins where the fallback would be main" || fail "baseBranch wins where the fallback would be main" "$(trunk_fn "$R2")"

    # Criterion 3: an invalid value names its key and its value, and its state
    # tells it from unset.
    for case_ in 'baseBranch|"bad..name"|bad..name' 'baseBranch|"nope"|nope' 'baseBranch|"-x"|-x' 'baseBranch|7|not a string' 'baseBranch|""|""' \
                 'push|"everything"|everything' 'push|true|not a string' 'release|"yes"|yes' 'release|["tag"]|not a string'; do
        key=${case_%%|*}; rest=${case_#*|}; val=${rest%%|*}; want=${rest#*|}
        printf '{"%s": %s}' "$key" "$val" > "$RC"
        out=$(settings_of "$R")
        case "$key" in baseBranch) n=1 ;; push) n=3 ;; *) n=5 ;; esac
        st=$(printf '%s\n' "$out" | sed -n 1p | cut -d'|' -f$((n + 1)))
        why=$(printf '%s\n' "$out" | sed -n "$(( (n + 1) / 2 + 1 ))p")
        if [ "$st" = invalid ] && grep -qF "$key" <<<"$why" && grep -qF -- "$want" <<<"$why"; then
            pass "$key $val is invalid, and the reason names $key and $want"
        else
            fail "$key $val is invalid, and the reason names $key and $want" "$out"
        fi
    done
    # An invalid baseBranch resolves no trunk, rather than a guessed one.
    printf '%s' '{"baseBranch": "nope"}' > "$RC"
    out=$(/bin/bash "$TRUNK_SCRIPT" "$R" 2>"$TMP/trunk.err"); code=$?
    [ "$code" -eq 1 ] && [ -z "$out" ] && grep -qF '"nope"' "$TMP/trunk.err" && [ "$(trunk_fn "$R" | cut -d'|' -f1)" = fail ] \
        && pass "an invalid baseBranch resolves no trunk: exit 1, nothing printed, the reason on stderr" \
        || fail "an invalid baseBranch resolves no trunk: exit 1, nothing printed, the reason on stderr" "exit $code: $out $(cat "$TMP/trunk.err")"

    # Criterion 4: an invalid or unreadable push is base-only, release off.
    for f in '{"push": "All"}' '{"push": 1}' '{"push": "all",}' '["all"]' ''; do
        printf '%s' "$f" > "$RC"
        got=$(settings_of "$R" | sed -n 1p | cut -d'|' -f3)
        [ "$got" = base-only ] && pass "push in ${f:-<empty file>} resolves as base-only, never all" || fail "push in ${f:-<empty file>} resolves as base-only, never all" "$got"
    done
    for f in '{"release": "Tag"}' '{"release": null}' '{"release": "tag",}' '["tag"]' ''; do
        printf '%s' "$f" > "$RC"
        got=$(settings_of "$R" | sed -n 1p | cut -d'|' -f5)
        [ "$got" = off ] && pass "release in ${f:-<empty file>} resolves as off" || fail "release in ${f:-<empty file>} resolves as off" "$got"
    done
    rm -f "$RC"; mkdir "$RC"
    got=$(settings_of "$R" | sed -n 1p)
    [ "$got" = "|unread|base-only|unread|off|unread" ] && pass "an unreadable file: push base-only, release off, baseBranch unknown" || fail "an unreadable file: push base-only, release off, baseBranch unknown" "$got"
    [ "$(trunk_fn "$R" | cut -d'|' -f1)" = fail ] && pass "an unreadable file resolves no trunk" || fail "an unreadable file resolves no trunk" "$(trunk_fn "$R")"
    rmdir "$RC"
    got=$(/bin/bash -c '. "$1"; fleet_config_read ""; printf "%s|%s" "$FLEET_CONFIG_PUSH" "$FLEET_CONFIG_RELEASE"' _ "$HELPER")
    [ "$got" = "base-only|off" ] && pass "no main checkout: push base-only, release off" || fail "no main checkout: push base-only, release off" "$got"
    PYSTUB="$TMP/pystub"; mkdir -p "$PYSTUB"
    printf '#!/bin/sh\nexit 1\n' > "$PYSTUB/python3"; chmod +x "$PYSTUB/python3"
    printf '%s' '{"push": "all", "release": "tag"}' > "$RC"
    got=$(PATH="$PYSTUB:$PATH" /bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s" "$FLEET_CONFIG_PUSH" "$FLEET_CONFIG_RELEASE"' _ "$HELPER" "$R")
    [ "$got" = "base-only|off" ] && pass "a python3 that cannot run: push base-only, release off" || fail "a python3 that cannot run: push base-only, release off" "$got"

    # Criterion 7: unset release is unset, not off; each value; an invalid one.
    rm -f "$RC"
    got=$(settings_of "$R" | sed -n 1p | cut -d'|' -f5,6)
    [ "$got" = "unset|unset" ] && pass "release unset reads as unset, not off" || fail "release unset reads as unset, not off" "$got"
    for v in off tag github; do
        printf '{"release": "%s"}' "$v" > "$RC"
        got=$(settings_of "$R" | sed -n 1p | cut -d'|' -f5,6)
        [ "$got" = "$v|ok" ] && pass "release $v reads as $v" || fail "release $v reads as $v" "$got"
    done
    printf '%s' '{"release": "always"}' > "$RC"
    got=$(settings_of "$R" | sed -n 1p | cut -d'|' -f5,6)
    [ "$got" = "off|invalid" ] && pass "release always reads as off, invalid" || fail "release always reads as off, invalid" "$got"
    for v in all base-only; do
        printf '{"push": "%s"}' "$v" > "$RC"
        got=$(settings_of "$R" | sed -n 1p | cut -d'|' -f3,4)
        [ "$got" = "$v|ok" ] && pass "push $v reads as $v" || fail "push $v reads as $v" "$got"
    done
    # Independent: a bad value in one key leaves the others and the list as set.
    printf '%s' '{"disabledAgents": ["scout"], "phase": "harden", "baseBranch": "feat/x", "push": "nope", "release": "github"}' > "$RC"
    got=$(settings_of "$R" | sed -n 1p)
    [ "$got" = "feat/x|ok|base-only|invalid|github|ok" ] && [ "$(list_of "$R")" = "ok|scout|harden" ] \
        && pass "an invalid push voids nothing else in the file" || fail "an invalid push voids nothing else in the file" "$got / $(list_of "$R")"
    rm -f "$RC"
else
    fail "baseBranch, push and release cases need git" "git is not installed"
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
