#!/usr/bin/env bash
# SessionStart: the fetch, then the board's own session-start hook, in that
# order. Claude Code runs an event's hooks in parallel, so two entries in
# hooks.json would start the board's hook before the binary it runs is there.
# One command runs them one after the other.
#
# The fetch is boards-binary.sh, which never fails a session. The board's hook
# is `boards.sh hook session-start`, given this hook's stdin. When boards.sh
# still finds no binary (another session holds the fetch, or the fetch gave
# up) it exits 127, which Claude Code would show only as a hook error; this
# says instead, to the session, that the board's hook was skipped and why.
#
# Written for bash 3.2.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
input="$(cat)"
"$here/boards-binary.sh" < /dev/null
printf '%s' "$input" | "$here/../scripts/boards.sh" hook session-start
rc=$?
[ "$rc" = 127 ] || exit "$rc"
printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"coder-fleet: the board'"'"'s session-start hook was skipped for a missing boards binary, so the board was not read at the start of this session."}}'
exit 0
