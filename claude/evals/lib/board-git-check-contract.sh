#!/usr/bin/env bash
#
# board-git-check-contract.sh - scripts/board-git-check.sh reports board
# writes that never reached a commit and an index.lock that blocks every board
# commit, from the main checkout or any of its worktrees, and deletes nothing.
#
# A stale .git/index.lock makes every board commit fail while the writes pile
# up uncommitted under .boards. /kickoff runs this script so one is seen at
# the start of a session. Every case runs the
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
printf 'project_name: "t"\nauto_commit: true\n' > "$REPO/.boards/config.yml"
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
printf 'project_name: "t"\nauto_commit: true\n' > "$BARE/.boards/config.yml"
git -C "$BARE" init -q -b main
git -C "$BARE" add -A
git -C "$BARE" commit -qm base
printf 'BD-1\n' > "$BARE/.boards/.focus"
run "$BARE"
check 'focus: an unignored focus file is not reported either' rc_is 0

# The printed fix is run as printed, and commits every board write and never
# the focus file, whether .boards/.gitignore ignores it (where an exclude
# pathspec makes git add exit 1) or not.
fix_cmd() { sed -n 's/^board check: .*commit them: //p' <<<"$OUT"; }
fix_runs() { # $1 checkout -> 0 when its printed fix leaves only the focus file uncommitted, and no commit holds it
    local cmd
    cmd="$(fix_cmd)"
    [ -n "$cmd" ] || return 1
    eval "$cmd" >/dev/null 2>&1 || return 1
    [ -z "$(git -C "$1" status --porcelain --untracked-files=all -- .boards ':(exclude).boards/.focus')" ] \
      && [ -z "$(git -C "$1" log --format= --name-only -- .boards/.focus)" ] \
      && [ -z "$(git -C "$1" diff --cached --name-only)" ]
}
# The last line: a focus file left staged would ride the human's next commit.
printf 'x\n' > "$BARE/.boards/tasks/bd-1 - One.md"
run "$BARE"
check 'fix, focus not ignored: is printed' rc_is 1
check 'fix, focus not ignored: commits the writes and leaves the focus file' fix_runs "$BARE"
printf 'x\n' > "$REPO/.boards/tasks/bd-9 - Nine.md"
run "$REPO"
check 'fix, focus ignored: commits the writes and leaves the focus file' fix_runs "$REPO"
run "$REPO"
check 'fix: leaves a clean board' rc_is 0

# git status runs with --no-optional-locks, so the check never takes the
# index lock out from under a board commit. A git on PATH records its calls.
WRAP="$TMP/wrap"
mkdir -p "$WRAP"
REAL_GIT="$(command -v git)"
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "%s/calls"\nexec "%s" "$@"\n' "$WRAP" "$REAL_GIT" > "$WRAP/git"
chmod +x "$WRAP/git"
RC=0; OUT="$(cd "$REPO" && PATH="$WRAP:$PATH" bash "$SCRIPT" 2>&1)" || RC=$?
status_unlocked() { grep -q ' status ' "$WRAP/calls" && ! grep ' status ' "$WRAP/calls" | grep -qv -- '--no-optional-locks'; }
check 'status: takes no optional lock' status_unlocked

# Uncommitted writes, seen from the main checkout and from a worktree.
printf 'x\n' > "$REPO/.boards/tasks/bd-1 - One.md"
printf 'changed: yes\n' >> "$REPO/.boards/config.yml"
run "$REPO"
check 'uncommitted: exits 1' rc_is 1
check 'uncommitted: counts the changes' has '2 uncommitted change(s) under .boards'
check 'uncommitted: names a file' has 'bd-1 - One.md'
check 'uncommitted: names the main checkout' has "$REPO"
check 'uncommitted: gives the commit command' has "git -C \"$REPO\" add"
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

