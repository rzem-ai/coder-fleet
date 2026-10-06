#!/usr/bin/env bash
# SessionStart: clear the checkout's focus, so a focus from an earlier session
# never binds this session's spawns (CF-70).
#
# The focus is one line in .boards/.focus in the main checkout, per checkout and
# not per session, so it outlives the session that set it. On 6 October it
# still held CF-139 from the session before, and the next session's CF-140
# scout bound to it from SubagentStart and left its handoff on CF-139. The lead
# focuses before its first spawn on an item, so a session that starts with no
# focus loses nothing, and one that starts with a stale focus loses its first
# handoff to the wrong card.
#
# Which starts clear it: startup, clear and resume, and an event whose source
# cannot be read. A compaction is the same session going on, so it keeps its
# focus. A resume clears, because other sessions may have refocused the
# checkout since, and an unbound spawn costs a missing move where a stale one
# costs a comment, or a Blocker, on the wrong card.
#
# What it prints: one stdout line, which SessionStart adds to the session's
# context, naming the item it cleared, so a resumed lead knows to focus again.
# Nothing when nothing was focused.
#
# It never exits non-zero and never blocks a session. The board off, a dry run
# or a focus read that fails each clear nothing.

set -euo pipefail

HOOK=FocusClear
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/board.sh
. "$HOOK_DIR/lib/board.sh"

trap 'board_log "$HOOK" "unexpected error on line $LINENO; session continues"; exit 0' ERR

input="$(cat)"

board_disabled && exit 0

source_kind=""
cwd=""
if command -v jq >/dev/null 2>&1; then
  source_kind="$(printf '%s' "$input" | jq -r '.source // ""' 2>/dev/null || printf '')"
  cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null || printf '')"
fi
[ "$source_kind" = "compact" ] && exit 0
[ -n "$cwd" ] || cwd="$PWD"
export BOARD_CWD="$cwd"

# 1 is a read that found nothing focused, 2 one that failed; neither clears.
focus=""
if ! focus="$(board_focus_id "$HOOK")"; then exit 0; fi

if ! board_would_send; then
  board_log "$HOOK" "dry run: would clear the focus on $focus left from an earlier session"
  exit 0
fi
if ! board_focus_clear "$HOOK"; then
  board_log "$HOOK" "could not clear the focus on $focus; the first spawn of this session may bind to it"
  exit 0
fi
board_log "$HOOK" "cleared the focus on $focus at session start (${source_kind:-unknown source}), so it cannot bind this session's spawns"
printf 'Board focus: %s was focused from an earlier session and has been cleared. Call task_focus <id> before the first spawn on an item.\n' "$focus"
exit 0
