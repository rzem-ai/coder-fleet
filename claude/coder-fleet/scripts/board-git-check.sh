#!/usr/bin/env bash
# board-git-check.sh - say whether the board's writes are all committed, and
# whether an index.lock is blocking the commits.
#
# Every board write is a commit in the board's state worktree, on the
# coder-fleet/state branch, or in the main checkout while the board has not
# moved there yet (src/state-worktree.ts in the board). When the commit cannot
# be made the write still stands, uncommitted, and the binary logs a "commit
# failed" line to the hooks log. A stale index.lock makes every board commit
# fail, and nobody reads that log unprompted, so /kickoff runs this to surface
# it. Run it from the main checkout or any of its worktrees; it always checks
# the checkout the live board is in. Once the board has moved, the main
# checkout's .boards is a copy as of the move. What the move took across is on
# the state branch already and is no finding; a change there since is. A
# session started on an older plugin version keeps its old binary, which goes
# on writing the main checkout's .boards and committing on its branch, where no
# board anyone reads will show it. So the main checkout's .boards is compared
# with the move commit's tree, and a path that differs from it and from the
# state branch's tip is reported, with the main checkout's commits since the
# state branch's base that touch it.
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
# The live board: the state worktree once the board has moved there, which is
# a worktree at this path with the state branch out, else the main checkout.
board="$main"
state="$main/.claude/worktrees/coder-fleet-state"
if [ -d "$state/.boards" ] && [ -f "$state/.git" ] \
    && [ "$(git -C "$state" symbolic-ref -q HEAD 2>/dev/null)" = "refs/heads/coder-fleet/state" ]; then
    board="$state"
fi
# The main checkout, kept for the comparison with what the move took across.
checkout="$main"
# Everything below checks that checkout, under the name it has always had.
main="$board"
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

# The main checkout's .boards against what the move took across, once the
# board has moved and its writes are committed. A path counts as unchanged when
# its bytes on disk, or its absence, match the move commit or the state
# branch's tip: the first is the move's copy, the second a change carried
# across by hand. With no move commit, which is a move that found nothing to
# commit, the state branch's base is what it took. git hash-object without -w
# writes nothing. The focus file is never committed and never compared.
board_tree() { # $1 commit -> "blob<TAB>path" for every file under .boards but the focus file
    git -C "$checkout" -c core.quotePath=false ls-tree -r "$1" -- .boards 2>/dev/null \
        | awk -F'\t' '{ split($1, f, " "); if (f[2] == "blob" && $2 != ".boards/.focus") print f[3] "\t" $2 }'
}
since_move() {
    local tip move base tmp n paths p commits
    tip="$(git -C "$main" rev-parse -q --verify 'HEAD^{commit}' 2>/dev/null)" || return 0
    move="$(git -C "$main" log --first-parent --format='%H%x09%s' HEAD 2>/dev/null \
        | awk -F'\t' '$2 == "Move the board to the state worktree" { h = $1 } END { print h }')"
    base="$(git -C "$checkout" merge-base "$tip" HEAD 2>/dev/null)"
    [ -n "$move" ] || move="$base"
    [ -n "$move" ] || return 0
    tmp="$(mktemp -d "${TMPDIR:-/tmp}/board-git-check.XXXXXX")" || return 0
    board_tree "$move" > "$tmp/move"
    board_tree "$tip" > "$tmp/tip"
    git -C "$checkout" -c core.quotePath=false ls-files -co --exclude-standard -- .boards 2>/dev/null \
        | LC_ALL=C sort -u | while IFS= read -r p; do
            [ "$p" = ".boards/.focus" ] && continue
            [ -f "$checkout/$p" ] && [ ! -L "$checkout/$p" ] && printf '%s\n' "$p"
        done > "$tmp/files"
    : > "$tmp/disk"
    if [ -s "$tmp/files" ]; then
        git -C "$checkout" hash-object --stdin-paths < "$tmp/files" > "$tmp/hashes" 2>/dev/null \
            && paste "$tmp/hashes" "$tmp/files" > "$tmp/disk"
    fi
    paths="$(awk -F'\t' '
        FILENAME == ARGV[1] { m[$2] = $1; all[$2] = 1; next }
        FILENAME == ARGV[2] { t[$2] = $1; next }
        { d[$2] = $1; all[$2] = 1 }
        END {
            for (p in all) {
                dv = (p in d) ? d[p] : "-"; mv = (p in m) ? m[p] : "-"; tv = (p in t) ? t[p] : "-"
                if (dv != mv && dv != tv) print p
            }
        }' "$tmp/move" "$tmp/tip" "$tmp/disk" | LC_ALL=C sort)"
    rm -rf "$tmp"
    [ -n "$paths" ] || return 0
    found=1
    n="$(printf '%s\n' "$paths" | wc -l | tr -d ' ')"
    say "$n change(s) under .boards in $checkout since the board moved to $main - writes no board anyone reads will show, most likely from a session still on an older plugin version:"
    printf '%s\n' "$paths" | head -20 | sed 's/^/    /'
    [ "$n" -gt 20 ] && printf '    ... and %s more\n' "$((n - 20))"
    if [ -n "$base" ]; then
        commits="$(printf '%s\n' "$paths" | tr '\n' '\0' | (cd "$checkout" && xargs -0 git log --format='%h %s' "$base..HEAD" -- 2>/dev/null) | head -10)"
        if [ -n "$commits" ]; then
            say "commits in $checkout since the state branch's base that touch them:"
            printf '%s\n' "$commits" | sed 's/^/    /'
        fi
    fi
    say "end every other Claude Code session in this project, then carry each change into $main/.boards by hand and commit it there; the main checkout's .boards changes only when the state branch is flushed onto the default branch"
}
if [ "$checkout" != "$main" ] && [ "$uncommitted_by_design" -eq 0 ]; then
    since_move
fi

lock="$(git -C "$main" rev-parse --path-format=absolute --git-path index.lock 2>/dev/null)"
if [ -n "$lock" ] && [ -e "$lock" ]; then
    # The mtime, read the same way on every platform. Not stat: GNU stat
    # reads BSD's `-f` as "file system status", prints something else and
    # exits 0 (on a Linux runner). python3 is already a dependency of
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