# The lock's age must not depend on which stat is installed. GNU stat reads
# BSD's `-f %m FILE` as "file system status of %m and FILE": it prints FILE's
# file system on stdout and exits 1 for the missing %m, so a fallback chain
# that tries stat first captures that text as the mtime and dies in the
# arithmetic, breaking every age and holder case on a Linux runner (as in
# ubuntu:24.04, coreutils stat). A stat on PATH that does
# the same, and fails every other form, holds the script to that anywhere.
GNUSTAT="$TMP/gnustat"
mkdir -p "$GNUSTAT"
# shellcheck disable=SC2016 # the fake's own $3, expanded when it runs
printf '#!/bin/sh\n[ "$1" = -f ] && { echo "  File: \\"$3\\""; echo "    ID: 0 Namelen: 255 Type: overlayfs"; }\nexit 1\n' > "$GNUSTAT/stat"
chmod +x "$GNUSTAT/stat"
RC=0; OUT="$(cd "$REPO" && PATH="$GNUSTAT:$PATH" bash "$SCRIPT" 2>&1)" || RC=$?
check 'GNU stat on PATH: an old unheld lock is still stale' has "stale lock $LOCK"
check 'GNU stat on PATH: and gives the fix' has "rm \"$LOCK\""
touch "$LOCK"
RC=0; OUT="$(cd "$REPO" && PATH="$GNUSTAT:$PATH" bash "$SCRIPT" 2>&1)" || RC=$?
check 'GNU stat on PATH: a young lock is still young' has 'probably a git command running'
check 'GNU stat on PATH: and exits 0' rc_is 0
touch -t 202601010000 "$LOCK"

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
    check 'held lock: exits 0' rc_is 0
    check 'held lock: is not called stale' lacks 'stale lock'
    check 'held lock: names the holder' has "held by pid $HOLDER"
    kill "$HOLDER" 2>/dev/null; wait "$HOLDER" 2>/dev/null; HOLDER=""
else
    printf '  skipped: held lock (no lsof)\n'
fi

# Without lsof the script falls back to any running git process. A PATH with
# no lsof on it, and a pgrep that answers, proves that branch; where lsof
# sits in /usr/bin or /bin, as on Linux, it cannot be hidden and this is
# skipped.
NOLSOF="$TMP/nolsof"
mkdir -p "$NOLSOF"
ln -s "$REAL_GIT" "$NOLSOF/git"
if ! ( PATH="$NOLSOF:/usr/bin:/bin"; command -v lsof ) >/dev/null 2>&1; then
    # shellcheck disable=SC2016 # the fake's own $1 and $2, expanded when it runs
    printf '#!/bin/sh\n[ "$1 $2" = "-x git" ] && echo 4242\n' > "$NOLSOF/pgrep"
    chmod +x "$NOLSOF/pgrep"
    RC=0; OUT="$(cd "$REPO" && PATH="$NOLSOF:/usr/bin:/bin" bash "$SCRIPT" 2>&1)" || RC=$?
    check 'pgrep, git running: exits 0' rc_is 0
    check 'pgrep, git running: names the git process' has 'held by pid 4242'
    printf '#!/bin/sh\nexit 1\n' > "$NOLSOF/pgrep"
    RC=0; OUT="$(cd "$REPO" && PATH="$NOLSOF:/usr/bin:/bin" bash "$SCRIPT" 2>&1)" || RC=$?
    check 'pgrep, no git running: the old lock is stale' has "stale lock $LOCK"
else
    printf '  skipped: pgrep fallback (lsof cannot be hidden from PATH here)\n'
fi
rm -f "$LOCK"

# A board whose config turns commits off leaves every write uncommitted by
# design: the check says so, does not fail on it, and still checks the lock.
OFF="$TMP/off"
mkdir -p "$OFF/.boards/tasks"
printf 'project_name: "t"\nauto_commit: false\n' > "$OFF/.boards/config.yml"
git -C "$OFF" init -q -b main
git -C "$OFF" add -A
git -C "$OFF" commit -qm base
printf 'x\n' > "$OFF/.boards/tasks/bd-1 - One.md"
run "$OFF"
check 'auto_commit off: exits 0 with writes uncommitted' rc_is 0
check 'auto_commit off: says commits are off' has 'auto_commit is not true'
check 'auto_commit off: does not count the writes as a finding' lacks 'never reached a commit'
: > "$OFF/.git/index.lock"
touch -t 202601010000 "$OFF/.git/index.lock"
run "$OFF"
check 'auto_commit off: still reports a stale lock' has "stale lock $OFF/.git/index.lock"
check 'auto_commit off: a stale lock still fails' rc_is 1
rm -f "$OFF/.git/index.lock"

