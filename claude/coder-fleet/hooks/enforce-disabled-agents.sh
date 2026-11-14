#!/usr/bin/env bash
# PreToolUse on the Agent tool: a project's disabled agents are never spawned.
#
# A shim since CF-1.3: the hook is `boards fleet disabled-agents`,
# boards/src/fleet/disabled-agents.ts, which denies an Agent call whose
# subagent_type the main checkout's .claude/coder-fleet.json lists under
# disabledAgents, and reads the file on every call. The rules for reading the
# file are in boards/src/fleet/config.ts.
#
# It fails closed: when the binary will not run, or answers with neither the
# word allow nor a JSON object, the spawn is denied and the reason says why.
#
#   enforce-disabled-agents.sh --check [dir]
#     validates the file in the main checkout of dir's repository (default: the
#     current directory), prints what it disables, and exits 1 when the file is
#     invalid. check-all.sh runs it.
#
# Written for bash 3.2.
_DISABLED_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../boards/boards.sh"
# shellcheck source=../boards/boards.sh
. "$_DISABLED_BOARDS_SH" 2>/dev/null || boards_run() { printf 'boards: no %s\n' "$_DISABLED_BOARDS_SH" >&2; return 127; }
if [ "$#" -gt 0 ]; then boards_run fleet disabled-agents "$@"; exit $?; fi
out="$(boards_run fleet disabled-agents)" && case "$out" in
  allow) exit 0 ;;
  '{'*) printf '%s\n' "$out"; exit 0 ;;
esac
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"coder-fleet: the boards binary could not run, so whether this agent is disabled for the project cannot be checked, and the spawn is refused. Build it (bun scripts/build.ts in the plugin'"'"'s boards directory) or put bun on PATH, then spawn again."}}'
exit 0
