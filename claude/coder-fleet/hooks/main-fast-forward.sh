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
# branch, is nothing to do and is said nowhere. A remote or branch name outside
# letters, digits, '.', '_', '/' and '-', or starting with '-', is never handed
# to git, and the session gets a fixed sentence without it.
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

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
# Credentials must never be asked for: an empty GIT_ASKPASS stops git falling
# through to core.askPass or SSH_ASKPASS, and the terminal prompt is off.
export GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="" SSH_ASKPASS="" SSH_ASKPASS_REQUIRE=never GCM_INTERACTIVE=never

# Every git call runs without the repository's own hooks, fsmonitor,
# alternate-refs command, submodule recursion, maintenance or autostash, and
# reads nothing from the terminal. These overrides are the second layer; the
# first is the allowlist below. Global and system core.sshCommand and credential
# helpers are used as they are, because that is where the human's ssh keys and
# saved logins live.
G() {
  git -C "$top" -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.alternateRefsCommand= \
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

# Anything that reaches the log has the userinfo cut out of every URL in it.
redact() { printf '%s' "$1" | tr '\r\n\t' '   ' | sed -E 's#(://)[^/ ]*@#\1***@#g; s/  */ /g; s/^ //; s/ $//' | cut -c1-500; }

json_escape() {
  # Backslash and quote escaped, control characters dropped. Only text built
  # here and names that passed safe() ever reach it.
  printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

say() {
  board_log "$HOOK" "$top: $1"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$(json_escape "Session start: $1")"
  exit 0
}

# A name may reach the session only when it is made of letters, digits, '.',
# '_', '/' and '-' and does not start with '-'. Git's own messages never do:
# the session gets a fixed reason, and the raw text goes to the log.
safe() {
  case "$1" in ''|-*|*[!A-Za-z0-9._/-]*) return 1 ;; esac
  return 0
}

default="$(G symbolic-ref -q "refs/remotes/$remote/HEAD" 2>/dev/null || true)"
default="${default#refs/remotes/$remote/}"
[ -n "$default" ] || default=main
case "$remote" in */*) remote_bad=1 ;; *) remote_bad=0 ;; esac
if [ "$remote_bad" = 1 ] || ! safe "$remote" || ! safe "$default" \
  || ! git check-ref-format --branch "$default" >/dev/null 2>&1; then
  board_log "$HOOK" "$top: the remote or default branch name is not one the hook passes to git; nothing fetched"
  say "the default branch was not fast-forwarded: the name of its remote or of the branch holds a character outside letters, digits, '.', '_', '/' and '-', or starts with '-', so the hook left it alone."
fi
local_ref="refs/heads/$default"
remote_ref="refs/remotes/$remote/$default"
G show-ref --verify -q "$local_ref" || exit 0

plural() { if [ "$1" = 1 ]; then printf '1 commit'; else printf '%s commits' "$1"; fi; }

refused() {
  say "$default was not fast-forwarded to $remote/$default and is left as it is: $1. Never reset, stash, rebase or force past this; tell the human, as lead-procedures says under Worktrees and memory."
}

# --- what may be fetched -------------------------------------------------------

# .git/config is shared by every worktree, so an agent session can write to it,
# and this hook runs outside every agent's sandbox and scope hook. A key there
# that names a command would run at the next session start, and git has too
# many such keys to list. So the repository's own config - local scope, and
# worktree scope when it is on - may hold only the keys below, which run
# nothing; any other key and the hook fetches nothing and moves nothing. The
# list is what git clone, git worktree add (with --track and relative paths),
# sparse checkout and a sha256 or reftable repository write - and no other
# extension, since extensions.partialclone names a remote git fetches from
# lazily, in a merge too - the usual per-branch and pull settings, submodule url and active (the
# hook never recurses into a submodule), merge.ff and merge.autostash (both
# overridden on the merge), and the branch description and VS Code's merge-base
# note. The human's global and system config is trusted as it is.
allowed_key() {
  case "$1" in
    core.repositoryformatversion|core.bare|core.filemode|core.logallrefupdates|core.ignorecase) return 0 ;;
    core.precomposeunicode|core.symlinks|core.autocrlf|core.eol) return 0 ;;
    core.sparsecheckout|core.sparsecheckoutcone|index.sparse) return 0 ;;
    extensions.worktreeconfig|extensions.objectformat|extensions.refstorage|extensions.relativeworktrees) return 0 ;;
    remote.*.url|remote.*.fetch|remote.*.pushurl|remote.*.prune|remote.*.tagopt|remote.*.mirror) return 0 ;;
    branch.*.remote|branch.*.merge|branch.*.rebase|branch.*.description|branch.*.vscode-merge-base) return 0 ;;
    pull.rebase|pull.ff|push.default|merge.ff|merge.autostash) return 0 ;;
    user.name|user.email|init.defaultbranch|gc.auto|maintenance.auto|rerere.enabled|worktree.guessremote) return 0 ;;
    submodule.*.url|submodule.*.active) return 0 ;;
  esac
  return 1
}
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

# Only https, ssh and git remotes are fetched, and the scp-like user@host:path.
# A local path, file://, ext:: or any other remote helper can run a command or
# read the disk, so each of those is left for the human to bring level by hand.
# git enforces the same list on every call the hook makes, through
# protocol.allow in G().
urls="$(G remote get-url --all "$remote" 2>/dev/null || true)"
[ -n "$urls" ] || exit 0
# url_kind <url>: ok, helper, path or unknown. A newline or any other control
# character makes it unknown before anything else is read, and the scp-like
# form is matched against the whole string, never line by line.
scp_like='^([A-Za-z0-9._~+-]+@)?[A-Za-z0-9._-]+:[^/]'
url_kind() {
  case "$1" in
    *[[:cntrl:]]*) printf unknown; return 0 ;;
    https://*|ssh://*|git://*|git+ssh://*|ssh+git://*) printf ok ;;
    *::*) printf helper ;;
    /*|./*|../*|file:*|~*) printf path ;;
    *://*) printf unknown ;;
    *)
      if [[ $1 =~ $scp_like ]]; then printf ok; else printf unknown; fi ;;
  esac
}
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
# Ahead of the remote: nothing to bring level.
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
say "fast-forwarded $default by $(plural "$behind") to $remote/$default without a checkout; the main checkout $what, not $default, and agent worktrees are cut from what is out."