# Once the board has moved to the state worktree, that is where its writes are
# committed, and the main checkout's .boards is a copy as of the move. The
# fixture moves the way the binary does: the state branch is cut from the
# default branch's base, the main checkout's working .boards is copied over it,
# an unpushed board commit and an uncommitted change included, and the copy is
# the one "Move the board to the state worktree" commit. What the move took
# across is no finding; uncommitted writes and a lock are the state worktree's,
# which has an index of its own.
SR="$TMP/state-repo"
SW="$SR/.claude/worktrees/coder-fleet-state"
mkdir -p "$SR/.boards/tasks"
printf 'project_name: "t"\nauto_commit: true\n' > "$SR/.boards/config.yml"
printf '.focus\n' > "$SR/.boards/.gitignore"
git -C "$SR" init -q -b main
git -C "$SR" add -A
git -C "$SR" commit -qm base
SR_BASE="$(git -C "$SR" rev-parse main)"
printf 'unpushed before the move\n' > "$SR/.boards/tasks/bd-0 - Zero.md"
git -C "$SR" add -A
git -C "$SR" commit -qm 'Create BD-0'
printf 'left from before the move\n' > "$SR/.boards/tasks/bd-1 - One.md"
printf 'BD-1\n' > "$SR/.boards/.focus"
printf '/.claude/worktrees/\n' >> "$SR/.git/info/exclude"
git -C "$SR" worktree add -q -b coder-fleet/state "$SW" "$SR_BASE"
rm -rf "$SW/.boards"
cp -R "$SR/.boards" "$SW/.boards"
git -C "$SW" add -- .boards
git -C "$SW" commit -qm 'Move the board to the state worktree' -- .boards
SR_HEAD="$(git -C "$SR" rev-parse main)"
WT_SR="$TMP/state-agent-wt"
git -C "$SR" worktree add -q "$WT_SR" -b agent-sr
run "$SR"
check 'state worktree: a clean one exits 0' rc_is 0
check 'state worktree: says the board is committed there' has "every board write in $SW is committed"
check 'state worktree: the main checkout copy is no finding' lacks 'never reached a commit'
mkdir -p "$SW/.boards/tasks"
printf 'x\n' > "$SW/.boards/tasks/bd-2 - Two.md"
run "$SR/.boards"
check 'state worktree: an uncommitted write exits 1' rc_is 1
check 'state worktree: counts only its own change' has '1 uncommitted change(s) under .boards'
check 'state worktree: names it' has "in $SW"
check 'state worktree: the printed fix commits on the state branch and not on main' fix_runs "$SW"
check 'state worktree: main has not moved' test "$(git -C "$SR" rev-parse main)" = "$SR_HEAD"
check 'state worktree: the commit is on coder-fleet/state' test "$(git -C "$SR" log -1 --format=%s coder-fleet/state)" = 'Commit board writes'
SW_LOCK="$(git -C "$SW" rev-parse --path-format=absolute --git-path index.lock)"
: > "$SW_LOCK"
touch -t 202601010000 "$SW_LOCK"
run "$SR"
check 'state worktree: its stale lock is the one reported' has "stale lock $SW_LOCK"
rm -f "$SW_LOCK"

# A session that started on an older plugin version keeps its old binary, which
# still writes the main checkout's .boards and commits on its branch after the
# move. Those writes are in no board anyone reads, so they are a finding: the
# main checkout's .boards is compared with what the move took across, and a
# path that differs from it and from the state branch is named.
printf 'written after the move\n' > "$SR/.boards/tasks/bd-1 - One.md"
run "$SR"
check "after the move: an old session's uncommitted write in main exits 1" rc_is 1
check 'after the move: is reported as written since the move' has 'since the board moved'
check 'after the move: names the file' has 'bd-1 - One.md'
check 'after the move: not a change the move took across' lacks 'bd-0 - Zero.md'
check 'after the move: says to end every other session' has 'end every other'
run "$WT_SR"
check 'after the move: is seen from an agent worktree too' has 'since the board moved'
# Carried across by hand and committed on the state branch, it is no finding.
cp "$SR/.boards/tasks/bd-1 - One.md" "$SW/.boards/tasks/bd-1 - One.md"
git -C "$SW" commit -qm 'Carry BD-1 across' -- .boards
run "$SR"
check 'carried across: exits 0' rc_is 0
check 'carried across: is no finding' lacks 'since the board moved'
# An old session's board commit on the main checkout's branch.
printf 'created after the move\n' > "$SR/.boards/tasks/bd-3 - Three.md"
git -C "$SR" add -- .boards/tasks
git -C "$SR" commit -qm 'Create BD-3' -- .boards/tasks
run "$SR"
check "after the move: an old session's commit on main exits 1" rc_is 1
check 'after the move: names the committed file' has 'bd-3 - Three.md'
check 'after the move: names the commit' has 'Create BD-3'
check 'after the move: not the commit the move took across' lacks 'Create BD-0'
# A file deleted in main after the move.
git -C "$SR" rm -q --cached -- '.boards/tasks/bd-3 - Three.md'
git -C "$SR" commit -qm 'Untrack BD-3'
rm -f "$SR/.boards/tasks/bd-3 - Three.md" "$SR/.boards/tasks/bd-0 - Zero.md"
run "$SR"
check 'after the move: a file deleted in main is named' has 'bd-0 - Zero.md'
check 'after the move: a deletion exits 1' rc_is 1

