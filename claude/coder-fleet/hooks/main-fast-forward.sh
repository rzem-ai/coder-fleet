#!/usr/bin/env bash
# SessionStart: bring the main checkout's default branch level with its remote,
# by fast-forward alone, and tell the session what happened.
#
# Agent worktrees are cut from the main checkout, so a default branch left
# behind its remote has every new item built on old code. The lead brings it
# level after each merge and before cutting a worktree (lead-procedures, under
# Worktrees and memory); this covers the session start, including a session
# whose lead skips it.
#
# Where it acts: only in a main checkout. A session started in a linked
# worktree, a bare repository or outside a repository is left alone, and so is
# a compaction, which is the same session going on.
#
# Which remote and branch: origin, or the only remote when there is one and it
# has another name. The default branch is what <remote>/HEAD names, else main,
# as prune-worktrees reads it. No remote, or no local copy of the default
# branch, is nothing to do and is said nowhere.
#
# What it does: one fetch of the default branch, bounded at
# CODER_FLEET_FETCH_TIMEOUT seconds (5). Then, when the local branch is
# strictly behind the remote's:
#   - checked out here: git merge --ff-only, which refuses when a changed or
#     untracked file is in the way and otherwise leaves every uncommitted
#     change as it was
#   - checked out in a linked worktree: nothing, since moving it would leave
#     that worktree's files behind its branch
#   - checked out nowhere: git update-ref from the old value to the new, which
#     fails if the branch moved in between, so it can only fast-forward
# It never resets, stashes, rebases, merges with a commit or forces. merge
# autostash is turned off, and the repository's own git hooks do not run.
#
# The timeout: macOS ships no timeout(1), so the fetch runs in the background
# in its own process group (set -m) beside a watchdog that sends the group
# SIGTERM when the time is up, then SIGKILL. The group takes the fetch's
# children with it - an ssh, a remote helper or an upload-pack. The same code
# runs on Linux. The fetch runs with terminal prompts and askpass helpers off
# and stdin closed, so a remote that wants credentials fails instead of
# waiting.
#
# What it prints: one line of SessionStart additionalContext when it moved the
# branch or could not, and nothing when the branch was level or ahead. Each of
# those lines goes to the hook log too. It never exits non-zero.
#
# Knobs, all environment variables:
#   CODER_FLEET_FAST_FORWARD=off   do nothing
#   CODER_FLEET_FETCH_TIMEOUT      seconds the fetch may take, a positive integer
#
# Written for bash 3.2, like the rest of the hooks.

set -u

HOOK=FastForward
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/board.sh
. "$here/lib/board.sh"

trap 'board_log "$HOOK" "unexpected error on line $LINENO; nothing more moved, session continues"; exit 0' ERR

input="$(cat 2>/dev/null || true)"

[ "${CODER_FLEET_FAST_FORWARD:-on}" = off ] && exit 0

source_kind=""
cwd=""
if command -v jq >/dev/null 2>&1; then
  source_kind="$(printf '%s' "$input" | jq -r '.source // ""' 2>/dev/null || true)"
  cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null || true)"
fi
[ "$source_kind" = compact ] && exit 0
[ -n "$cwd" ] || cwd="$PWD"
[ -d "$cwd" ] || exit 0

limit="${CODER_FLEET_FETCH_TIMEOUT:-5}"
case "$limit" in ''|*[!0-9]*|0) limit=5 ;; esac

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
# Credentials must never be asked for: an empty GIT_ASKPASS stops git falling
# through to core.askPass or SSH_ASKPASS, and the terminal prompt is off.
export GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" SSH_ASKPASS_REQUIRE=never GCM_INTERACTIVE=never

# Every git call runs without the repository's own hooks, maintenance or
# autostash, and reads nothing from the terminal.
G() {
  git -C "$top" -c core.hooksPath=/dev/null -c gc.auto=0 -c maintenance.auto=false \
    -c merge.autoStash=false "$@" </dev/null
}

