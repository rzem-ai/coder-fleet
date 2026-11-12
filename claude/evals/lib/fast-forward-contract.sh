#!/usr/bin/env bash
#
# fast-forward-contract.sh - hooks/main-fast-forward.sh, on SessionStart, brings
# the main checkout's default branch level with its remote by fast-forward
# alone, tells the session what it did in one line, and otherwise changes
# nothing.
#
# Every case runs the real hook against throwaway repositories: a bare remote,
# a seed clone that pushes new commits to it, and the clone the session starts
# in, all under one mktemp root. The fetch stays local, so no case touches the
# network. Each case asserts the effect in git and on disk and the line the
# session is told, so a refusal cannot pass because the hook never ran.
#
# Case names, by the card's criteria:
#   1 behind              B01-B03, upstream-remote U01, trunk-default T01
#   2 other branch out    O01-O04
#   3 refusals            D01 diverged, W01-W02 dirty in the way, W03 dirty
#                         not in the way, F01 fetch fails, N01 no remote
#   4 left untouched      L01 linked worktree, X01 outside a repository
#   5 bounded, never fails  F02-F03 fetch timeout, E01-E03
#   level                 V01-V02
#
# Usage:  claude/evals/lib/fast-forward-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
HOOK="$PLUGIN_ROOT/hooks/main-fast-forward.sh"
HOOKS_JSON="$PLUGIN_ROOT/hooks/hooks.json"

