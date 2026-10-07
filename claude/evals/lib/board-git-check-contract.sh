#!/usr/bin/env bash
#
# board-git-check-contract.sh - scripts/board-git-check.sh reports board
# writes that never reached a commit and an index.lock that blocks every board
# commit, from the main checkout or any of its worktrees, and deletes nothing
# (CF-21 criterion 2).
#
# On 2026-09-27 a stale .git/index.lock made every board commit fail for hours
# while the writes piled up uncommitted under .boards. /kickoff runs this
# script so the next one is seen at the start of a session. Every case runs the
# real script against a throwaway repository under a mktemp root.
#
# Usage:  claude/evals/lib/board-git-check-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
SCRIPT="$PLUGIN_ROOT/scripts/board-git-check.sh"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/board-git-check-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
HOLDER=""
cleanup() { [ -n "$HOLDER" ] && kill "$HOLDER" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY BOARD_LOCK_STALE_SECONDS
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

PASSED=0
FAILED=0
check() {
    # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$label"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s\n' "$label"
        [ "$VERBOSE" -eq 1 ] && printf '        rc=%s out: %s\n' "$RC" "$OUT"
    fi
    return 0
}
has() { grep -qF -- "$1" <<<"$OUT"; }
lacks() { ! grep -qF -- "$1" <<<"$OUT"; }
rc_is() { [ "$RC" -eq "$1" ]; }

OUT=""
RC=0
run() { RC=0; OUT="$(cd "$1" && bash "$SCRIPT" 2>&1)" || RC=$?; }

REPO="$TMP/repo"
WT="$TMP/wt"
mkdir -p "$REPO/.boards/tasks"
printf 'project_name: "t"\n' > "$REPO/.boards/config.yml"
printf '.focus\n' > "$REPO/.boards/.gitignore"
git -C "$REPO" init -q -b main
git -C "$REPO" add -A
git -C "$REPO" commit -qm base
git -C "$REPO" worktree add -q "$WT" -b agent-wt
LOCK="$REPO/.git/index.lock"

# A clean board says so and exits 0.
run "$REPO"
check 'clean: exits 0' rc_is 0
check 'clean: says the board is committed' has 'board check: ok'

# A focus file is never committed, so it is not a finding.
printf 'BD-1\n' > "$REPO/.boards/.focus"
run "$REPO"
check 'focus: an ignored focus file is not reported' rc_is 0
# Nor where no .boards/.gitignore ignores it, as on a board made before /init
# wrote one.
BARE="$TMP/no-ignore"
mkdir -p "$BARE/.boards/tasks"
printf 'project_name: "t"\n' > "$BARE/.boards/config.yml"
git -C "$BARE" init -q -b main
git -C "$BARE" add -A
git -C "$BARE" commit -qm base
printf 'BD-1\n' > "$BARE/.boards/.focus"
run "$BARE"
check 'focus: an unignored focus file is not reported either' rc_is 0

# Uncommitted writes, seen from the main checkout and from a worktree.
printf 'x\n' > "$REPO/.boards/tasks/bd-1 - One.md"
printf 'changed: yes\n' >> "$REPO/.boards/config.yml"
run "$REPO"
check 'uncommitted: exits 1' rc_is 1
check 'uncommitted: counts the changes' has '2 uncommitted change(s) under .boards'
check 'uncommitted: names a file' has 'bd-1 - One.md'
check 'uncommitted: names the main checkout' has "$REPO"
check 'uncommitted: gives the commit command' has "git -C \"$REPO\" add .boards"
run "$WT"
check 'uncommitted from a worktree: reports the main checkout' has '2 uncommitted change(s) under .boards'
check 'uncommitted from a worktree: is not about the worktree' lacks "$WT"
rm -f "$REPO/.boards/tasks/bd-1 - One.md"
git -C "$REPO" checkout -q -- .boards/config.yml

# A stale lock: old, and nothing holds it.
: > "$LOCK"
touch -t 202601010000 "$LOCK"
run "$WT"
check 'stale lock: exits 1' rc_is 1
check 'stale lock: names the lock' has "stale lock $LOCK"
check 'stale lock: gives the fix' has "rm \"$LOCK\""
check 'stale lock: is left in place' test -e "$LOCK"

# A young lock is a git command at work: a note, not a finding.
touch "$LOCK"
run "$REPO"
check 'young lock: exits 0' rc_is 0
check 'young lock: is noted' has 'probably a git command running'
check 'young lock: is not called stale' lacks 'stale lock'

# BOARD_LOCK_STALE_SECONDS sets the age that counts as stale.
touch -t 202601010000 "$LOCK"
RC=0; OUT="$(cd "$REPO" && BOARD_LOCK_STALE_SECONDS=999999999 bash "$SCRIPT" 2>&1)" || RC=$?
check 'threshold: an old lock under the threshold is not stale' lacks 'stale lock'

# An old lock some process holds open is not stale. lsof is how that is seen;
# without it the script cannot tell, and this case is skipped.
if command -v lsof >/dev/null 2>&1; then
    ( exec 9>>"$LOCK"; exec sleep 30 ) &
    HOLDER=$!
    touch -t 202601010000 "$LOCK"
    for _ in 1 2 3 4 5 6 7 8 9 10; do lsof -t -- "$LOCK" >/dev/null 2>&1 && break; sleep 0.2; done
    run "$REPO"
    check 'held lock: is not called stale' lacks 'stale lock'
    check 'held lock: names the holder' has "held by pid"
    kill "$HOLDER" 2>/dev/null; wait "$HOLDER" 2>/dev/null; HOLDER=""
else
    printf '  skipped: held lock (no lsof)\n'
fi
rm -f "$LOCK"

# Outside a repository there is nothing to check, and that is not an error.
mkdir -p "$TMP/nowhere"
run "$TMP/nowhere"
check 'no repository: exits 0' rc_is 0
check 'no repository: says so' has 'not in a git repository'

# A gitignored board is per checkout and never committed: nothing to report.
printf '.boards/\n' > "$REPO/.gitignore"
git -C "$REPO" add .gitignore
git -C "$REPO" rm -r -q --cached .boards
git -C "$REPO" commit -qm untrack
printf 'x\n' > "$REPO/.boards/tasks/bd-2 - Two.md"
run "$REPO"
check 'ignored board: exits 0' rc_is 0
check 'ignored board: says it is gitignored' has 'gitignored'

printf '\nboard-git-check: %s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
