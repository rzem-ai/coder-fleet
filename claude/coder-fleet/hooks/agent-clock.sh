#!/usr/bin/env bash
# SubagentStart and PreToolUse: a wall-clock cap for the agents that have one.
#
# A shim since CF-1.3: the hook is `boards fleet clock`,
# boards/src/fleet/clock.ts, which holds the rule and its reasons. A reviewer
# whose brief names break mode is denied every call past its 25-minute hard
# cap, and under it a Bash call's timeout is trimmed to the time left.
#
# The main session sends no agent_id and is never capped, so it leaves here
# before the binary starts, on every one of its tool calls. The clock fails
# open, as it always has: when the binary will not run, the call is allowed
# and stderr says why.
#
# Written for bash 3.2.
input="$(cat)"
case "$input" in
  *'"agent_id"'*) ;;
  *) exit 0 ;;
esac
_CLOCK_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../boards/boards.sh"
# shellcheck source=../boards/boards.sh
. "$_CLOCK_BOARDS_SH" 2>/dev/null || boards_run() { printf 'boards: no %s\n' "$_CLOCK_BOARDS_SH" >&2; return 127; }
printf '%s' "$input" | boards_run fleet clock \
  || printf '[AgentClock] the boards binary could not run, so no agent'"'"'s time cap is enforced; allowing the call\n' >&2
exit 0
