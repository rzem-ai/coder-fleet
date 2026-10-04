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
# Inputs jq 1.6 honoured and JSON.parse refuses (CF-111 round 2), now that the
# shell parses with python3's json module: number forms, raw control
# characters inside a string or key, bytes after the value that are not JSON
# whitespace, and nesting past 64 levels. Each is invalid to the hook and to
# --check, as it is to review-round.
deep="$(printf '%*s' 65 '' | tr ' ' '[')$(printf '%*s' 65 '' | tr ' ' ']')"
for bad in \
    '{"disabledAgents":["refuter"],"x":01}' \
    '{"disabledAgents":["refuter"],"x":1.}' \
    '{"disabledAgents":["refuter"],"x":.5}' \
    '{"disabledAgents":["refuter"],"x":+1}' \
    '{"disabledAgents":["refuter"],"x":-01}' \
    '{"disabledAgents":["refuter"],"x":1.e5}' \
    '{"disabledAgents":["refuter"],"x":00}' \
    "$(printf '{"disabledAgents":["refuter"],"x":"a\tb"}')" \
    "$(printf '{"disabledAgents":["refuter"],"a\nb":1}')" \
    "$(printf '{"disabledAgents":["refuter"]}\f')" \
    "$(printf '{"disabledAgents":["refuter"]}\v')" \
    "{\"disabledAgents\":[\"refuter\"],\"x\":$deep}"; do
    set_config "$bad"
    out=$(run_hook "$(agent_event refuter "$PROJECT")")
    w=$(warning_of "$out")
    if [ "$(decision "$out")" = allow ] && printf '%s' "$w" | grep -qi 'invalid'; then
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
    "$(printf '\n\t {"disabledAgents":["refuter"]}\r\n\t ')" \
    '{"disabledAgents":["refuter"],"x":-0.5e+10,"y":-0,"z":1E-2,"w":1e400}' \
    "{\"disabledAgents\":[\"refuter\"],\"x\":$(printf '%*s' 5000 '' | tr ' ' '7')}"; do
    set_config "$good"
    expect deny "strict JSON still reads $(printf '%s' "$good" | cut -c1-60)" refuter
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
set_config '{"disabledAgents": ["refuter"]}'
got=$(PATH="$NOPY" /bin/bash -c '. "$1"; fleet_config_read "$2"; printf "%s|%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED" "$FLEET_CONFIG_REASON"' _ "$HELPER" "$PROJECT")
case "$got" in
    "invalid||"*python3*) pass "no python3: the file is invalid, nothing is disabled, and the reason names python3" ;;
    *) fail "no python3: the file is invalid, nothing is disabled, and the reason names python3" "$got" ;;
esac
out=$(printf '%s' "$(agent_event refuter "$PROJECT")" | PATH="$NOPY" CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null)
if [ "$(decision "$out")" = allow ] && printf '%s' "$(warning_of "$out")" | grep -qF python3; then
    pass "no python3: the hook allows the refuter and the warning names python3"
else
    fail "no python3: the hook allows the refuter and the warning names python3" "$out"
