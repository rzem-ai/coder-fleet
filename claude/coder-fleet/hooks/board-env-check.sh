#!/usr/bin/env bash
# SessionStart: name each BOARD_COL_* override the board's config does not list.
#
# GitHub issue 14. In Fathom a BOARD_COL_DOING="In Progress" override in
# board.env disagreed with a board still on Doing, every SubagentStart move
# failed with "invalid status", and nothing reported it for a week. Kickoff
# cannot check this itself: permissions.deny and the sandbox both hide
# ~/.config/coder-fleet from every agent, and the lead's Bash with it. A hook
# runs outside the agent's permission model (docs/fleet-design.md), so the check
# lives here and kickoff reports what it printed.
#
# What it prints: one stdout line per overridden column the config does not
# list, which SessionStart adds to the session's context, and the same line in
# hooks.log with the repository's path, the fallback kickoff names. It prints
# the BOARD_COL_* names and values and nothing else from board.env, which may
# sit beside rendered secrets.
#
# What it costs: nothing when no column is overridden, which is the common case,
# because it exits before jq or the binary. Otherwise one status probe per
# override, and it stops at the first probe that fails for any other reason
# (no board here), which board_cli has already logged.
#
# It never exits non-zero and never blocks a session.

set -euo pipefail

HOOK=BoardEnvCheck
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/board.sh
. "$HOOK_DIR/lib/board.sh"

trap 'board_log "$HOOK" "unexpected error on line $LINENO; session continues"; exit 0' ERR

input="$(cat)"

board_disabled && exit 0

overrides="$(board_col_overrides)"
[ -n "$overrides" ] || exit 0

if ! command -v jq >/dev/null 2>&1; then
  board_log "$HOOK" "jq is not installed, so the board.env check cannot read its input. Install jq (macOS: brew install jq)."
  exit 0
fi

cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null || printf '')"
[ -n "$cwd" ] || cwd="$PWD"
export BOARD_CWD="$cwd"
repo="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$cwd")"

tab="$(printf '\t')"
while IFS="$tab" read -r name value; do
  [ -n "$name" ] || continue
  rc=0
  board_status_listed "$HOOK" "$value" || rc=$?
  case "$rc" in
    0) ;;
    1)
      if [ "$name" = "BOARD_COL_DOING" ]; then
        fix="Remove the line from board.env (the in-progress column needs no override since v0.26.0) or add the status to the config."
      else
        fix="Remove the line from board.env or add the status to the config."
      fi
      line="board.env check: $name is \"$value\", which .boards/config.yml in $repo does not list, so every hook move to that column will fail. $fix"
      printf '%s\n' "$line"
      board_log "$HOOK" "$line"
      ;;
    *) exit 0 ;;
  esac
done <<EOF
$overrides
EOF

exit 0
