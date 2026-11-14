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
# has another name. The branch is the trunk fleet_trunk resolves
# (lib/fleet-config.sh): baseBranch in .claude/coder-fleet.json when set, else
# what <remote>/HEAD names, else main. A baseBranch the resolver cannot use
# moves nothing; the session gets a fixed sentence and the hook log the
# resolver's reason, since the file is the project's own text. No remote, or
# no local copy of the default branch, is nothing to do and is said nowhere. A
# remote or branch name outside letters, digits, '.', '_', '/' and '-', or
# starting with '-', is never handed to git, and the session gets a fixed
# sentence without it.
#
# A base branch the human set is routinely ahead of its remote copy, or has
# none, since the human commits on it himself. Either is said in one line and
# moves nothing. And when the main checkout has another branch out, the
# session is told which, because agent worktrees are cut from what is out.
#
# What it fetches from: only https, ssh and git remotes, and scp-like
# user@host:path, and git is held to the same list with protocol.allow. A local
# path, file://, ext:: or another remote helper is not fetched, and the session
# is told why. Nor is anything fetched when the repository's own config, which
# any agent session can write, sets a key that can run a command - an ssh
# command, credential helper, proxy, filter, include, uploadpack, vcs or gpg
# key. The same keys in global or system config, where the human's ssh keys and
# saved logins live, are used as they are. The repository's git hooks and
# fsmonitor never run.
#
# What the session is told: only text this hook wrote and names that passed
# the check above. A failed fetch is one of four fixed reasons - timed out,
# could not be reached, credentials refused, or another reason - and git's own
# words go to the hook log, with the userinfo of any URL in them cut out.
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
# autostash is turned off.
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
# branch or could not, and nothing when the branch was level or ahead, unless
# baseBranch named it. A second line says which branch is out when baseBranch
# is set and the main checkout is not on it. Each of those lines goes to the
# hook log too. It never exits non-zero.
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
# shellcheck source=lib/remote-guard.sh
. "$here/lib/remote-guard.sh"
# shellcheck source=lib/fleet-config.sh
. "$here/lib/fleet-config.sh"

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

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
# Credentials must never be asked for: an empty GIT_ASKPASS stops git falling
# through to core.askPass or SSH_ASKPASS, and the terminal prompt is off.
export GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" SSH_ASKPASS_REQUIRE=never GCM_INTERACTIVE=never

# Every git call runs without the repository's own hooks, fsmonitor,
# alternate-refs command, submodule recursion, maintenance or autostash, and
# reads nothing from the terminal. These overrides are the second layer; the
# first is the allowlist below. Global and system core.sshCommand and credential
# helpers are used as they are, because that is where the human's ssh keys and
# saved logins live. LC_ALL=C keeps git's messages in English, the words the
# hook matches.
G() {
  LC_ALL=C git -C "$top" -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.alternateRefsCommand= \
    -c submodule.recurse=false -c gc.auto=0 -c maintenance.auto=false -c merge.autoStash=false \
    -c protocol.allow=never -c protocol.https.allow=always -c protocol.ssh.allow=always \
    -c protocol.git.allow=always -c protocol.ext.allow=never -c protocol.file.allow=never \
    "$@" </dev/null
}

