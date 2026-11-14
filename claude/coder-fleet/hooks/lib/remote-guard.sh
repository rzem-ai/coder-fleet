# remote-guard.sh - what a fleet hook may hand to git before it talks to a
# remote. Sourced by main-fast-forward.sh, which fetches, and state-push.sh,
# which pushes coder-fleet/state, so the two hold one list.
#
# A shim since CF-1.2: each function passes its arguments to
# `boards fleet remote-guard`, boards/src/fleet/remote-guard.ts, which holds
# the list and the rules. The interface is unchanged:
#
#   redact <text>                  the text with every URL's userinfo cut out,
#                                  on one line, at most 500 characters
#   allowed_key <key>              0 when a repository-config key runs nothing
#   allowed_keys                   every NUL-separated key on stdin judged in one
#                                  call: "allowed" or "refused", then the key,
#                                  each NUL-terminated, then "end"; nothing at
#                                  all when the binary will not run
#   legacy_remote_files <git dir>  0 when its remotes/ or branches/ holds anything
#   url_kind <url>                 ok, helper, path or unknown
#
# When the binary will not run, every answer is the refusing one: no key is
# allowed, legacy remote files are taken to be there, every URL is unknown,
# and nothing reaches the log.
#
# Written for bash 3.2.

_REMOTE_GUARD_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../boards/boards.sh"
# shellcheck source=../../boards/boards.sh
. "$_REMOTE_GUARD_BOARDS_SH" 2>/dev/null || boards_run() { printf 'boards: no %s\n' "$_REMOTE_GUARD_BOARDS_SH" >&2; return 127; }

_remote_guard() { boards_run fleet remote-guard "$@" 2>/dev/null; }

redact() { _remote_guard redact "$1"; }

# Only the exact permissive word, with exit 0, counts as permissive; a crash
# or anything else is the refusing answer.
allowed_key() {
  local out
  out="$(_remote_guard allowed-key "$1")" && [ "$out" = allowed ]
}

allowed_keys() { _remote_guard allowed-keys; }

legacy_remote_files() {
  local out
  out="$(_remote_guard legacy-remote-files "$1")" && [ "$out" = absent ] && return 1
  return 0
}

url_kind() {
  local kind
  kind="$(_remote_guard url-kind "$1")" || kind=unknown
  case "$kind" in ok|helper|path) printf '%s' "$kind" ;; *) printf unknown ;; esac
}
