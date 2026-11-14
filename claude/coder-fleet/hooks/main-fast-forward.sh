#!/usr/bin/env bash
# SessionStart: bring the main checkout's default branch level with its remote,
# by fast-forward alone, and tell the session what happened.
#
# A shim since CF-1.3: the hook is `boards fleet fast-forward`,
# boards/src/fleet/fast-forward.ts, which holds the rules: only a main
# checkout, only the trunk config.ts resolves, only https, ssh and git
# remotes, one fetch bounded at CODER_FLEET_FETCH_TIMEOUT seconds, and a move
# by fast-forward alone. CODER_FLEET_FAST_FORWARD=off does nothing.
#
# It never fails the session start: when the binary will not run, nothing
# moves and stderr says why.
#
# Written for bash 3.2.
_FF_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../boards/boards.sh"
# shellcheck source=../boards/boards.sh
. "$_FF_BOARDS_SH" 2>/dev/null || boards_run() { printf 'boards: no %s\n' "$_FF_BOARDS_SH" >&2; return 127; }
boards_run fleet fast-forward \
  || printf '[FastForward] the boards binary could not run, so the default branch was not checked against its remote\n' >&2
exit 0
