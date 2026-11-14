#!/usr/bin/env bash
# Pushes the coder-fleet/state branch to the URL the main checkout fetches its
# default branch from, as a branch of its own, so the board and the agents'
# memory are not on one machine alone (CF-201). A project keeps both out of its
# own history with the common git dir's info/exclude, and this branch is then
# their only home.
#
# Who runs it: the board binary after each board commit on the state branch
# (board.sh hands it this script's path in CODER_FLEET_STATE_PUSH_SCRIPT),
# lib/memory-state.py after each memory commit, and `board flush`, which waits
# for it and prints its line.
#
#   state-push.sh [<dir>]          push in the background and return at once
#   state-push.sh --wait [<dir>]   push now and print one line saying what happened
#
# <dir> is any checkout of the repository, the current directory by default.
#
# What it pushes: refs/heads/coder-fleet/state to the same name, with no + and
# no --force, --prune, --mirror or --all, so a remote branch that moved on
# (another machine pushed) is rejected, logged and left as it is. It never
# pushes the default branch, a tag or any other ref. On success it moves
# refs/remotes/<remote>/coder-fleet/state to what it pushed, which is where the
# board's restore (board state --from) reads the remote's copy.
#
# Where it pushes: never to a remote name, which config could redirect, mirror
# or multiply. The remote is origin, or the only remote when there is one, as
# main-fast-forward.sh fetches. Its fetch URL must be one value at every scope,
# its push URLs, as git resolves them, must be exactly that one URL, and the URL
# must be https, ssh or git. The push then goes to that URL literally.
#
# What it trusts: what main-fast-forward.sh trusts, from lib/remote-guard.sh.
# The repository's own config may hold only keys known to run no command (a
# local url.<x>.insteadOf is not one), git is held to https, ssh and git with
# protocol.allow, a repository with alternates is left alone, and the
# repository's git hooks (pre-push included) and fsmonitor never run.
#
# Bounded: one push, cut off at CODER_FLEET_PUSH_TIMEOUT seconds (10), in its
# own process group beside a watchdog, as the fast-forward's fetch is, with
# terminal prompts and askpass helpers off and stdin closed, so a remote that
# wants credentials fails instead of waiting. Without --wait it detaches first,
# so no hook or tool call waits on the network at all.
#
# Its files: none under .git or anywhere else an agent's session writes as a
# matter of course. They live in <fleet state dir>/state-push/, mode 700, which
# must be a directory this user owns and no symlink: the lock, a directory named
# by a hash of the repository's git dir, with its pid file; the pending mark,
# another such directory; and git's stderr, in a directory mktemp -d makes
# fresh. Files are opened with noclobber. A push that finds the lock held by a
# live process leaves the pending mark and goes; the holder pushes again before
# it lets go, so a commit made during a push is pushed too.
#
# It never fails anything: every outcome is one line in the hook log, and the
# exit code is 0.
#
# Knobs, all environment variables:
#   CODER_FLEET_STATE_PUSH=off     do nothing
#   CODER_FLEET_PUSH_TIMEOUT       seconds the push may take, a positive integer
#
# Written for bash 3.2, like the rest of the hooks.

set -u

HOOK=StatePush
BRANCH=coder-fleet/state
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/board.sh
. "$here/lib/board.sh"
# shellcheck source=lib/remote-guard.sh
. "$here/lib/remote-guard.sh"

trap 'board_log "$HOOK" "unexpected error on line $LINENO; nothing more pushed"; exit 0' ERR

[ "${CODER_FLEET_STATE_PUSH:-on}" = off ] && exit 0

wait_mode=0
if [ "${1:-}" = --wait ]; then wait_mode=1; shift; fi
dir="${1:-$PWD}"

if [ "$wait_mode" = 0 ]; then
  # Its own process group, every descriptor closed, so whoever started this
  # (a hook, the board binary) is never held by it.
  set -m
  bash "$0" --wait "$dir" </dev/null >/dev/null 2>&1 &
  exit 0
fi

say() {
  board_log "$HOOK" "${top:-$dir}: $1"
  printf '%s\n' "$1"
  exit 0
}

safe() {
  case "$1" in ''|-*|*[!A-Za-z0-9._/-]*) return 1 ;; esac
  return 0
}

[ -d "$dir" ] || say "$dir is not a directory, so nothing was pushed"
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
export GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" SSH_ASKPASS_REQUIRE=never GCM_INTERACTIVE=never

common="$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  || say "$dir is not inside a git repository, so nothing was pushed"
top="$(dirname "$common")"
[ "$(basename "$common")" = .git ] || say "the repository has no main checkout under its git dir, so $BRANCH was not pushed"

