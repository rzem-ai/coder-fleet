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
# with the move commit's tree, or the latest flush's once one has landed the
# state branch on the default branch, and a path that differs from it and from
# the state branch's tip is reported, with the main checkout's commits since
# the state branch's base that touch it. Agent memory, which the memory hook
# commits on the state branch, is checked the same way once the board has
# moved: an uncommitted note in the state worktree, and a main-checkout note
# the state branch does not have, both read past the hook's info/exclude line.
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

# Untracked files as git add would see them with the common git dir's
# info/exclude left out: a project that keeps the board out of its own history
# lists it there (CF-201, scripts/fleet-exclude.py), and every checkout shares
# that file, so the state worktree's new cards and the main checkout's copy are
# both excluded and git status alone shows neither. .gitignore files and the
# human's global excludes file still count, as the board binary reads them.
global_excludes="$(git -C "$main" config --path --get core.excludesFile 2>/dev/null || true)"
if [ -z "$global_excludes" ]; then
    xdg="${XDG_CONFIG_HOME:-${HOME:+$HOME/.config}}"
    [ -n "$xdg" ] && global_excludes="$xdg/git/ignore"
fi
# Every other line of info/exclude still counts: only the fleet's own entry
# for the board is left out, so a personal pattern there (an editor's swap
# file, .DS_Store) still hides its file.
own_excludes=""
common_dir="$(git -C "$main" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [ -n "$common_dir" ] && [ -f "$common_dir/info/exclude" ]; then
    own_excludes="$(mktemp "${TMPDIR:-/tmp}/board-git-check-exclude.XXXXXX")" || own_excludes=""
    if [ -n "$own_excludes" ]; then
        trap 'rm -f "$own_excludes"' EXIT
        grep -vxE '[[:space:]]*/?\.boards/?[[:space:]]*' "$common_dir/info/exclude" > "$own_excludes" || true
    fi
fi
listed_files() { # $1 checkout, $2 ls-files mode flags, rest pathspecs
    local co="$1" flags="$2"; shift 2
    local from=()
    [ -n "$global_excludes" ] && [ -f "$global_excludes" ] && from+=("--exclude-from=$global_excludes")
    [ -n "$own_excludes" ] && from+=("--exclude-from=$own_excludes")
    git -C "$co" -c core.quotePath=false ls-files $flags --exclude-per-directory=.gitignore ${from[@]+"${from[@]}"} -- "$@" 2>/dev/null
}

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
    changes="$( {
        git -C "$main" --no-optional-locks status --porcelain --untracked-files=no -- .boards ':(exclude).boards/.focus' 2>/dev/null
        listed_files "$main" -o .boards ':(exclude).boards/.focus' | sed 's/^/?? /'
    })"
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
        # Excluded through info/exclude (CF-201), a new card needs a forced add,
        # which would take an ignored focus file too, so the add excludes it.
        if git -C "$main" check-ignore -q --no-index .boards/x 2>/dev/null; then
            add="git -C \"$main\" add -f -- .boards ':!.boards/.focus'"
        elif git -C "$main" check-ignore -q .boards/.focus 2>/dev/null; then
            add="git -C \"$main\" add -- .boards"
        else
            add="git -C \"$main\" add -- .boards ':!.boards/.focus'"
        fi
        say "look for \"commit failed\" lines in the hooks log (~/.local/state/coder-fleet/log/hooks.log) for why, then commit them: $add && git -C \"$main\" commit -m \"Commit board writes\" -- .boards ':!.boards/.focus'"
    fi
fi