# After a flush (board flush in the binary) the default branch carries the
# state branch's board as one "Board and memory at <tag>" commit, and the main
# checkout's .boards is that once pulled. The flush commit, not the move
# commit, is then what the main checkout's copy is compared with: on the state
# branch once it is re-based onto the flush, and on the main checkout's own
# branch when it is not, such as when the reset refused.
FR="$TMP/flush-repo"
FW="$FR/.claude/worktrees/coder-fleet-state"
mkdir -p "$FR/.boards/tasks"
printf 'project_name: "t"\nauto_commit: true\n' > "$FR/.boards/config.yml"
printf '.focus\n' > "$FR/.boards/.gitignore"
printf 'one v0\n' > "$FR/.boards/tasks/bd-1 - One.md"
printf 'two v0\n' > "$FR/.boards/tasks/bd-2 - Two.md"
git -C "$FR" init -q -b main
git -C "$FR" add -A
git -C "$FR" commit -qm base
printf '/.claude/worktrees/\n' >> "$FR/.git/info/exclude"
printf 'one left from before the move\n' > "$FR/.boards/tasks/bd-1 - One.md"
git -C "$FR" worktree add -q -b coder-fleet/state "$FW" main
cp "$FR/.boards/tasks/bd-1 - One.md" "$FW/.boards/tasks/bd-1 - One.md"
git -C "$FW" commit -qm 'Move the board to the state worktree' -- .boards
printf 'one v1\n' > "$FW/.boards/tasks/bd-1 - One.md"
git -C "$FW" commit -qm 'Move BD-1 to In Progress' -- .boards
git -C "$FR" checkout -q -- .boards
flush_commit() { # $1 tag -> the state tip's tree on main as a flush commit, main itself left alone
    git -C "$FR" commit-tree "$(git -C "$FR" rev-parse 'coder-fleet/state^{tree}')" -p main -m "Board and memory at $1" -m 'Board-Writer: flush'
}
# Not re-based: the state branch keeps its move commit. Pulled, and the state branch writes on.
F1="$(flush_commit v1.0.0)"
git -C "$FR" merge -q --ff-only "$F1"
printf 'one v2\n' > "$FW/.boards/tasks/bd-1 - One.md"
git -C "$FW" commit -qm 'Move BD-1 to Done' -- .boards
run "$FR"
check 'after a flush, not re-based: exits 0' rc_is 0
check 'after a flush, not re-based: a pulled card the state branch changed since is no finding' lacks 'since the board moved'
# Re-based onto a second flush, not pulled yet: the main checkout is the first flush.
F2="$(git -C "$FR" commit-tree "$(git -C "$FR" rev-parse 'coder-fleet/state^{tree}')" -p "$F1" -m 'Board and memory at v1.1.0' -m 'Board-Writer: flush')"
git -C "$FW" reset -q --keep "$F2"
printf 'two v1\n' > "$FW/.boards/tasks/bd-2 - Two.md"
git -C "$FW" commit -qm 'Move BD-2 to Done' -- .boards
run "$FR"
check 'after a re-based flush, not pulled: exits 0' rc_is 0
check 'after a re-based flush, not pulled: no finding' lacks 'since the board moved'
# Pulled, and the state branch writes on.
git -C "$FR" merge -q --ff-only "$F2"
printf 'one v3\n' > "$FW/.boards/tasks/bd-1 - One.md"
git -C "$FW" commit -qm 'Move BD-1 to Blocked' -- .boards
run "$FR"
check 'after a re-based flush, pulled: exits 0' rc_is 0
check 'after a re-based flush, pulled: no finding' lacks 'since the board moved'
# An old session's write in the main checkout after the flush is still found.
printf 'two written after the flush\n' > "$FR/.boards/tasks/bd-2 - Two.md"
run "$FR"
check 'after a flush: a write in main since is reported' has 'since the board moved'
check 'after a flush: names only that file' has 'bd-2 - Two.md'
check 'after a flush: not a card the flush carried' lacks 'bd-1 - One.md'
check 'after a flush: exits 1' rc_is 1

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
check 'ignored board: does not claim every write is committed' lacks 'board check: ok'

printf '\nboard-git-check: %s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
