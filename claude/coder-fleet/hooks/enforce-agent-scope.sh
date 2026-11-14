#!/usr/bin/env bash
# PreToolUse: per-agent tool scoping, and the push and release settings.
#
# A shim since CF-1.3: the hook is `boards fleet scope`,
# boards/src/fleet/scope.ts, which holds every role's rule and quotes the
# invariant it enforces; scope-words.ts reads the command's text,
# write-scope.ts checks a write tool's destination and push-policy.ts judges
# the push and release settings. docs/limits.md records what the rules do not
# stop.
#
# It fails closed: when the binary will not run, or answers with neither the
# word allow nor a JSON object, the call is denied and the reason says why.
#
# Written for bash 3.2.
out="$(bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../boards/boards.sh" fleet scope)" && case "$out" in
  allow) exit 0 ;;
  '{'*) printf '%s\n' "$out"; exit 0 ;;
esac
printf '[PreToolUse] the boards binary could not run, so this call was refused\n' >&2
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"coder-fleet scope hook: the boards binary could not run, so this call cannot be checked against your role'"'"'s invariants or the push and release settings, and it is refused. Build it (bun scripts/build.ts in the plugin'"'"'s boards directory) or put bun on PATH."}}'
exit 0
