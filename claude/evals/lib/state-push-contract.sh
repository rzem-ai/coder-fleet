#!/usr/bin/env bash
#
# state-push-contract.sh - hooks/state-push.sh pushes the coder-fleet/state
# branch to the remote the main checkout fetches from, as a branch of its own,
# after board and memory commits (CF-201, criterion 9).
#
# Case names:
#   pushes         P01-P02 --wait pushes the branch and says so in one line;
#                  P11 the default branch is never pushed
#   never forced   P03 a remote branch that moved on is left as it is, and the
#                  rejection is logged
#   blocks nothing P04 no remote, P05 a path remote, P06 a config key off the
#                  allowlist, P10 switched off: each pushes nothing, exits 0
#                  and says why; P07 a hung remote is cut off at the timeout;
#                  P09 without --wait it returns at once and pushes behind
#   no prompt      P08 terminal prompts and askpass helpers are off
#   one at a time  P12 a push already running takes the next one; nothing
#                  of the push's is under .git, and its directory is private
#   planted paths  P13 symlinks at the old .git paths, the pending mark, the
#                  lock and the push directory are never followed
#   destination    P14 a pushurl elsewhere, P15 a mirror key, P16 two fetch
#                  URLs and P18 a local insteadOf push nothing; P17 a pushurl
#                  equal to the fetch URL pushes
#   wired          B01 a board write, B02 a memory commit and B04 a spec
#                  commit push the branch; B03 a fresh clone gets the board and
#                  the memory back, and B05 the spec in its main checkout
#
# Remotes are ssh:// URLs served by a GIT_SSH_COMMAND stub, as in
# fast-forward-contract.sh, since the script refuses local paths; no case
# touches the network. The B cases need bun to run the board from source and
# skip, saying so, without it.
#
# Usage:  claude/evals/lib/state-push-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
PUSH="$PLUGIN_ROOT/hooks/state-push.sh"
MEMORY_HOOK="$PLUGIN_ROOT/hooks/memory-state.sh"
BOARD="$PLUGIN_ROOT/board/board.sh"
EXCLUDE="$PLUGIN_ROOT/scripts/fleet-exclude.py"

command -v jq >/dev/null 2>&1 || { printf 'state-push-contract: jq is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/state-push-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
cleanup() {
    [ -f "$TMP/slow.pid" ] && kill "$(cat "$TMP/slow.pid")" 2>/dev/null
    rm -rf "$TMP"
}
trap cleanup EXIT

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
unset CLAUDE_PLUGIN_DATA CODER_FLEET_BOARD_ROOT CODER_FLEET_STATE_PUSH CODER_FLEET_PUSH_TIMEOUT CODER_FLEET_BOARD_NO_COMMIT
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t
export BOARD_LOG_FILE="$TMP/hooks.log"
export CODER_FLEET_STATE_DIR="$TMP/state"

# The ssh git runs: serves upload-pack and receive-pack for the path in the
# URL. PUSH_SSH_ENV records its environment; PUSH_SSH_MODE=slow hangs.
cat > "$TMP/ssh-stub" <<'STUB'
#!/bin/sh
[ -n "${PUSH_SSH_ENV:-}" ] && env > "$PUSH_SSH_ENV"
case "${PUSH_SSH_MODE:-}" in
    slow) echo $$ > "$PUSH_SSH_PID"; exec sleep 30 ;;
esac
case "$2" in
    git-receive-pack*) eval "exec git receive-pack ${2#git-receive-pack }" ;;
    *) eval "exec git upload-pack ${2#git-upload-pack }" ;;
esac
STUB
chmod +x "$TMP/ssh-stub"
export GIT_SSH_COMMAND="$TMP/ssh-stub" GIT_SSH_VARIANT=simple

PASSED=0
FAILED=0
SKIPPED=0
OUT=""
RC=0
check() { # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$label"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s\n' "$label"
        printf '        rc=%s out=%s\n' "$RC" "$OUT"
    fi
    return 0
}
g() { git -C "$1" "${@:2}"; }
sha() { g "$1" rev-parse -q --verify "$2" 2>/dev/null; }
says() { case "$OUT" in *"$1"*) return 0 ;; esac; return 1; }
one_line() { [ -n "$OUT" ] && [ "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" = 1 ]; }
logged() { grep -qF -- "$1" "$BOARD_LOG_FILE"; }

