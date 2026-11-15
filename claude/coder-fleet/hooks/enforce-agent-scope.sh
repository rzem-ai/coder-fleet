#!/usr/bin/env bash
# PreToolUse: per-agent tool scoping, and the push and release settings.
#
# A shim since CF-1.3: the hook is `boards fleet scope`,
# claude/boards/src/fleet/scope.ts, which holds every role's rule and quotes the
# invariant it enforces; scope-words.ts reads the command's text,
# write-scope.ts checks a write tool's destination and push-policy.ts judges
# the push and release settings. docs/limits.md records what the rules do not
# stop.
#
# It fails closed: when the binary will not run, or answers with neither the
# word allow nor a JSON object, the call is denied and the reason says why.
#
# Written for bash 3.2.
_SCOPE_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../scripts/boards.sh"
# shellcheck source=../scripts/boards.sh
. "$_SCOPE_BOARDS_SH" 2>/dev/null || boards_run() { printf 'boards: no %s\n' "$_SCOPE_BOARDS_SH" >&2; return 127; }
out="$(boards_run fleet scope)" && case "$out" in
  allow) exit 0 ;;
  '{'*) printf '%s\n' "$out"; exit 0 ;;
esac
printf '[PreToolUse] the boards binary could not run, so this call was refused\n' >&2
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"coder-fleet scope hook: the boards binary could not run, so this call cannot be checked against your role'"'"'s invariants or the push and release settings, and it is refused. In a checkout of the coder-fleet repo, build it with bun run build in claude/boards. In an install, it is the release binary the session-start fetch puts in the plugin'"'"'s data directory; ~/.local/state/coder-fleet/log/hooks.log says why it is missing."}}'
exit 0