command -v jq >/dev/null 2>&1 || { printf 'fast-forward-contract: jq is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/fast-forward-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# A caller's git environment or user config must not leak into the fixtures.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export BOARD_LOG_FILE="$TMP/hooks.log"
export CODER_FLEET_STATE_DIR="$TMP/state"
unset CODER_FLEET_FAST_FORWARD CODER_FLEET_FETCH_TIMEOUT

PASSED=0
FAILED=0
# While GATE is 1, a check also needs the last run to have exited 0.
GATE=1

check() {
    # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if { [ "$GATE" -eq 0 ] || [ "$RC" -eq 0 ]; } && "$@" >/dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$label"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s\n' "$label"
        [ "$VERBOSE" -eq 1 ] && printf '        rc=%s out=%s\n' "$RC" "$OUT"
    fi
    return 0
}

absent() { ! "$@"; }

g() { git -C "$1" "${@:2}"; }

# commit_in <repo> <file> <text> [message]: write a file and commit it.
commit_in() {
    printf '%s\n' "$3" > "$1/$2"
    g "$1" add -- "$2" && g "$1" commit -q -m "${4:-change $2}"
}

# fixture <name> [default branch] [remote name]: a bare remote with two
# commits, a seed clone to push more from, and the session's clone at
# $TMP/<name>/main. Sets REPO and SEED.
fixture() {
    local name="$1" def="${2:-main}" rname="${3:-origin}"
    local d="$TMP/$name"
    mkdir -p "$d"
    git init -q --bare -b "$def" "$d/remote.git"
    git clone -q "$d/remote.git" "$d/seed" 2>/dev/null
    g "$d/seed" checkout -q -b "$def" 2>/dev/null
    commit_in "$d/seed" a.txt one
    commit_in "$d/seed" b.txt one
    g "$d/seed" push -q origin "$def"
    git clone -q -o "$rname" "$d/remote.git" "$d/main"
    REPO="$d/main"
    SEED="$d/seed"
    DEF="$def"
}

# advance <n> [file]: push n new commits from the seed.
advance() {
    local i=1 f="${2:-a.txt}"
    while [ "$i" -le "$1" ]; do
        commit_in "$SEED" "$f" "remote $i $RANDOM"
        i=$((i + 1))
    done
    g "$SEED" push -q origin "$DEF"
}

sha() { g "$1" rev-parse -q --verify "$2"; }

OUT=""
CTX=""
RC=0
ELAPSED=0
# ff <cwd> [source] [env assignments...]: run the hook on a SessionStart event
# from a directory outside every fixture, under the same bash as this test.
ff() {
    local cwd="$1" src="${2:-startup}" ev start
    shift; [ $# -gt 0 ] && shift
    ev=$(jq -nc --arg c "$cwd" --arg s "$src" '{session_id:"s-ff",hook_event_name:"SessionStart",source:$s,cwd:$c}')
    start=$(date +%s)
    OUT=$(cd "$TMP" && printf '%s' "$ev" | env "$@" "$BASH" "$HOOK" 2>"$TMP/stderr")
    RC=$?
    ELAPSED=$(( $(date +%s) - start ))
    CTX=$(printf '%s' "$OUT" | jq -r 'select(.hookSpecificOutput.hookEventName == "SessionStart") | .hookSpecificOutput.additionalContext // empty' 2>/dev/null)
    return 0
}

says() { case "$CTX" in *"$1"*) return 0 ;; esac; return 1; }
silent() { [ -z "$OUT" ]; }
one_line() { [ -n "$CTX" ] && [ "$(printf '%s' "$CTX" | wc -l | tr -d ' ')" = 0 ]; }

printf '\nThe hook is registered\n'
check 'hooks.json runs main-fast-forward.sh in the one SessionStart entry' \
    jq -e '[.hooks.SessionStart[0].hooks[] | select(.command | test("main-fast-forward\\.sh"))] | length == 1' "$HOOKS_JSON"
check 'its timeout leaves room for the bounded fetch and is under 30 s' \
    jq -e '[.hooks.SessionStart[0].hooks[] | select(.command | test("main-fast-forward\\.sh")) | .timeout] | .[0] >= 10 and .[0] <= 30' "$HOOKS_JSON"
check 'the hook is executable' test -x "$HOOK"

printf '\n1. Behind with the default branch out: fast-forwarded and counted\n'
fixture b01
advance 2
want=$(sha "$SEED" HEAD)
printf 'kept\n' > "$TMP/b01/main/untracked.txt"
ff "$REPO"
check 'B01 main moved to the remote head'                [ "$(sha "$REPO" refs/heads/main)" = "$want" ]
check 'B01 the work tree followed it'                    [ -z "$(g "$REPO" status --porcelain --untracked-files=no)" ]
check 'B01 the session is told it moved 2 commits'       says 'fast-forwarded main by 2 commits to origin/main'
check 'B01 the line is one line of SessionStart context' one_line
check 'B01 an untracked file is left alone'              grep -qx kept "$TMP/b01/main/untracked.txt"
check 'B01 no FETCH_HEAD is written'                     [ ! -e "$REPO/.git/FETCH_HEAD" ]
check 'B01 the move is logged'                           grep -q 'fast-forwarded main by 2 commits' "$BOARD_LOG_FILE"

fixture b02
advance 1
ff "$REPO"
check 'B02 one commit is said in the singular'           says 'fast-forwarded main by 1 commit to origin/main'

fixture b03
advance 1
mkdir -p "$TMP/b03/main/.git/hooks"
printf '#!/bin/sh\ntouch "%s"\n' "$TMP/b03/post-merge-ran" > "$TMP/b03/main/.git/hooks/post-merge"
chmod +x "$TMP/b03/main/.git/hooks/post-merge"
mkdir -p "$TMP/b03/main/sub"
ff "$TMP/b03/main/sub"
check 'B03 a session started in a subdirectory still moves main' [ "$(sha "$REPO" refs/heads/main)" = "$(sha "$SEED" HEAD)" ]
check 'B03 the repository'"'"'s own git hooks do not run'          [ ! -e "$TMP/b03/post-merge-ran" ]

fixture u01 main upstream
advance 1
ff "$REPO"
check 'U01 a remote named upstream takes origin'"'"'s place'     [ "$(sha "$REPO" refs/heads/main)" = "$(sha "$SEED" HEAD)" ]
check 'U01 the line names upstream/main'                 says 'to upstream/main'

fixture t01 trunk
advance 1
ff "$REPO"
check 'T01 the default branch is read from origin/HEAD'  [ "$(sha "$REPO" refs/heads/trunk)" = "$(sha "$SEED" HEAD)" ]
check 'T01 the line names trunk'                         says 'fast-forwarded trunk by 1 commit to origin/trunk'

printf '\nLevel, or ahead: nothing said\n'
fixture v01
before=$(sha "$REPO" refs/heads/main)
ff "$REPO"
check 'V01 level: main unchanged'                        [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'V01 level: the session is told nothing'           silent

fixture v02
commit_in "$REPO" c.txt local
before=$(sha "$REPO" refs/heads/main)
ff "$REPO"
check 'V02 ahead: main unchanged'                        [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'V02 ahead: the session is told nothing'           silent

printf '\n2. Another branch out: moved without a checkout, and the branch named\n'
fixture o01
g "$REPO" checkout -q -b feature
commit_in "$REPO" f.txt feature
feat=$(sha "$REPO" refs/heads/feature)
printf 'dirty\n' >> "$REPO/a.txt"
advance 3
printf '#!/bin/sh\necho x >> "%s"\nexec git upload-pack "$@"\n' "$TMP/o01/fetches" > "$TMP/o01/count-upload-pack"
chmod +x "$TMP/o01/count-upload-pack"
g "$REPO" config remote.origin.uploadpack "$TMP/o01/count-upload-pack"
ff "$REPO"
check 'O01 main moved to the remote head'                [ "$(sha "$REPO" refs/heads/main)" = "$(sha "$SEED" HEAD)" ]
check 'O01 the checkout stayed on feature'               [ "$(g "$REPO" symbolic-ref --short HEAD)" = feature ]
check 'O01 feature did not move'                         [ "$(sha "$REPO" refs/heads/feature)" = "$feat" ]
check 'O01 the change in the checkout is untouched'      [ "$(tail -1 "$REPO/a.txt")" = dirty ]
check 'O01 the session is told it moved 3 commits'       says 'fast-forwarded main by 3 commits to origin/main without a checkout'
check 'O01 the session is told feature is out'           says 'has feature out'
check 'O01 one fetch, no second network call'            [ "$(wc -l < "$TMP/o01/fetches" | tr -d ' ')" = 1 ]

fixture o02
g "$REPO" checkout -q -b feature
g "$REPO" checkout -q main
commit_in "$REPO" c.txt local
g "$REPO" checkout -q feature
before=$(sha "$REPO" refs/heads/main)
advance 1
ff "$REPO"
check 'O02 a diverged main is not moved with another branch out' [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'O02 the session is told why'                      says 'main has 1 commit origin/main lacks'

fixture o03
g "$REPO" checkout -q -b feature
g "$REPO" worktree add -q "$TMP/o03/wt" main
before=$(sha "$REPO" refs/heads/main)
advance 1
ff "$REPO"
check 'O03 main checked out in a linked worktree is not moved' [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'O03 the linked worktree'"'"'s files are untouched'  [ "$(cat "$TMP/o03/wt/a.txt")" = one ]
check 'O03 the session is told where main is out'        says "main is checked out in the linked worktree $TMP/o03/wt"

fixture o04
g "$REPO" checkout -q --detach
advance 1
ff "$REPO"
check 'O04 a detached HEAD: main moved'                  [ "$(sha "$REPO" refs/heads/main)" = "$(sha "$SEED" HEAD)" ]
check 'O04 the session is told HEAD is detached'         says 'has a detached HEAD out'

printf '\n3. Diverged, in the way, unreachable: nothing changed, and why\n'
fixture d01
commit_in "$REPO" c.txt local
before=$(sha "$REPO" refs/heads/main)
advance 2
ff "$REPO"
check 'D01 diverged: main unchanged'                     [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'D01 diverged: no merge commit, no rebase'         [ "$(sha "$REPO" HEAD)" = "$before" ]
check 'D01 the session is told both sides'               says 'main has 1 commit origin/main lacks, and origin/main has 2 it lacks'
check 'D01 and told to leave it as it is'                says 'left as it is'

fixture w01
g "$REPO" config merge.autoStash true
printf 'mine\n' > "$REPO/a.txt"
before=$(sha "$REPO" refs/heads/main)
advance 1 a.txt
ff "$REPO"
check 'W01 a changed file in the way: main unchanged'    [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'W01 the change is exactly as it was'              [ "$(cat "$REPO/a.txt")" = mine ]
check 'W01 nothing was stashed, autoStash or not'        [ -z "$(g "$REPO" stash list)" ]
check 'W01 the session is told which file is in the way' says 'a.txt'
check 'W01 and that the fast-forward was refused'        says 'refused'

fixture w02
before=$(sha "$REPO" refs/heads/main)
commit_in "$SEED" new.txt theirs
g "$SEED" push -q origin main
printf 'mine\n' > "$REPO/new.txt"
ff "$REPO"
check 'W02 an untracked file in the way: main unchanged' [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'W02 the untracked file is exactly as it was'      [ "$(cat "$REPO/new.txt")" = mine ]
check 'W02 the session is told which file is in the way' says 'new.txt'

fixture w03
printf 'mine\n' > "$REPO/b.txt"
printf 'staged\n' > "$REPO/c.txt"
g "$REPO" add c.txt
printf 'loose\n' > "$REPO/d.txt"
status_before=$(g "$REPO" status --porcelain)
advance 2 a.txt
ff "$REPO"
check 'W03 changes not in the way: main moved'           [ "$(sha "$REPO" refs/heads/main)" = "$(sha "$SEED" HEAD)" ]
check 'W03 the modified file is exactly as it was'       [ "$(cat "$REPO/b.txt")" = mine ]
check 'W03 the staged file is still staged'              [ "$(g "$REPO" diff --cached --name-only)" = c.txt ]
check 'W03 the untracked file is exactly as it was'      [ "$(cat "$REPO/d.txt")" = loose ]
check 'W03 git status reads the same as before'          [ "$(g "$REPO" status --porcelain)" = "$status_before" ]

fixture f01
before=$(sha "$REPO" refs/heads/main)
g "$REPO" remote set-url origin "$TMP/f01/gone.git"
ff "$REPO"
check 'F01 an unreachable remote: main unchanged'        [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'F01 the session is told the fetch failed'         says 'the fetch from origin failed'

fixture n01
g "$REPO" remote remove origin
ff "$REPO"
check 'N01 no remote: the session is told nothing'       silent
check 'N01 no remote: nothing is logged'                 absent grep -q "$REPO" "$BOARD_LOG_FILE"

printf '\n4. A linked worktree, or no repository: left untouched\n'
fixture l01
g "$REPO" worktree add -q -b feat "$TMP/l01/wt"
advance 1
before=$(sha "$REPO" refs/heads/main)
tracking=$(sha "$REPO" refs/remotes/origin/main)
ff "$TMP/l01/wt"
check 'L01 main unchanged from a linked worktree'        [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'L01 not even fetched'                             [ "$(sha "$REPO" refs/remotes/origin/main)" = "$tracking" ]
check 'L01 the session is told nothing'                  silent

mkdir -p "$TMP/x01/plain"
ff "$TMP/x01/plain"
check 'X01 outside a repository: the session is told nothing' silent

printf '\n5. A bounded fetch, and a session start that never fails\n'
fixture f02
before=$(sha "$REPO" refs/heads/main)
advance 1
printf '#!/bin/sh\necho $$ > "%s"\nexec sleep 30\n' "$TMP/f02/pid" > "$TMP/f02/slow-upload-pack"
chmod +x "$TMP/f02/slow-upload-pack"
g "$REPO" config remote.origin.uploadpack "$TMP/f02/slow-upload-pack"
ff "$REPO" startup CODER_FLEET_FETCH_TIMEOUT=1
check 'F02 a fetch that blocks is cut off'               [ "$ELAPSED" -le 5 ]
check 'F02 main unchanged'                               [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'F02 the session is told it timed out'             says 'did not finish within 1 s'
check 'F02 the blocked process is gone'                  absent kill -0 "$(cat "$TMP/f02/pid" 2>/dev/null || echo 999999)"

fixture f03
printf '#!/bin/sh\nenv > "%s"\nexec git upload-pack "$@"\n' "$TMP/f03/env" > "$TMP/f03/env-upload-pack"
chmod +x "$TMP/f03/env-upload-pack"
g "$REPO" config remote.origin.uploadpack "$TMP/f03/env-upload-pack"
ff "$REPO" startup GIT_ASKPASS=/usr/bin/false SSH_ASKPASS=/usr/bin/false
check 'F03 the fetch runs with terminal prompts off'     grep -qx 'GIT_TERMINAL_PROMPT=0' "$TMP/f03/env"
check 'F03 the fetch runs with no askpass helper'        grep -qx 'GIT_ASKPASS=' "$TMP/f03/env"
check 'F03 nor an ssh askpass helper'                    grep -qx 'SSH_ASKPASS=' "$TMP/f03/env"

fixture e01
advance 1
before=$(sha "$REPO" refs/heads/main)
ff "$REPO" compact
check 'E01 a compaction moves nothing'                   [ "$(sha "$REPO" refs/heads/main)" = "$before" ]
check 'E01 and says nothing'                             silent

ff "$REPO" startup CODER_FLEET_FAST_FORWARD=off
check 'E02 CODER_FLEET_FAST_FORWARD=off moves nothing'   [ "$(sha "$REPO" refs/heads/main)" = "$before" ]

OUT=$(cd "$TMP" && printf 'not json' | "$BASH" "$HOOK" 2>/dev/null)
RC=$?
check 'E03 unreadable input exits 0 and says nothing'    silent

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The session-start fast-forward does not hold its contract.\n'
    exit 1
fi
printf 'The session-start fast-forward moves the default branch by fast-forward alone.\n'