[ "$(git -C "$cwd" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || exit 0
top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0
gitdir="$(G rev-parse --path-format=absolute --git-dir 2>/dev/null)" || exit 0
common="$(G rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0
# A linked worktree's git dir is under the common one; only the main checkout
# has them equal.
[ -n "$gitdir" ] && [ "$gitdir" = "$common" ] || exit 0

json_escape() {
  # Backslash and quote escaped, control characters dropped. Only text built
  # here and names that passed safe() ever reach it.
  printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# out_note is the line saying which branch the main checkout has out when
# baseBranch names another. It rides with whatever else is said, and on its
# own when nothing else is.
out_note=""
said=0
say() {
  local text
  board_log "$HOOK" "$top: $1"
  text="$(json_escape "Session start: $1")"
  if [ -n "$out_note" ]; then
    board_log "$HOOK" "$top: $out_note"
    text="$text\\n$(json_escape "Session start: $out_note")"
  fi
  said=1
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$text"
  exit 0
}
say_note_only() {
  [ "$said" = 0 ] && [ -n "$out_note" ] || return 0
  board_log "$HOOK" "$top: $out_note"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$(json_escape "Session start: $out_note")"
}

# A name may reach the session only when it is made of letters, digits, '.',
# '_', '/' and '-' and does not start with '-'. Git's own messages never do:
# the session gets a fixed reason, and the raw text goes to the log.
safe() {
  case "$1" in ''|-*|*[!A-Za-z0-9._/-]*) return 1 ;; esac
  return 0
}

unsafe_name() {
  board_log "$HOOK" "$top: the remote or default branch name is not one the hook passes to git; nothing fetched"
  say "the default branch was not fast-forwarded: the name of its remote or of the branch holds a character outside letters, digits, '.', '_', '/' and '-', or starts with '-', so the hook left it alone."
}

# The trunk, from the one resolver. A baseBranch it cannot use moves nothing
# and never falls back to the remote's HEAD. .claude/coder-fleet.json is
# committed in a project, so a cloned repository chooses its text: the session
# gets a fixed sentence, and the resolver's reason, which quotes the value,
# goes to the hook log alone. Every name this hook says passed the
# resolver's name check.
if fleet_trunk "$top"; then
  default="$FLEET_TRUNK"
  from="$FLEET_TRUNK_FROM"
elif [ "$FLEET_TRUNK_FROM" = remote ]; then
  unsafe_name
else
  board_log "$HOOK" "$top: no trunk: $FLEET_TRUNK_REASON"
  say "baseBranch in .claude/coder-fleet.json does not name a usable branch, so nothing was fetched or moved; the hook log has the reason, and /coder-fleet:agents base shows it."
fi
if [ "$from" = setting ]; then
  here_branch="$(G symbolic-ref -q HEAD 2>/dev/null || true)"
  if [ "$here_branch" != "refs/heads/$default" ]; then
    out="${here_branch#refs/heads/}"
    if [ -z "$here_branch" ]; then
      what="has a detached HEAD out"
    elif safe "$out"; then
      what="has $out out"
    else
      what="has another branch out"
    fi
    out_note="the main checkout $what, not the base branch $default, and agent worktrees are cut from what is out."
  fi
fi
trap say_note_only EXIT

# No remote, or several and none called origin: nothing to fetch from, said
# only of a base branch the human named, which may live here alone.
no_remote_copy() {
  [ "$from" = setting ] || exit 0
  say "$default has no remote copy the hook can fetch, since $1, so there is nothing to fast-forward it to, and nothing moved."
}
remotes="$(G remote 2>/dev/null)" || exit 0
[ -n "$remotes" ] || no_remote_copy "the repository has no remote"
remote=""
if printf '%s\n' "$remotes" | grep -qx origin; then
  remote=origin
elif [ "$(printf '%s\n' "$remotes" | wc -l | tr -d ' ')" = 1 ]; then
  remote="$remotes"
else
  no_remote_copy "it has several remotes and none is called origin"
fi

case "$remote" in */*) remote_bad=1 ;; *) remote_bad=0 ;; esac
if [ "$remote_bad" = 1 ] || ! safe "$remote" || ! safe "$default" \
  || ! git check-ref-format --branch "$default" >/dev/null 2>&1; then
  unsafe_name
fi
local_ref="refs/heads/$default"
remote_ref="refs/remotes/$remote/$default"
G show-ref --verify -q "$local_ref" || exit 0

plural() { if [ "$1" = 1 ]; then printf '1 commit'; else printf '%s commits' "$1"; fi; }

refused() {
  say "$default was not fast-forwarded to $remote/$default and is left as it is: $1. Never reset, stash, rebase or force past this; tell the human, as lead-procedures says under Worktrees and memory."
}

# --- what may be fetched -------------------------------------------------------

scopes="--local"
[ "$(G config --local --type=bool --get extensions.worktreeconfig 2>/dev/null || true)" = true ] && scopes="--local --worktree"
for scope in $scopes; do
  while IFS= read -r -d '' key; do
    allowed_key "$key" && continue
    board_log "$HOOK" "$top: $scope config sets $(redact "$key"), which is not on the allowlist; nothing fetched"
    if safe "$key"; then
      refused "the repository's own git config sets $key, which is not on the hook's list of keys known to run no command, so the hook fetched nothing for the lead to do by hand"
    fi
    refused "the repository's own git config sets a key whose name the hook does not repeat and which is not on its list of keys known to run no command, so the hook fetched nothing for the lead to do by hand"
  done < <(G config "$scope" --list --name-only -z 2>/dev/null || true)
done

# Objects borrowed from another repository can come with their own commands
# and their own trust, so a repository with alternates is left to the human.
if [ -e "$common/objects/info/alternates" ]; then
  refused "the repository borrows objects through objects/info/alternates, so the hook fetched nothing for the lead to do by hand"
fi
if legacy_remote_files "$common"; then
  refused "the repository has legacy remote files under remotes/ or branches/ in its git dir, which can redirect a fetch, so the hook fetched nothing for the lead to do by hand"
fi

# Only https, ssh and git remotes are fetched, and the scp-like user@host:path.
# A local path, file://, ext:: or any other remote helper can run a command or
# read the disk, so each of those is left for the human to bring level by hand.
# git enforces the same list on every call the hook makes, through
# protocol.allow in G().
urls="$(G remote get-url --all "$remote" 2>/dev/null || true)"
[ -n "$urls" ] || exit 0
while IFS= read -r url; do
  case "$(url_kind "$url")" in
    helper) refused "$remote is fetched through a remote helper, and the hook fetches only https, ssh and git remotes" ;;
    path) refused "$remote is a path on this machine, and the hook fetches only https, ssh and git remotes" ;;
    unknown) refused "$remote has a URL the hook does not recognise, and it fetches only https, ssh and git remotes" ;;
  esac
done <<EOF
$urls
EOF

# Every remote's url and pushurl in the repository's own config, at each scope
# the allowlist reads, is held to the same list, since a planted one would be
# in reach of the next fetch or push. Several remotes are normal - a fork has
# origin and upstream - and only a URL that fails the list stops the hook.
for scope in $scopes; do
  while IFS= read -r -d '' rec; do
    val="${rec#*$'\n'}"
    [ "$(url_kind "$val")" = ok ] && continue
    board_log "$HOOK" "$top: $scope ${rec%%$'\n'*} is $(redact "$val"), which is not an https, ssh or git URL; nothing fetched"
    refused "a remote url or pushurl in the repository's own config is not an https, ssh or git URL, so the hook fetched nothing for the lead to do by hand"
  done < <(G config "$scope" -z --get-regexp '^remote\..*\.(url|pushurl)$' 2>/dev/null || true)
done

# --- the bounded fetch --------------------------------------------------------

# Prints the fetch's stderr, then its exit status on a line of its own. A
# status over 128 is the watchdog's signal.
fetch_out="$(
  set -m
  G fetch --quiet --no-tags --no-recurse-submodules --no-write-fetch-head \
    -- "$remote" "refs/heads/$default" 2>&1 >/dev/null &
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
  board_log "$HOOK" "$top: git fetch $remote exited ${fetch_rc:-?}: $(redact "$fetch_err")"
  # A base branch the human named may exist only here. git's own words for
  # that are fixed, so matching them reads nothing the remote chose.
  if [ "$from" = setting ]; then
    case "$fetch_err" in
      *"fatal: couldn't find remote ref refs/heads/$default"*)
        say "$default has no copy on $remote, so there is nothing to fast-forward it to, and nothing moved." ;;
    esac
  fi
  case "$fetch_rc" in
    ''|*[!0-9]*) refused "the fetch from $remote failed for a reason the hook log records" ;;
  esac
  if [ "$fetch_rc" -gt 128 ]; then
    refused "the fetch from $remote did not finish within $limit s, so how far behind it is is unknown"
  fi
  case "$fetch_err" in
    *"Authentication failed"*|*"Permission denied"*|*"could not read Username"*|*"could not read Password"*|*"terminal prompts disabled"*|*"Host key verification failed"*|*" 401"*|*" 403"*)
      refused "$remote refused the credentials, or none could be given without a prompt" ;;
    *"Could not resolve"*|*"Connection refused"*|*"timed out"*|*"Network is unreachable"*|*"No route to host"*|*"does not appear to be a git repository"*|*"not found"*|*"unable to access"*)
      refused "$remote could not be reached" ;;
  esac
  refused "the fetch from $remote failed for a reason the hook log records"
fi

# --- compare ------------------------------------------------------------------

old="$(G rev-parse -q --verify "$local_ref^{commit}" 2>/dev/null)" || exit 0
new="$(G rev-parse -q --verify "$remote_ref^{commit}" 2>/dev/null)" || exit 0
[ "$old" = "$new" ] && exit 0
# Ahead of the remote: nothing to bring level. Said only of a base branch the
# human named, which he commits on himself.
if G merge-base --is-ancestor "$new" "$old" 2>/dev/null; then
  [ "$from" = setting ] || exit 0
  ahead="$(G rev-list --count "$new..$old" 2>/dev/null || printf '?')"
  say "$default is $(plural "$ahead") ahead of $remote/$default and not behind it, so there is nothing to fast-forward, and nothing moved."
fi
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
    board_log "$HOOK" "$top: git merge --ff-only refused: $(redact "$err")"
    # git lists the files in the way one per line, indented by a tab. Only
    # the ones with safe names are named; the rest are counted.
    named=""
    others=0
    while IFS= read -r line; do
      case "$line" in
        "	"*)
          f="${line#	}"
          if safe "$f" && [ "$(printf '%s' "$named" | wc -w | tr -d ' ')" -lt 5 ]; then named="${named:+$named, }$f"; else others=$((others + 1)); fi ;;
      esac
    done <<EOF
$err
EOF
    if [ -n "$named" ] || [ "$others" -gt 0 ]; then
      files="${named:-files}"
      [ -n "$named" ] && [ "$others" -gt 0 ] && files="$named and $others more"
      [ -z "$named" ] && [ "$others" = 1 ] && files="a file whose name the hook does not repeat"
      [ -z "$named" ] && [ "$others" -gt 1 ] && files="$others files whose names the hook does not repeat"
      refused "git merge --ff-only refused the $(plural "$behind") from $remote/$default, because a changed or untracked file is in the way: $files"
    fi
    refused "git merge --ff-only refused the $(plural "$behind") from $remote/$default for a reason the hook log records"
  fi
  short="$(G rev-parse --short "$new" 2>/dev/null || printf '%s' "$new")"
  say "fast-forwarded $default by $(plural "$behind") to $remote/$default ($short)."
fi

if [ -n "$elsewhere" ]; then
  if safe "$elsewhere"; then
    refused "$default is checked out in the linked worktree $elsewhere, so it is brought level from there"
  fi
  refused "$default is checked out in a linked worktree whose path the hook does not repeat, so it is brought level from there"
fi

# A rebase or a bisect detaches HEAD, so the listing above does not show the
# branch as out, yet the branch is still in use and git's own branch-checked-out
# check refuses to move it. Read the same files git does, in the main git dir
# and every linked worktree's.
for d in "$common" "$common"/worktrees/*; do
  [ -d "$d" ] || continue
  if [ "$d" = "$common" ]; then where="the main checkout"; else where="a linked worktree"; fi
  for f in "$d/rebase-merge/head-name" "$d/rebase-apply/head-name"; do
    if [ -f "$f" ] && [ "$(head -n 1 "$f" 2>/dev/null)" = "$local_ref" ]; then
      refused "$default is being rebased in $where, so the hook left it for the lead to bring level once the rebase is done"
    fi
  done
  if [ -f "$d/BISECT_START" ]; then
    b="$(head -n 1 "$d/BISECT_START" 2>/dev/null)"
    if [ "$b" = "$default" ] || [ "$b" = "$local_ref" ]; then
      refused "$default is being bisected in $where, so the hook left it for the lead to bring level once the bisect is done"
    fi
  fi
done

if ! err="$(G update-ref -m "coder-fleet: fast-forward $default to $remote/$default at session start" "$local_ref" "$new" "$old" 2>&1)"; then
  board_log "$HOOK" "$top: git update-ref refused: $(redact "$err")"
  refused "git update-ref refused to move it, most likely because it moved while the hook ran"
fi
out="${here_branch#refs/heads/}"
if [ -z "$here_branch" ]; then
  what="has a detached HEAD out"
elif safe "$out"; then
  what="has $out out"
else
  what="has another branch out"
fi
# This line already says what is out.
out_note=""
say "fast-forwarded $default by $(plural "$behind") to $remote/$default without a checkout; the main checkout $what, not $default, and agent worktrees are cut from what is out."