fi

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

    # Hardening. OTHER is an unrelated repository whose file disables the
    # refuter; the project's own main checkout disables nothing. None of these
    # may reach OTHER's file, or fall back to the copy in the cwd.
    OTHER="$TMP/other"
    mkdir -p "$OTHER/.claude"
    git -C "$OTHER" init -q . 2>/dev/null
    printf '%s' '{"disabledAgents": ["refuter"]}' > "$OTHER/.claude/coder-fleet.json"
    set_config '{}'
    printf '%s' '{}' > "$LINKED/.claude/coder-fleet.json"

    # (1) The environment cannot redirect the resolution.
    out=$(printf '%s' "$(agent_event refuter "$LINKED")" | GIT_DIR="$OTHER/.git" GIT_WORK_TREE="$OTHER" GIT_COMMON_DIR="$OTHER/.git" CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null)
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
    expect allow "a .git file pointing at a repository that does not list the worktree: nothing is read" refuter "$FAKE"
    got=$(/bin/bash -c '. "$1"; fleet_config_root "$2"; printf "|%s" "$?"' _ "$HELPER" "$FAKE")
    [ "$got" = "|1" ] && pass "fleet_config_root refuses a worktree its main checkout does not list" || fail "fleet_config_root refuses a worktree its main checkout does not list" "got $got"
    # The same through a linked worktree's own .git file, edited to point at
    # OTHER's administrative directory.
    cp -p "$LINKED/.git" "$TMP/linked-git"
    printf 'gitdir: %s\n' "$OTHER/.git" > "$LINKED/.git"
    expect allow "a linked worktree whose .git file was edited to point elsewhere: nothing is read" refuter "$LINKED"
    cp -p "$TMP/linked-git" "$LINKED/.git"
    expect allow "restored, the linked worktree reads main's file again" refuter "$LINKED"
    set_config '{"disabledAgents": ["refuter"]}'
    expect deny "and main's file decides again" refuter "$LINKED"
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
        printf '%s' '{"disabledAgents": ["refuter"]}' > "$EVIL/.claude/coder-fleet.json"
        printf '%s' '{"disabledAgents": ["refuter"]}' > "$FORGED/.claude/coder-fleet.json"
        set_config '{}'
        out=$(printf '%s' "$(agent_event refuter "$FORGED")" | CLAUDE_PROJECT_DIR="$PROJECT" /bin/bash "$HOOK" 2>/dev/null)
        [ "$(decision "$out")" = allow ] && pass "CLAUDE_PROJECT_DIR at the real main, cwd in a forged worktree whose repository disables the refuter: allowed" \
            || fail "CLAUDE_PROJECT_DIR at the real main, cwd in a forged worktree whose repository disables the refuter: allowed" "$out"
        printf '%s' '{}' > "$EVIL/.claude/coder-fleet.json"
        printf '%s' '{}' > "$FORGED/.claude/coder-fleet.json"
        set_config '{"disabledAgents": ["refuter"]}'
        out=$(printf '%s' "$(agent_event refuter "$FORGED")" | CLAUDE_PROJECT_DIR="$PROJECT" /bin/bash "$HOOK" 2>/dev/null)
        [ "$(decision "$out")" = deny ] && pass "CLAUDE_PROJECT_DIR at the real main that disables the refuter, cwd in a forged worktree: denied" \
            || fail "CLAUDE_PROJECT_DIR at the real main that disables the refuter, cwd in a forged worktree: denied" "$out"
        # A CLAUDE_PROJECT_DIR that is not a directory is ignored and the cwd
        # is used, as before; here that reaches EVIL, which is what the
        # variable exists to stop.
        printf '%s' '{"disabledAgents": ["refuter"]}' > "$EVIL/.claude/coder-fleet.json"
        set_config '{}'
        out=$(printf '%s' "$(agent_event refuter "$FORGED")" | CLAUDE_PROJECT_DIR="$TMP/elsewhere" /bin/bash "$HOOK" 2>/dev/null)
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
# the refuter; with no main checkout to find, nothing is read and the refuter
# stays on, rather than the cwd's copy deciding.
NOGIT="$TMP/nogit"
mkdir -p "$NOGIT/.claude"
printf '%s' '{"disabledAgents": ["refuter"]}' > "$NOGIT/.claude/coder-fleet.json"
if [ "$HAVE_GIT" -eq 1 ] && ! git -C "$NOGIT" rev-parse --git-dir >/dev/null 2>&1; then
    expect allow "a cwd outside any repository: its own file is not read, the refuter is allowed" refuter "$NOGIT"
    out=$(printf '%s' "$(agent_event refuter "")" | CLAUDE_PROJECT_DIR="$NOGIT" /bin/bash "$HOOK" 2>/dev/null)
    [ "$(decision "$out")" = allow ] && pass "no cwd and CLAUDE_PROJECT_DIR outside any repository: nothing is read" \
        || fail "no cwd and CLAUDE_PROJECT_DIR outside any repository: nothing is read" "$out"
    got=$(/bin/bash -c '. "$1"; fleet_config_read ""; printf "%s|%s" "$FLEET_CONFIG_STATE" "$FLEET_CONFIG_DISABLED"' _ "$HELPER")
    [ "$got" = "unresolved|" ] && pass "fleet_config_read with no main checkout reads nothing and says unresolved" || fail "fleet_config_read with no main checkout reads nothing and says unresolved" "$got"
    if out=$(/bin/bash "$HOOK" --check "$NOGIT" 2>&1) && printf '%s' "$out" | grep -qi 'main checkout'; then
        pass "--check outside a repository passes and says there is no main checkout"
    else
        fail "--check outside a repository passes and says there is no main checkout" "$out"
    fi