[ "$(git -C "$cwd" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || exit 0
top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0
gitdir="$(G rev-parse --path-format=absolute --git-dir 2>/dev/null)" || exit 0
common="$(G rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
# A linked worktree's git dir is under the common one; only the main checkout
# has them equal.
[ -n "$gitdir" ] && [ "$gitdir" = "$common" ] || exit 0

remotes="$(G remote 2>/dev/null)" || exit 0
[ -n "$remotes" ] || exit 0
remote=""
if printf '%s\n' "$remotes" | grep -qx origin; then
  remote=origin
elif [ "$(printf '%s\n' "$remotes" | wc -l | tr -d ' ')" = 1 ]; then
  remote="$remotes"
else
  exit 0
fi

default="$(G symbolic-ref -q "refs/remotes/$remote/HEAD" 2>/dev/null || true)"
default="${default#refs/remotes/$remote/}"
[ -n "$default" ] || default=main
local_ref="refs/heads/$default"
remote_ref="refs/remotes/$remote/$default"
G show-ref --verify -q "$local_ref" || exit 0

first_line() { printf '%s' "$1" | tr '\r\n\t' '   ' | sed 's/  */ /g; s/^ //; s/ $//' | cut -c1-300; }

json_escape() {
  # Backslash and quote escaped, control characters dropped: enough for one
  # line of prose built here.
  printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

say() {
  board_log "$HOOK" "$top: $1"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$(json_escape "Session start: $1")"
  exit 0
}

plural() { if [ "$1" = 1 ]; then printf '1 commit'; else printf '%s commits' "$1"; fi; }

refused() {
  say "$default was not fast-forwarded to $remote/$default and is left as it is: $1. Never reset, stash, rebase or force past this; tell the human, as lead-procedures says under Worktrees and memory."
}

# --- the bounded fetch --------------------------------------------------------

# Prints the fetch's stderr, then its exit status on a line of its own. A
# status over 128 is the watchdog's signal.
fetch_out="$(
  set -m
  G fetch --quiet --no-tags --no-recurse-submodules --no-write-fetch-head "$remote" "$default" 2>&1 >/dev/null &
  job=$!
  ( sleep "$limit"; kill -TERM -- "-$job" 2>/dev/null; sleep 1; kill -KILL -- "-$job" 2>/dev/null ) >/dev/null 2>&1 </dev/null &
  dog=$!
  set +m
  wait "$job"
  rc=$?
  kill -TERM -- "-$dog" 2>/dev/null
  kill -KILL -- "-$job" 2>/dev/null
  printf '\n%s' "$rc"
)"
fetch_rc="${fetch_out##*$'\n'}"
fetch_err="${fetch_out%$'\n'*}"

if [ "$fetch_rc" != 0 ]; then
  case "$fetch_rc" in
    ''|*[!0-9]*) refused "the fetch from $remote failed" ;;
  esac
  if [ "$fetch_rc" -gt 128 ]; then
    refused "the fetch from $remote did not finish within $limit s, so how far behind it is is unknown"
  fi
  refused "the fetch from $remote failed: $(first_line "$fetch_err")"
fi

# --- compare ------------------------------------------------------------------

old="$(G rev-parse -q --verify "$local_ref^{commit}" 2>/dev/null)" || exit 0
new="$(G rev-parse -q --verify "$remote_ref^{commit}" 2>/dev/null)" || exit 0
[ "$old" = "$new" ] && exit 0
# Ahead of the remote, or level in content: nothing to bring level.
G merge-base --is-ancestor "$new" "$old" 2>/dev/null && exit 0
behind="$(G rev-list --count "$old..$new" 2>/dev/null)" || exit 0
if ! G merge-base --is-ancestor "$old" "$new" 2>/dev/null; then
  ahead="$(G rev-list --count "$new..$old" 2>/dev/null || printf '?')"
  refused "$default has $(plural "$ahead") $remote/$default lacks, and $remote/$default has $behind it lacks"
fi

# Where the default branch is checked out, if anywhere: this checkout, or a
# linked worktree, read from git's own listing.
here_branch="$(G symbolic-ref -q HEAD 2>/dev/null || true)"
elsewhere=""
wt=""
while IFS= read -r line; do
  case "$line" in
    "worktree "*) wt="${line#worktree }" ;;
    "branch $local_ref")
      if [ "$wt" != "$top" ] && [ -z "$elsewhere" ]; then elsewhere="$wt"; fi ;;
  esac
done <<EOF
$(G worktree list --porcelain 2>/dev/null)
EOF

if [ "$here_branch" = "$local_ref" ]; then
  if ! err="$(G merge --ff-only --no-autostash --no-stat -q "$new" 2>&1 >/dev/null)"; then
    refused "git merge --ff-only refused the $(plural "$behind") from $remote/$default: $(first_line "$err")"
  fi
  short="$(G rev-parse --short "$new" 2>/dev/null || printf '%s' "$new")"
  say "fast-forwarded $default by $(plural "$behind") to $remote/$default ($short)."
fi

if [ -n "$elsewhere" ]; then
  refused "$default is checked out in the linked worktree $elsewhere, so it is brought level from there"
fi

if ! err="$(G update-ref -m "coder-fleet: fast-forward $default to $remote/$default at session start" "$local_ref" "$new" "$old" 2>&1)"; then
  refused "git update-ref refused: $(first_line "$err")"
fi
if [ -n "$here_branch" ]; then
  what="has ${here_branch#refs/heads/} out"
else
  what="has a detached HEAD out"
fi
say "fast-forwarded $default by $(plural "$behind") to $remote/$default without a checkout; the main checkout $what, not $default, and agent worktrees are cut from what is out."