# A project whose push setting is base-only keeps its state branch on this
# machine (CF-209.3). A setting that is invalid or cannot be read counts as
# base-only, as lib/fleet-config.sh resolves it.
# shellcheck source=lib/fleet-config.sh
. "$here/lib/fleet-config.sh"
root="$(fleet_config_root "$top" 2>/dev/null)" || root=""
fleet_config_read "$root"
if [ "$FLEET_CONFIG_PUSH" = base-only ]; then
  say "\"push\" is \"base-only\" in .claude/coder-fleet.json${FLEET_CONFIG_PUSH_REASON:+ ($FLEET_CONFIG_PUSH_REASON)}, so $BRANCH stays on this machine and nothing was pushed"
fi

G() {
  git -C "$top" -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.alternateRefsCommand= \
    -c submodule.recurse=false -c gc.auto=0 -c maintenance.auto=false -c push.gpgSign=false \
    -c protocol.allow=never -c protocol.https.allow=always -c protocol.ssh.allow=always \
    -c protocol.git.allow=always -c protocol.ext.allow=never -c protocol.file.allow=never \
    "$@" </dev/null
}

G show-ref --verify -q "refs/heads/$BRANCH" || say "there is no $BRANCH branch yet, so nothing was pushed"

remotes="$(G remote 2>/dev/null || true)"
[ -n "$remotes" ] || say "no remote, so $BRANCH stays on this machine"
remote=""
if printf '%s\n' "$remotes" | grep -qx origin; then
  remote=origin
elif [ "$(printf '%s\n' "$remotes" | wc -l | tr -d ' ')" = 1 ]; then
  remote="$remotes"
else
  say "several remotes and none named origin, so $BRANCH was not pushed; push it by hand to the one you fetch from"
