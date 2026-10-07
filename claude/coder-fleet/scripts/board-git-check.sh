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
# Set when there is nothing to say "every write is committed" about.
uncommitted_by_design=0

# The binary commits only when the config's auto_commit is true, matched the
# way it parses the key: the value, quotes aside, read without case.
auto_commit="$(sed -n 's/^auto_commit:[[:space:]]*//p' "$main/.boards/config.yml" 2>/dev/null | head -1 | tr -d "\"' \r" | tr '[:upper:]' '[:lower:]')"

if git -C "$main" check-ignore -q .boards 2>/dev/null; then
    uncommitted_by_design=1
    say ".boards is gitignored in $main, so its writes are never committed; nothing to check"
elif [ "$auto_commit" != "true" ]; then
    uncommitted_by_design=1
    say "auto_commit is not true in $main/.boards/config.yml, so board writes are left uncommitted by design and any under .boards are expected; not checked"
else
    # Every untracked file on its own line, so a run of new items is counted
    # and named rather than folded into one `?? .boards/tasks/`. No optional
    # locks: a plain status refreshes the index under index.lock and could
    # take it from a board commit running at the same moment.
    changes="$(git -C "$main" --no-optional-locks status --porcelain --untracked-files=all -- .boards ':(exclude).boards/.focus' 2>/dev/null)"
    if [ -n "$changes" ]; then
        found=1
        n="$(printf '%s\n' "$changes" | wc -l | tr -d ' ')"
        say "$n uncommitted change(s) under .boards in $main - board writes that never reached a commit:"
        printf '%s\n' "$changes" | head -20 | sed 's/^/    /'
        [ "$n" -gt 20 ] && printf '    ... and %s more\n' "$((n - 20))"
        # The focus file is never committed. Where .boards/.gitignore ignores
        # it, a plain add already skips it, and an exclude pathspec naming an
        # ignored file makes git add exit 1; where nothing ignores it, the add
        # has to exclude it. The commit can exclude it either way.
        if git -C "$main" check-ignore -q .boards/.focus 2>/dev/null; then
            add="git -C \"$main\" add -- .boards"
        else
            add="git -C \"$main\" add -- .boards ':!.boards/.focus'"
        fi
        say "look for \"commit failed\" lines in the hooks log (~/.local/state/coder-fleet/log/hooks.log) for why, then commit them: $add && git -C \"$main\" commit -m \"Commit board writes\" -- .boards ':!.boards/.focus'"
    fi
fi

lock="$(git -C "$main" rev-parse --path-format=absolute --git-path index.lock 2>/dev/null)"
if [ -n "$lock" ] && [ -e "$lock" ]; then
    # The mtime, read the same way on every platform. Not stat: GNU stat
    # reads BSD's `-f` as "file system status", prints something else and
    # exits 0 (PR #81, the Linux runner). python3 is already a dependency of
    # the fleet; `date -r FILE` is the fallback both GNU and current BSD
    # date understand. Anything not a number is an age this cannot read.
    mtime="$(python3 -I -c 'import os, sys; print(int(os.path.getmtime(sys.argv[1])))' "$lock" 2>/dev/null)"
    case "$mtime" in ''|*[!0-9]*) mtime="$(date -r "$lock" +%s 2>/dev/null)" ;; esac
    limit="${BOARD_LOCK_STALE_SECONDS:-300}"
    case "$limit" in ''|*[!0-9]*) limit=300 ;; esac
    holder=""
    if command -v lsof >/dev/null 2>&1; then
        # -t prints bare pids on BSD and Linux lsof alike. The path is
        # absolute, so it can never be read as an option.
        holder="$(lsof -t "$lock" 2>/dev/null | head -1)"
    else
        holder="$(pgrep -x git 2>/dev/null | head -1)"
    fi
    age=""
    case "$mtime" in ''|*[!0-9]*) ;; *) age=$(( $(date +%s) - mtime )) ;; esac
    if [ -z "$age" ]; then
        say "$lock exists and its age could not be read; if no git command is running, it is stale and every board commit fails until it goes: rm \"$lock\""
    elif [ -n "$holder" ]; then
        say "$lock exists, ${age}s old, held by pid $holder - probably a git command running; check again once it finishes"
    elif [ "$age" -lt "$limit" ]; then
        say "$lock exists, ${age}s old - probably a git command running; check again in a few minutes"
    else
        found=1
        say "stale lock $lock: $((age / 60)) minute(s) old and no process holds it. Every board commit fails until it goes. If no git command is running, remove it with: rm \"$lock\" - then commit .boards as above."
    fi
fi

if [ "$found" -eq 0 ] && [ "$uncommitted_by_design" -eq 0 ]; then
    say "ok - every board write in $main is committed and no index.lock blocks the next"
fi
exit "$found"
