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
#   legacy_remote_files <git dir>  0 when its remotes/ or branches/ holds anything
#   url_kind <url>                 ok, helper, path or unknown
#
# When the binary will not run, every answer is the refusing one: no key is
# allowed, legacy remote files are taken to be there, every URL is unknown,
# and nothing reaches the log.
#
# Written for bash 3.2.

_REMOTE_GUARD_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../boards/boards.sh"

_remote_guard() { bash "$_REMOTE_GUARD_BOARDS_SH" fleet remote-guard "$@" 2>/dev/null; }

redact() { _remote_guard redact "$1"; }

# Only the exact permissive word, with exit 0, counts as permissive; a crash
# or anything else is the refusing answer.
allowed_key() {
  local out
  out="$(_remote_guard allowed-key "$1")" && [ "$out" = allowed ]
}

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