fi
case "$remote" in */*) remote="" ;; esac
safe "$remote" || say "the remote's name holds a character outside letters, digits, '.', '_', '/' and '-', or starts with '-', so $BRANCH was not pushed"

refused() { say "$BRANCH was not pushed to $remote: $1"; }

# --- what may be pushed to ------------------------------------------------------

scopes="--local"
[ "$(G config --local --type=bool --get extensions.worktreeconfig 2>/dev/null || true)" = true ] && scopes="--local --worktree"
for scope in $scopes; do
  while IFS= read -r -d '' key; do
    case "$key" in
      remote.*.mirror)
        safe "$key" && refused "the repository's own git config sets $key, and a mirror push deletes the remote's other branches"
        refused "the repository's own git config sets a remote's mirror key, and a mirror push deletes the remote's other branches" ;;
    esac
    allowed_key "$key" && continue
    if safe "$key"; then
      refused "the repository's own git config sets $key, which is not on the list of keys known to run no command"
    fi
    refused "the repository's own git config sets a key whose name is not repeated here and which is not on the list of keys known to run no command"
  done < <(G config "$scope" --list --name-only -z 2>/dev/null || true)
done

[ -e "$common/objects/info/alternates" ] && refused "the repository borrows objects through objects/info/alternates"
legacy_remote_files "$common" && refused "the repository has legacy remote files under remotes/ or branches/ in its git dir, which can redirect a push"

# One fetch URL at every scope together, and the push URLs exactly that one.
count="$(G config --get-all "remote.$remote.url" 2>/dev/null | wc -l | tr -d ' ')"
[ "$count" = 1 ] || refused "it has $count URLs configured, and the push goes only to a remote with exactly one"
url="$(G remote get-url "$remote" 2>/dev/null || true)"
push_urls="$(G remote get-url --push --all "$remote" 2>/dev/null || true)"
if [ "$push_urls" != "$url" ]; then
  board_log "$HOOK" "$top: $remote pushes to $(redact "$push_urls"), not the URL it fetches from, $(redact "$url")"
  refused "its pushurl differs from the URL it fetches from, so the board would go somewhere the default branch does not come from; tell the human, who decides whether it stays"
fi
case "$(url_kind "$url")" in
  ok) ;;
  helper) refused "it is reached through a remote helper, and $BRANCH is pushed only to https, ssh and git remotes" ;;
  path) refused "it is a path on this machine, and $BRANCH is pushed only to https, ssh and git remotes" ;;
  *) refused "its URL is not recognised, and $BRANCH is pushed only to https, ssh and git remotes" ;;
esac
for scope in $scopes; do
  while IFS= read -r -d '' rec; do
    val="${rec#*$'\n'}"
    [ "$(url_kind "$val")" = ok ] && continue
    board_log "$HOOK" "$top: $scope ${rec%%$'\n'*} is $(redact "$val"), which is not an https, ssh or git URL"
    refused "a remote url or pushurl in the repository's own config is not an https, ssh or git URL"
  done < <(G config "$scope" -z --get-regexp '^remote\..*\.(url|pushurl)$' 2>/dev/null || true)
done

limit="${CODER_FLEET_PUSH_TIMEOUT:-10}"
case "$limit" in ''|*[!0-9]*|0) limit=10 ;; esac

# --- one at a time, outside the repository ----------------------------------------

set -C
base="$CODER_FLEET_STATE_DIR/state-push"
[ -L "$CODER_FLEET_STATE_DIR" ] && refused "$CODER_FLEET_STATE_DIR is a symlink, which the push never follows"
[ -L "$base" ] && refused "$base is a symlink, which the push never follows"
if [ ! -d "$base" ]; then
  (umask 077 && mkdir -p "$base") 2>/dev/null || refused "$base could not be made"
fi
[ -L "$base" ] && refused "$base is a symlink, which the push never follows"
[ -d "$base" ] && [ -O "$base" ] || refused "$base is not a directory this user owns"
chmod 700 "$base" 2>/dev/null || refused "$base could not be made private"
key="$(printf '%s' "$common" | git hash-object --stdin 2>/dev/null | cut -c1-16)"
[ -n "$key" ] || refused "the repository's lock name could not be made"
lock="$base/$key.lock"
pending="$base/$key.pending"
taken=0
for _ in 1 2 3; do
  [ -L "$lock" ] && refused "its lock $lock is a symlink, which the push never follows"
  if mkdir -m 700 "$lock" 2>/dev/null; then
    printf '%s\n' "$$" > "$lock/pid" || refused "the lock's pid file could not be written"
    taken=1
    break
  fi
  holder="$(cat "$lock/pid" 2>/dev/null || true)"
  case "$holder" in ''|*[!0-9]*) holder="" ;; esac
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    [ -L "$pending" ] && refused "its pending mark $pending is a symlink, which the push never follows"
    mkdir -m 700 "$pending" 2>/dev/null || true
    say "a push of $BRANCH is already running; it pushes this commit too before it stops"
  fi
  rm -rf "$lock"
done
[ "$taken" = 1 ] || refused "the push lock $lock could not be taken"
work="$(mktemp -d "$base/$key.XXXXXX" 2>/dev/null)" || { rm -rf "$lock"; refused "no working directory could be made under $base"; }
trap 'rm -rf "$lock" "$work"' EXIT

# --- the bounded push ------------------------------------------------------------

push_once() {
  # Prints git's exit status. A status over 128 is the watchdog's signal.
  (
    set -m
    G push --quiet --no-verify --no-follow-tags --no-signed --recurse-submodules=no \
      -- "$url" "refs/heads/$BRANCH:refs/heads/$BRANCH" >/dev/null 2>>"$work/err" &
    job=$!
    ( sleep "$limit"; kill -TERM -- "-$job" 2>/dev/null; sleep 1; kill -KILL -- "-$job" 2>/dev/null ) >/dev/null 2>&1 </dev/null &
    dog=$!
    set +m
    wait "$job"
    rc=$?
    kill -TERM -- "-$dog" 2>/dev/null
    kill -KILL -- "-$job" 2>/dev/null
    printf '%s' "$rc"
  )
}

rc=0
pushed=""
for _ in 1 2 3; do
  if [ -d "$pending" ] && [ ! -L "$pending" ]; then rmdir "$pending" 2>/dev/null || true; fi
  pushed="$(G rev-parse -q --verify "refs/heads/$BRANCH" 2>/dev/null || true)"
  rc="$(push_once)"
  [ "$rc" = 0 ] || break
  [ -d "$pending" ] && [ ! -L "$pending" ] || break
done
err="$(cat "$work/err" 2>/dev/null || true)"

if [ "$rc" = 0 ]; then
  [ -n "$pushed" ] && G update-ref -m "coder-fleet: pushed $BRANCH" "refs/remotes/$remote/$BRANCH" "$pushed" 2>/dev/null || true
  say "pushed $BRANCH to $remote${pushed:+ at ${pushed:0:7}}"
fi
board_log "$HOOK" "$top: git push to $remote's URL, $BRANCH, exited ${rc:-?}: $(redact "$err")"
case "$rc" in ''|*[!0-9]*) refused "the push failed for a reason the hook log records" ;; esac
if [ "$rc" -gt 128 ]; then
  refused "the push did not finish within $limit s; the next board or memory commit tries again"
fi
case "$err" in
  *"[rejected]"*|*"non-fast-forward"*|*"fetch first"*)
    say "$BRANCH was rejected by $remote, whose copy has commits this one lacks (another machine pushed); it is never forced: fetch $remote $BRANCH and reconcile by hand" ;;
  *"Authentication failed"*|*"Permission denied"*|*"could not read Username"*|*"could not read Password"*|*"terminal prompts disabled"*|*"Host key verification failed"*|*" 401"*|*" 403"*)
    refused "$remote refused the credentials, or none could be given without a prompt" ;;
  *"Could not resolve"*|*"Connection refused"*|*"timed out"*|*"Network is unreachable"*|*"No route to host"*|*"does not appear to be a git repository"*|*"not found"*|*"unable to access"*)
    refused "$remote could not be reached" ;;
esac
refused "the push failed for a reason the hook log records"
