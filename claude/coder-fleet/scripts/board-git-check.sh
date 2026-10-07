#!/usr/bin/env bash
# board-git-check.sh - say whether the board's writes are all committed, and
# whether an index.lock is blocking the commits (CF-21).
#
# Every board write is a commit in the main checkout. When the commit cannot be
# made the write still stands, uncommitted, and the binary logs a "commit
# failed" line to the hooks log. On 2026-09-27 a stale .git/index.lock made
# every board commit fail for hours and nobody looked at the log. /kickoff runs
# this so the next one is seen. Run it from the main checkout or any of its
# worktrees; it always checks the main checkout, where the board lives.
#
# It reads and reports. It never deletes the lock and never commits: a lock
# can belong to a git command still running, and the board's uncommitted
# writes are the human's to look at first.
#
# Exit 0 when there is nothing to fix (a young lock is a note, not a finding),
# 1 when there is uncommitted board work or a stale lock. A lock is stale once
# it is BOARD_LOCK_STALE_SECONDS old (300 unless set) and no process holds it
# open, which lsof answers; without lsof, any running git process counts.
#
# Written for bash 3.2, which is /bin/bash on macOS.

set -u

say() { printf 'board check: %s\n' "$*"; }

main="$(git worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')"
if [ -z "$main" ]; then
    say "not in a git repository; nothing to check"
    exit 0
fi
if [ ! -d "$main/.boards" ]; then
    say "no .boards in $main; nothing to check"
    exit 0
fi

found=0

if git -C "$main" check-ignore -q .boards 2>/dev/null; then
    say ".boards is gitignored in $main, so its writes are never committed; nothing to check"
else
    # Every untracked file on its own line, so a run of new items is counted
    # and named rather than folded into one `?? .boards/tasks/`.
    changes="$(git -C "$main" status --porcelain --untracked-files=all -- .boards ':(exclude).boards/.focus' 2>/dev/null)"
    if [ -n "$changes" ]; then
        found=1
        n="$(printf '%s\n' "$changes" | wc -l | tr -d ' ')"
        say "$n uncommitted change(s) under .boards in $main - board writes that never reached a commit:"
        printf '%s\n' "$changes" | head -20 | sed 's/^/    /'
        [ "$n" -gt 20 ] && printf '    ... and %s more\n' "$((n - 20))"
        say "look for \"commit failed\" lines in the hooks log (~/.local/state/coder-fleet/log/hooks.log) for why, then commit them: git -C \"$main\" add .boards && git -C \"$main\" commit -m \"Commit board writes\" -- .boards"
    fi
fi

lock="$(git -C "$main" rev-parse --path-format=absolute --git-path index.lock 2>/dev/null)"
if [ -n "$lock" ] && [ -e "$lock" ]; then
    mtime="$(stat -f %m "$lock" 2>/dev/null || stat -c %Y "$lock" 2>/dev/null || echo 0)"
    age=$(( $(date +%s) - mtime ))
    limit="${BOARD_LOCK_STALE_SECONDS:-300}"
    case "$limit" in ''|*[!0-9]*) limit=300 ;; esac
    holder=""
    if command -v lsof >/dev/null 2>&1; then
        holder="$(lsof -t -- "$lock" 2>/dev/null | head -1)"
    else
        holder="$(pgrep -x git 2>/dev/null | head -1)"
    fi
    if [ -n "$holder" ]; then
        say "$lock exists, ${age}s old, held by pid $holder - probably a git command running; check again once it finishes"
    elif [ "$age" -lt "$limit" ]; then
        say "$lock exists, ${age}s old - probably a git command running; check again in a few minutes"
    else
        found=1
        say "stale lock $lock: $((age / 60)) minute(s) old and no process holds it. Every board commit fails until it goes. If no git command is running, remove it with: rm \"$lock\" - then commit .boards as above."
    fi
fi

[ "$found" -eq 0 ] && say "ok - every board write in $main is committed and no index.lock blocks the next"
exit "$found"