# The main checkout's .boards against what the move took across, once the
# board has moved and its writes are committed. A path counts as unchanged when
# its bytes on disk, or its absence, match any of these:
#   - the reference: the newest move or flush commit on the state branch, which
#     is the move's copy or the board as last flushed onto the default branch;
#   - the state branch's tip, a change carried across by hand;
#   - the newest flush on the main checkout's own branch, for a flush the state
#     branch was not re-based onto;
#   - once there has been a flush, the state branch's base with the main
#     checkout, so a main checkout merely behind a flush, not yet pulled, is no
#     finding: that copy is older than the flush and was flushed over.
# A flush commit is told by its "From coder-fleet/state at <sha>." line and its
# "Board and memory" subject together, never by the subject alone. With neither
# a move nor a flush commit, which is a move that found nothing to commit, the
# state branch's base is what it took. git hash-object without -w writes
# nothing. The focus file is never committed and never compared.
board_tree() { # $1 commit -> "blob<TAB>path" for every file under .boards but the focus file
    [ -n "$1" ] || return 0
    git -C "$checkout" -c core.quotePath=false ls-tree -r "$1" -- .boards 2>/dev/null \
        | awk -F'\t' '{ split($1, f, " "); if (f[2] == "blob" && $2 != ".boards/.focus") print f[3] "\t" $2 }'
}
newest_flush() { # $1 dir, $2 rev -> the newest flush commit on its first-parent history
    git -C "$1" log --first-parent -1 --format=%H -E --all-match \
        --grep='^Board and memory (at |flush$)' --grep='^From coder-fleet/state at [0-9a-f]+\.$' "$2" 2>/dev/null
}
newest_move() { # $1 dir, $2 rev -> the newest move commit on its first-parent history
    git -C "$1" log --first-parent --format='%H%x09%s' "$2" 2>/dev/null \
        | awk -F'\t' '$2 == "Move the board to the state worktree" { print $1; exit }'
}
since_move() {
    local tip move flush flushed base behind tmp n paths p commits
    tip="$(git -C "$main" rev-parse -q --verify 'HEAD^{commit}' 2>/dev/null)" || return 0
    move="$(newest_move "$main" HEAD)"
    flush="$(newest_flush "$main" HEAD)"
    if [ -n "$flush" ] && { [ -z "$move" ] || git -C "$checkout" merge-base --is-ancestor "$move" "$flush" 2>/dev/null; }; then
        move="$flush"
    fi
    flushed="$(newest_flush "$checkout" HEAD)"
    base="$(git -C "$checkout" merge-base "$tip" HEAD 2>/dev/null)"
    behind=""
    { [ -n "$flush" ] || [ -n "$flushed" ]; } && behind="$base"
    [ -n "$move" ] || move="$base"
    [ -n "$move" ] || return 0
    tmp="$(mktemp -d "${TMPDIR:-/tmp}/board-git-check.XXXXXX")" || return 0
    board_tree "$move" > "$tmp/ref.1"
    board_tree "$tip" > "$tmp/ref.2"
    : > "$tmp/ref.3"
    : > "$tmp/ref.4"
    [ -n "$flushed" ] && board_tree "$flushed" > "$tmp/ref.3"
    [ -n "$behind" ] && board_tree "$behind" > "$tmp/ref.4"
    listed_files "$checkout" -co .boards \
        | LC_ALL=C sort -u | while IFS= read -r p; do
            [ "$p" = ".boards/.focus" ] && continue
            [ -f "$checkout/$p" ] && [ ! -L "$checkout/$p" ] && printf '%s\n' "$p"
        done > "$tmp/files"
    : > "$tmp/disk"
    if [ -s "$tmp/files" ]; then
        git -C "$checkout" hash-object --stdin-paths < "$tmp/files" > "$tmp/hashes" 2>/dev/null \
            && paste "$tmp/hashes" "$tmp/files" > "$tmp/disk"
    fi
    # A reference left out (no flush on the main checkout's branch, no flush
    # at all) is "-" and matches nothing, not even an absence.
    paths="$(awk -F'\t' -v use3="${flushed:+1}" -v use4="${behind:+1}" '
        FILENAME == ARGV[5] { d[$2] = $1; all[$2] = 1; next }
        { i = substr(FILENAME, length(FILENAME)); r[i, $2] = $1; all[$2] = 1 }
        END {
            for (p in all) {
                dv = (p in d) ? d[p] : "-"; ok = 0
                for (i = 1; i <= 4; i++) {
                    if ((i == 3 && use3 == "") || (i == 4 && use4 == "")) continue
                    rv = ((i, p) in r) ? r[i, p] : "-"
                    if (dv == rv) ok = 1
                }
                if (!ok) print p
            }
        }' "$tmp/ref.1" "$tmp/ref.2" "$tmp/ref.3" "$tmp/ref.4" "$tmp/disk" | LC_ALL=C sort)"
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
    say "end every other Claude Code session in this project, then carry each change into $main/.boards by hand and commit it there; the main checkout's .boards is a copy as of the move and is never updated"
}
if [ "$checkout" != "$main" ] && [ "$uncommitted_by_design" -eq 0 ]; then
    since_move