else
    printf '  skip  a cwd outside any repository (git missing, or %s is inside one)\n' "$NOGIT"
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

# --- an entry that matches no fleet agent warns (CF-113) ---------------------

warns_of() { printf '%s\n' "$1" | grep -i 'warning'; }

set_config '{"disabledAgents": ["refutor"]}'
out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); code=$?
if [ "$code" -eq 0 ] && warns_of "$out" | grep -qF refutor; then
    pass "--check warns on an entry that matches no fleet agent, names it and exits 0"
else
    fail "--check warns on an entry that matches no fleet agent, names it and exits 0" "exit $code: $out"
fi
set_config '{"disabledAgents": ["refuter"]}'
out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1)
if [ -z "$(warns_of "$out")" ]; then pass "--check gives no warning for a known name"; else fail "--check gives no warning for a known name" "$out"; fi
# -fable is folded on the roster side only. An entry is matched as written, so
# "refuter-fable", which names no file under agents/, disables nothing and is
# warned about like any other unknown name.
set_config '{"disabledAgents": ["Coder-Fleet:Refuter-Fable"]}'
out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); code=$?
if [ "$code" -eq 0 ] && warns_of "$out" | grep -qF '"refuter-fable"'; then pass "--check warns on a -fable entry that names no agent file"; else fail "--check warns on a -fable entry that names no agent file" "exit $code: $out"; fi
FABLE_ROOT="$TMP/fable-plugin"
mkdir -p "$FABLE_ROOT/agents"
: > "$FABLE_ROOT/agents/refuter.md"; : > "$FABLE_ROOT/agents/refuter-fable.md"; : > "$FABLE_ROOT/agents/scout-fable.md"
out=$(/bin/bash -c '. "$1"; fleet_roster "$2"' _ "$HELPER" "$FABLE_ROOT" 2>/dev/null)
[ "$out" = "refuter scout" ] && pass "fleet_roster folds a -fable body into its base, with or without the base body" || fail "fleet_roster folds a -fable body into its base, with or without the base body" "$out"
set_config '{"disabledAgents": ["refuter", "refutor", "scout", "nonesuch"]}'
out=$(/bin/bash "$HOOK" --check "$PROJECT" 2>&1); code=$?
w=$(warns_of "$out")
if [ "$code" -eq 0 ] && printf '%s' "$w" | grep -qF '"refutor"' && printf '%s' "$w" | grep -qF '"nonesuch"' \
    && ! printf '%s' "$w" | grep -qE '"(refuter|scout)"'; then
    pass "--check warns about every unknown entry and only those"
else
    fail "--check warns about every unknown entry and only those" "exit $code: $out"
fi
expect deny "a known name is still denied beside an unknown one" refuter
expect deny "a second known name is still denied beside an unknown one" scout
expect allow "an unlisted agent is allowed beside an unknown entry" researcher
out=$(/bin/bash -c '. "$1"; fleet_roster "$2"' _ "$HELPER" "$PLUGIN_ROOT" 2>/dev/null)
if printf '%s\n' "$out" | tr ' ' '\n' | grep -qx refuter && ! printf '%s' "$out" | grep -q -- '-fable'; then
    pass "fleet_roster lists the plugin's agents with -fable names folded into their base"
else
    fail "fleet_roster lists the plugin's agents with -fable names folded into their base" "$out"
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
