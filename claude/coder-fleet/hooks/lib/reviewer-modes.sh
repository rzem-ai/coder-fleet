# reviewer-modes.sh - which modes a reviewer's brief gives it.
#
# Sourced, never run, by agent-clock.sh and enforce-agent-scope.sh. A shim
# since CF-1.2: reviewer_modes passes its arguments to
# `boards fleet reviewer-modes`, boards/src/fleet/reviewer-modes.ts, which
# states the signal: the first five lines of the spawn prompt, a closed
# `Modes: ` header format, an unread brief failing closed, and a sticky record
# per agent under REVIEWER_MODES_STATE_DIR.
#
#   reviewer_modes <session transcript_path> <agent_id>
#       prints "review", "review break", "review use" or "review break use";
#       returns 0 when the answer is recorded or was read cleanly, 1 when the
#       brief is unread (and prints "review").
#
# When the binary will not run, the brief is unread: "review", and 1.
#
# Written for bash 3.2.

REVIEWER_MODES_STATE_DIR="${CODER_FLEET_STATE_DIR:-${XDG_STATE_HOME:-${HOME:-}/.local/state}/coder-fleet}/modes"
_REVIEWER_MODES_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../boards/boards.sh"

reviewer_modes() {
  local out rc=0
  out="$(bash "$_REVIEWER_MODES_BOARDS_SH" fleet reviewer-modes "$1" "$2" "$REVIEWER_MODES_STATE_DIR" 2>/dev/null)" || rc=$?
  case "$rc|$out" in
    "0|review"|"0|review break"|"0|review use"|"0|review break use") printf '%s' "$out"; return 0 ;;
  esac
  printf 'review'
  return 1
}