fi

# Agent memory (CF-183.2), once the board has moved. The memory hook
# (hooks/memory-state.sh) commits every agent's notes on the state branch and
# keeps them out of every checkout's status with an info/exclude line, so both
# checks read past the exclude. In the state worktree, a note left
# uncommitted is a memory commit that failed. In the main checkout, a note
# whose bytes match the state branch's tip was carried and only waits for its
# agent's stop hook to put it back, so it is no finding; one that matches
# neither the state branch nor the checkout's HEAD was never carried. A
# temporary file the hook was writing is never a note.
memory_tree() { # $1 rev -> "blob<TAB>path" for every file under .claude/agent-memory
    git -C "$checkout" -c core.quotePath=false ls-tree -r "$1" -- .claude/agent-memory 2>/dev/null \
        | awk -F'\t' '{ split($1, f, " "); if (f[2] == "blob") print f[3] "\t" $2 }'
}
memory_checks() {
    local changes n tmp p paths
    changes="$(git -C "$main" --no-optional-locks status --porcelain --untracked-files=all --ignored=traditional -- .claude/agent-memory 2>/dev/null | grep -v '\.memory-tmp$')"
    if [ -n "$changes" ]; then
        found=1
        n="$(printf '%s\n' "$changes" | wc -l | tr -d ' ')"
        say "$n uncommitted change(s) under .claude/agent-memory in $main - memory the memory hook did not commit:"
        printf '%s\n' "$changes" | head -20 | sed 's/^/    /'
        [ "$n" -gt 20 ] && printf '    ... and %s more\n' "$((n - 20))"
        say "look for \"memory commit failed\" lines in the hooks log (~/.local/state/coder-fleet/log/hooks.log); the agent's next memory write commits it, or commit it by hand: git -C \"$main\" add -f -- .claude/agent-memory ':!**/*.memory-tmp' && git -C \"$main\" commit -m \"Record agent memory\" -m \"Board-Writer: memory\" -- .claude/agent-memory"
    fi
    tmp="$(mktemp -d "${TMPDIR:-/tmp}/board-git-check.XXXXXX")" || return 0
    memory_tree HEAD > "$tmp/ref.1"
    memory_tree refs/heads/coder-fleet/state > "$tmp/ref.2"
    git -C "$checkout" -c core.quotePath=false ls-files -co -- .claude/agent-memory 2>/dev/null \
        | LC_ALL=C sort -u | while IFS= read -r p; do
            case "$p" in *.memory-tmp) continue ;; esac
            [ -f "$checkout/$p" ] && [ ! -L "$checkout/$p" ] && printf '%s\n' "$p"
        done > "$tmp/files"
    : > "$tmp/disk"
    if [ -s "$tmp/files" ]; then
        git -C "$checkout" hash-object --stdin-paths < "$tmp/files" > "$tmp/hashes" 2>/dev/null \
            && paste "$tmp/hashes" "$tmp/files" > "$tmp/disk"
    fi
    paths="$(awk -F'\t' '
        FILENAME == ARGV[1] { h[$2] = $1; next }
        FILENAME == ARGV[2] { s[$2] = $1; next }
        { if (!(($2 in h) && h[$2] == $1) && !(($2 in s) && s[$2] == $1)) print $2 }
        ' "$tmp/ref.1" "$tmp/ref.2" "$tmp/disk" | LC_ALL=C sort)"
    rm -rf "$tmp"
    [ -n "$paths" ] || return 0
    found=1
    n="$(printf '%s\n' "$paths" | wc -l | tr -d ' ')"
    say "$n note(s) under .claude/agent-memory in $checkout that the state branch does not have - memory written there that the memory hook never carried:"
    printf '%s\n' "$paths" | head -20 | sed 's/^/    /'
    [ "$n" -gt 20 ] && printf '    ... and %s more\n' "$((n - 20))"
    say "an agent's next memory write or its stop carries a note it wrote itself; copy anything else into $main/.claude/agent-memory for the next memory commit to take, or remove it if it is not wanted"
}
if [ "$checkout" != "$main" ] && [ "$uncommitted_by_design" -eq 0 ]; then
    memory_checks
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