# push [env assignments...] -- <dir>: the script with --wait, from outside every fixture.
push() {
    local envs=()
    while [ $# -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
    shift
    OUT=$(cd "$TMP" && env ${envs[@]+"${envs[@]}"} bash "$PUSH" --wait "$1" 2>/dev/null)
    RC=$?
}

# fixture <name>: a bare remote with main, the session's clone of it reaching
# the remote through the stub, and a state worktree on coder-fleet/state with
# one board commit. Sets REPO, REMOTE and STATE.
fixture() {
    local d="$TMP/$1"
    mkdir -p "$d"
    git init -q --bare -b main "$d/remote.git"
    git init -q -b main "$d/main"
    printf 'product\n' > "$d/main/README.md"
    g "$d/main" add README.md
    g "$d/main" commit -q -m base
    g "$d/main" remote add origin "ssh://fixture.invalid$d/remote.git"
    g "$d/main" push -q origin main
    g "$d/main" worktree add -q "$d/main/.claude/worktrees/coder-fleet-state" -b coder-fleet/state
    mkdir -p "$d/main/.claude/worktrees/coder-fleet-state/.boards"
    printf 'auto_commit: true\n' > "$d/main/.claude/worktrees/coder-fleet-state/.boards/config.yml"
    g "$d/main/.claude/worktrees/coder-fleet-state" add -f .boards
    g "$d/main/.claude/worktrees/coder-fleet-state" commit -q -m "a board write"
    REPO="$d/main"
    REMOTE="$d/remote.git"
    STATE="$d/main/.claude/worktrees/coder-fleet-state"
}

state_write() { # one more board commit on the state branch
    printf '%s\n' "$RANDOM" >> "$STATE/.boards/config.yml"
    g "$STATE" commit -q -am "another board write"
}

# --- pushes ----------------------------------------------------------------------

fixture p01
MAIN_REMOTE=$(sha "$REMOTE" refs/heads/main)
printf 'ahead\n' >> "$REPO/README.md"; g "$REPO" commit -q -am "local work not pushed"
push -- "$REPO"
check 'P01 exits 0' test "$RC" = 0
check 'P01 the remote has coder-fleet/state at the local tip' test "$(sha "$REMOTE" refs/heads/coder-fleet/state)" = "$(sha "$REPO" refs/heads/coder-fleet/state)"
check 'P01 says so in one line' sh -c 'case "$1" in "pushed coder-fleet/state to origin"*) exit 0;; esac; exit 1' _ "$OUT"
check 'P01 and only one line' one_line
check 'P11 the default branch on the remote did not move' test "$(sha "$REMOTE" refs/heads/main)" = "$MAIN_REMOTE"
state_write
push -- "$REPO"
check 'P02 a later commit is pushed as a fast-forward' test "$(sha "$REMOTE" refs/heads/coder-fleet/state)" = "$(sha "$REPO" refs/heads/coder-fleet/state)"

# --- never forced ----------------------------------------------------------------

fixture p03
push -- "$REPO"
git clone -q "$REMOTE" "$TMP/p03/other" 2>/dev/null
g "$TMP/p03/other" checkout -q coder-fleet/state
printf 'elsewhere\n' >> "$TMP/p03/other/.boards/config.yml"
g "$TMP/p03/other" commit -q -am "a write on another machine"
g "$TMP/p03/other" push -q origin coder-fleet/state
THEIRS=$(sha "$REMOTE" refs/heads/coder-fleet/state)
state_write
OURS=$(sha "$REPO" refs/heads/coder-fleet/state)
push -- "$REPO"
check 'P03 a rejected push exits 0' test "$RC" = 0
check 'P03 the remote branch is left as the other machine pushed it' test "$(sha "$REMOTE" refs/heads/coder-fleet/state)" = "$THEIRS"
check 'P03 the local branch is left as it was' test "$(sha "$REPO" refs/heads/coder-fleet/state)" = "$OURS"
check 'P03 the line says it was rejected and never forced' sh -c 'case "$1" in *rejected*"never forced"*) exit 0;; esac; exit 1' _ "$OUT"
check 'P03 the rejection is logged' logged 'coder-fleet/state was rejected'

# --- blocks nothing --------------------------------------------------------------

fixture p04
g "$REPO" remote remove origin
push -- "$REPO"
check 'P04 no remote exits 0 and says so' sh -c '[ "$1" = 0 ] && case "$2" in *"no remote"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"

fixture p05
g "$REPO" remote set-url origin "$REMOTE"
push -- "$REPO"
check 'P05 a path remote is not pushed' sh -c '! git -C "$1" rev-parse -q --verify refs/heads/coder-fleet/state' _ "$REMOTE"
check 'P05 exits 0 and says why' sh -c '[ "$1" = 0 ] && case "$2" in *"https, ssh and git"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"

fixture p06
g "$REPO" config remote.origin.receivepack "touch $TMP/p06/ran; git-receive-pack"
push -- "$REPO"
check 'P06 a key off the allowlist pushes nothing' sh -c '! git -C "$1" rev-parse -q --verify refs/heads/coder-fleet/state && [ ! -e "$2" ]' _ "$REMOTE" "$TMP/p06/ran"
check 'P06 exits 0 and names the key' sh -c '[ "$1" = 0 ] && case "$2" in *remote.origin.receivepack*) exit 0;; esac; exit 1' _ "$RC" "$OUT"

fixture p10
push CODER_FLEET_STATE_PUSH=off -- "$REPO"
check 'P10 switched off pushes nothing and prints nothing' sh -c '[ "$1" = 0 ] && [ -z "$2" ] && ! git -C "$3" rev-parse -q --verify refs/heads/coder-fleet/state' _ "$RC" "$OUT" "$REMOTE"

fixture p07
start=$(date +%s)
push PUSH_SSH_MODE=slow "PUSH_SSH_PID=$TMP/slow.pid" CODER_FLEET_PUSH_TIMEOUT=1 -- "$REPO"
took=$(( $(date +%s) - start ))
check 'P07 a hung remote is cut off at the timeout' test "$took" -le 4
check 'P07 exits 0 and says it did not finish' sh -c '[ "$1" = 0 ] && case "$2" in *"did not finish"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"
check 'P07 the stub was killed with it' sh -c '! kill -0 "$(cat "$1")" 2>/dev/null' _ "$TMP/slow.pid"

fixture p08
push "PUSH_SSH_ENV=$TMP/p08/env" GIT_ASKPASS=/bin/echo SSH_ASKPASS=/bin/echo -- "$REPO"
check 'P08 terminal prompts are off' grep -qx 'GIT_TERMINAL_PROMPT=0' "$TMP/p08/env"
check 'P08 askpass helpers are off' sh -c 'grep -qx "GIT_ASKPASS=" "$1" && grep -qx "SSH_ASKPASS=" "$1" && grep -qx "SSH_ASKPASS_REQUIRE=never" "$1"' _ "$TMP/p08/env"

fixture p09
start=$(date +%s)
OUT=$(cd "$TMP" && bash "$PUSH" "$REPO" 2>&1)
RC=$?
took=$(( $(date +%s) - start ))
check 'P09 without --wait it returns at once, prints nothing and exits 0' sh -c '[ "$1" = 0 ] && [ -z "$2" ] && [ "$3" -le 1 ]' _ "$RC" "$OUT" "$took"
i=0
while [ "$i" -lt 50 ] && [ "$(sha "$REMOTE" refs/heads/coder-fleet/state)" != "$(sha "$REPO" refs/heads/coder-fleet/state)" ]; do sleep 0.2; i=$((i + 1)); done
check 'P09 and the push lands behind it' test "$(sha "$REMOTE" refs/heads/coder-fleet/state)" = "$(sha "$REPO" refs/heads/coder-fleet/state)"

fixture p12
LOCKS="$CODER_FLEET_STATE_DIR/state-push"
lock_key() { printf '%s' "$(git -C "$1" rev-parse --path-format=absolute --git-common-dir)" | git hash-object --stdin | cut -c1-16; }
sleep 30 & holder=$!
mkdir -p "$LOCKS/$(lock_key "$REPO").lock"
printf '%s\n' "$holder" > "$LOCKS/$(lock_key "$REPO").lock/pid"
push -- "$REPO"
check 'P12 a push already running takes this one' sh -c '[ "$1" = 0 ] && case "$2" in *"already running"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"
check 'P12 and is told to push again' test -d "$LOCKS/$(lock_key "$REPO").pending"
kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
push -- "$REPO"
check 'P12 a lock whose holder is gone is taken' test "$(sha "$REMOTE" refs/heads/coder-fleet/state)" = "$(sha "$REPO" refs/heads/coder-fleet/state)"
check 'P12 the push keeps nothing under .git' test ! -e "$REPO/.git/coder-fleet"
check 'P12 its directory is private to this user' sh -c '[ -O "$1" ] && [ "$(ls -ld "$1" | cut -c1-10)" = drwx------ ]' _ "$LOCKS"
check 'P12 the remote-tracking ref follows the push' test "$(sha "$REPO" refs/remotes/origin/coder-fleet/state)" = "$(sha "$REPO" refs/heads/coder-fleet/state)"

# --- planted paths, pushurl, mirror ------------------------------------------------

fixture p13
mkdir -p "$REPO/.git/coder-fleet" "$TMP/p13/victim-dir"
printf 'victim\n' > "$TMP/p13/victim"
ln -s "$TMP/p13/victim-dir" "$REPO/.git/coder-fleet/state-push.lock"
ln -s "$TMP/p13/victim" "$REPO/.git/coder-fleet/state-push.err"
ln -s "$TMP/p13/victim" "$REPO/.git/coder-fleet/state-push.pending"
push -- "$REPO"
check 'P13 symlinks planted at the old .git paths are never touched' sh -c '[ "$(cat "$1")" = victim ] && [ -z "$(ls -A "$2")" ] && [ -L "$3/state-push.lock" ] && [ -L "$3/state-push.err" ]' _ "$TMP/p13/victim" "$TMP/p13/victim-dir" "$REPO/.git/coder-fleet"
check 'P13 and the push still lands' test "$(sha "$REMOTE" refs/heads/coder-fleet/state)" = "$(sha "$REPO" refs/heads/coder-fleet/state)"
sleep 30 & holder=$!
mkdir -p "$LOCKS/$(lock_key "$REPO").lock"
printf '%s\n' "$holder" > "$LOCKS/$(lock_key "$REPO").lock/pid"
ln -s "$TMP/p13/victim" "$LOCKS/$(lock_key "$REPO").pending"
push -- "$REPO"
check 'P13 a symlink at the pending mark is refused and its target is unchanged' sh -c '[ "$1" = 0 ] && [ "$(cat "$2")" = victim ] && case "$3" in *symlink*) exit 0;; esac; exit 1' _ "$RC" "$TMP/p13/victim" "$OUT"
kill "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
rm -rf "$LOCKS/$(lock_key "$REPO").lock" "$LOCKS/$(lock_key "$REPO").pending"
ln -s "$TMP/p13/victim-dir" "$LOCKS/$(lock_key "$REPO").lock"
push -- "$REPO"
check 'P13 a symlink at the lock is refused and nothing is written through it' sh -c '[ "$1" = 0 ] && [ -z "$(ls -A "$2")" ] && case "$3" in *symlink*) exit 0;; esac; exit 1' _ "$RC" "$TMP/p13/victim-dir" "$OUT"
rm -f "$LOCKS/$(lock_key "$REPO").lock"
mv "$LOCKS" "$LOCKS.real"; ln -s "$LOCKS.real" "$LOCKS"
push -- "$REPO"
check 'P13 a symlinked push directory is refused' sh -c '[ "$1" = 0 ] && case "$2" in *symlink*) exit 0;; esac; exit 1' _ "$RC" "$OUT"
rm -f "$LOCKS"; mv "$LOCKS.real" "$LOCKS"

fixture p14
git init -q --bare -b main "$TMP/p14/elsewhere.git"
g "$REPO" config remote.origin.pushurl "ssh://fixture.invalid$TMP/p14/elsewhere.git"
push -- "$REPO"
check 'P14 a local pushurl to somewhere else pushes nothing there or to origin' sh -c '! git -C "$1" rev-parse -q --verify refs/heads/coder-fleet/state && ! git -C "$2" rev-parse -q --verify refs/heads/coder-fleet/state' _ "$TMP/p14/elsewhere.git" "$REMOTE"
check 'P14 exits 0 and says to tell the human' sh -c '[ "$1" = 0 ] && case "$2" in *pushurl*"tell the human"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"

fixture p15
git clone -q "$REMOTE" "$TMP/p15/seed" 2>/dev/null
g "$TMP/p15/seed" push -q origin main:refs/heads/someone-else
g "$REPO" config remote.origin.mirror true
push -- "$REPO"
check 'P15 a local mirror key pushes nothing' sh -c '! git -C "$1" rev-parse -q --verify refs/heads/coder-fleet/state' _ "$REMOTE"
check 'P15 and deletes no remote branch' sh -c 'git -C "$1" rev-parse -q --verify refs/heads/someone-else && git -C "$1" rev-parse -q --verify refs/heads/main' _ "$REMOTE"
check 'P15 exits 0 and names the key' sh -c '[ "$1" = 0 ] && case "$2" in *remote.origin.mirror*) exit 0;; esac; exit 1' _ "$RC" "$OUT"

fixture p16
g "$REPO" config --add remote.origin.url "ssh://fixture.invalid$TMP/p16/second.git"
push -- "$REPO"
check 'P16 two remote.origin.url values push nothing' sh -c '! git -C "$1" rev-parse -q --verify refs/heads/coder-fleet/state' _ "$REMOTE"
check 'P16 exits 0 and says why' sh -c '[ "$1" = 0 ] && case "$2" in *"exactly one"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"

fixture p17
g "$REPO" config remote.origin.pushurl "$(g "$REPO" config remote.origin.url)"
push -- "$REPO"
check 'P17 a pushurl equal to the fetch URL pushes' test "$(sha "$REMOTE" refs/heads/coder-fleet/state)" = "$(sha "$REPO" refs/heads/coder-fleet/state)"

fixture p18
git init -q --bare -b main "$TMP/p18/elsewhere.git"
g "$REPO" config "url.ssh://fixture.invalid$TMP/p18/elsewhere.git.insteadOf" "ssh://fixture.invalid$REMOTE"
push -- "$REPO"
check 'P18 a local insteadOf that rewrites the fetch URL pushes nothing anywhere' sh -c '! git -C "$1" rev-parse -q --verify refs/heads/coder-fleet/state && ! git -C "$2" rev-parse -q --verify refs/heads/coder-fleet/state' _ "$REMOTE" "$TMP/p18/elsewhere.git"
check 'P18 exits 0 and says the key is off the list' sh -c '[ "$1" = 0 ] && case "$2" in *"not on the list"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"

fixture p19
git init -q --bare -b main "$TMP/p19/elsewhere.git"
g "$REPO" config "remote.ssh://fixture.invalid$REMOTE.pushurl" "ssh://fixture.invalid$TMP/p19/elsewhere.git"
push -- "$REPO"
check 'P19 a remote section named for the URL, with a pushurl elsewhere, pushes nothing anywhere' sh -c '! git -C "$1" rev-parse -q --verify refs/heads/coder-fleet/state && ! git -C "$2" rev-parse -q --verify refs/heads/coder-fleet/state' _ "$REMOTE" "$TMP/p19/elsewhere.git"
check 'P19 exits 0 and says the key is off the list' sh -c '[ "$1" = 0 ] && case "$2" in *"not on the list"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"

for legacy in remotes branches; do
    fixture "p20$legacy"
    git init -q --bare -b main "$TMP/p20$legacy/elsewhere.git"
    mkdir -p "$REPO/.git/$legacy"
    printf 'URL: ssh://fixture.invalid%s/elsewhere.git\n' "$TMP/p20$legacy" > "$REPO/.git/$legacy/origin"
    push -- "$REPO"
    check "P20 a file under $legacy/ pushes nothing anywhere" sh -c '! git -C "$1" rev-parse -q --verify refs/heads/coder-fleet/state && ! git -C "$2" rev-parse -q --verify refs/heads/coder-fleet/state' _ "$REMOTE" "$TMP/p20$legacy/elsewhere.git"
    check "P20 a file under $legacy/: exits 0 and says why" sh -c '[ "$1" = 0 ] && case "$2" in *"legacy remote files"*) exit 0;; esac; exit 1' _ "$RC" "$OUT"
done

# --- wired -------------------------------------------------------------------------

wait_pushed() { # $1 repo, $2 remote: polls up to 15 s for the remote to match
    local i=0
    while [ "$i" -lt 75 ]; do
        [ "$(sha "$2" refs/heads/coder-fleet/state)" = "$(sha "$1" refs/heads/coder-fleet/state)" ] && [ -n "$(sha "$1" refs/heads/coder-fleet/state)" ] && return 0
        sleep 0.2; i=$((i + 1))
    done
    return 1
}

if ! command -v bun >/dev/null 2>&1 || [ ! -d "$PLUGIN_ROOT/board/node_modules" ]; then
    printf '  SKIP  B01-B05 need bun and the board'"'"'s node_modules (bun install --frozen-lockfile in claude/coder-fleet/board)\n'
    SKIPPED=5
else
    d="$TMP/b"
    mkdir -p "$d"
    git init -q --bare -b main "$d/remote.git"
    git init -q -b main "$d/main"
    REPO="$d/main"; REMOTE="$d/remote.git"
    printf 'product\n' > "$REPO/README.md"
    g "$REPO" add README.md; g "$REPO" commit -q -m base
    g "$REPO" config user.email t@t; g "$REPO" config user.name t
    g "$REPO" remote add origin "ssh://fixture.invalid$REMOTE"
    g "$REPO" push -q origin main
    g "$REPO" remote set-head origin main
    (cd "$REPO" && python3 -I "$EXCLUDE" write) >/dev/null
    mkdir -p "$REPO/.boards/tasks" "$REPO/.claude/agent-memory/coder-fleet-coder"
    printf 'project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "In Progress", "Done"]\ndefault_status: "To Do"\nauto_commit: true\n' > "$REPO/.boards/config.yml"
    printf '.focus\n' > "$REPO/.boards/.gitignore"
    (cd "$REPO" && bash "$BOARD" task create "One" --by lead) >/dev/null 2>&1
    RC=$?; OUT=""
    check 'B01 a board write exits 0' test "$RC" = 0
    check 'B01 and the state branch reaches the remote' wait_pushed "$REPO" "$REMOTE"
    check 'B01 with the card on it' g "$REMOTE" cat-file -e 'refs/heads/coder-fleet/state:.boards/tasks/bd-1 - One.md'
    note="$REPO/.claude/agent-memory/coder-fleet-coder/MEMORY.md"
    printf -- '- remember this\n' > "$note"
    ev=$(jq -nc --arg c "$REPO" --arg f "$note" '{session_id:"s1",hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$f},cwd:$c,agent_type:"coder-fleet:coder"}')
    (cd "$TMP" && printf '%s' "$ev" | CLAUDE_PROJECT_DIR="$REPO" bash "$MEMORY_HOOK" post) >/dev/null 2>&1
    check 'B02 a memory commit reaches the remote too' sh -c 'i=0; while [ $i -lt 75 ]; do git -C "$1" cat-file -e refs/heads/coder-fleet/state:.claude/agent-memory/coder-fleet-coder/MEMORY.md 2>/dev/null && exit 0; sleep 0.2; i=$((i+1)); done; exit 1' _ "$REMOTE"
    mkdir -p "$REPO/docs/specs"
    printf '# BD-1\n\nthe spec\n' > "$REPO/docs/specs/BD-1.md"
    ev=$(jq -nc --arg c "$REPO" --arg f "$REPO/docs/specs/BD-1.md" '{session_id:"s1",hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:$f},cwd:$c,agent_type:"coder-fleet:spec-writer"}')
    (cd "$TMP" && printf '%s' "$ev" | CLAUDE_PROJECT_DIR="$REPO" bash "$MEMORY_HOOK" post) >/dev/null 2>&1
    check 'B04 a spec commit reaches the remote too' sh -c 'i=0; while [ $i -lt 75 ]; do git -C "$1" cat-file -e refs/heads/coder-fleet/state:docs/specs/BD-1.md 2>/dev/null && exit 0; sleep 0.2; i=$((i+1)); done; exit 1' _ "$REMOTE"
    check 'B04 and never the default branch' sh -c '! git -C "$1" cat-file -e refs/heads/main:docs/specs/BD-1.md 2>/dev/null' _ "$REMOTE"
    wait_pushed "$REPO" "$REMOTE"
    git clone -q "$REMOTE" "$d/clone" 2>/dev/null
    OUT=$(cd "$d/clone" && bash "$BOARD" task list --plain 2>&1)
    RC=$?
    check 'B03 a fresh clone lists the board' sh -c '[ "$1" = 0 ] && case "$2" in *One*) exit 0;; esac; exit 1' _ "$RC" "$OUT"
    check 'B03 and has the memory back in its state worktree' grep -qx -- '- remember this' "$d/clone/.claude/worktrees/coder-fleet-state/.claude/agent-memory/coder-fleet-coder/MEMORY.md"
    check 'B05 and the spec back in its main checkout, untracked and excluded' sh -c 'grep -qx "the spec" "$1/docs/specs/BD-1.md" && [ -z "$(git -C "$1" status --porcelain --untracked-files=all)" ]' _ "$d/clone"
fi

printf '\n%s passed, %s failed' "$PASSED" "$FAILED"
[ "$SKIPPED" -gt 0 ] && printf ', %s skipped' "$SKIPPED"
printf '\n'
if [ "$FAILED" -ne 0 ]; then
    printf 'The state branch may not reach the remote, or a push may wait, prompt, force or touch the default branch.\n'
    exit 1
fi
printf 'The state branch is pushed on its own, bounded and never forced, and a failure blocks nothing.\n'
