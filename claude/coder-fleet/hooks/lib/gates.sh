# shellcheck shell=bash
# The two gates a card meets on its way to Done, shared by the two hooks that
# move one there: board-task-completed.sh on a [board:<id>] task, and
# board-release-close.sh on a release tag push. Sourced after lib/board.sh,
# never executed.
#
# A shim since CF-1.2: the decisions are `boards fleet gates`,
# boards/src/fleet/gates.ts. What touches the old board stays here in its own
# bash, board_log and board_item_checklist, and its results are handed over.
#
#   gate_test_verdict HOOK WORK_DIR
#       sets GATE_VERDICT (pass, fail or unknown), GATE_DETAIL and
#       GATE_STATUS_FILE, from CODER_FLEET_TEST_COMMAND, else the test-status
#       marker file, and logs through board_log. See hooks/README.md, "The test
#       gate".
#   gate_card_check HOOK ID
#       0 when the card has at least one acceptance criterion and every
#       criterion and Definition of Done item is ticked; 1 when not, with
#       GATE_CARD_BODY saying what is missing; 2 when the card could not be
#       read. The BOARD_ITEM_* counts are set on 0 and 1.
#
# When the binary will not run, the test gate fails and the card cannot be
# read, so a card moves nowhere on an unjudged gate.
#
# Written for bash 3.2, like board.sh. Every step that can fail runs in a
# condition, so a caller under errexit sees a return code rather than dying.

CODER_FLEET_TEST_GATE="${CODER_FLEET_TEST_GATE:-lenient}"
CODER_FLEET_TEST_COMMAND="${CODER_FLEET_TEST_COMMAND:-}"
CODER_FLEET_TEST_TIMEOUT="${CODER_FLEET_TEST_TIMEOUT:-300}"
CODER_FLEET_TEST_STATUS_MAX_AGE="${CODER_FLEET_TEST_STATUS_MAX_AGE:-3600}"
_GATES_BOARDS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../boards/boards.sh"

gate_test_verdict() {
  local out
  GATE_VERDICT=""
  GATE_DETAIL=""
  if out="$(CODER_FLEET_TEST_COMMAND="$CODER_FLEET_TEST_COMMAND" \
      CODER_FLEET_TEST_TIMEOUT="$CODER_FLEET_TEST_TIMEOUT" \
      CODER_FLEET_TEST_STATUS_MAX_AGE="$CODER_FLEET_TEST_STATUS_MAX_AGE" \
      CODER_FLEET_TEST_STATUS_FILE="${CODER_FLEET_TEST_STATUS_FILE:-}" \
      bash "$_GATES_BOARDS_SH" fleet gates test-verdict "$1" "$2")" && [ -n "$out" ]; then
    eval "$out"
  else
    GATE_VERDICT=fail
    GATE_DETAIL="The boards binary could not run, so the test gate could not be judged."
    GATE_STATUS_FILE="${CODER_FLEET_TEST_STATUS_FILE:-$2/.claude/test-status}"
    board_log "$1" "the boards binary could not run, so the test gate fails"
  fi
  return 0
}

gate_card_check() {
  local hook="$1" id="$2" out rc=0
  GATE_CARD_BODY=""
  board_item_checklist "$hook" "$id" || return 2
  out="$(bash "$_GATES_BOARDS_SH" fleet gates card-body "$id" "$BOARD_ITEM_AC_COUNT" "$BOARD_ITEM_OPEN_COUNT" "$BOARD_ITEM_OPEN_AC" "$BOARD_ITEM_OPEN_DOD")" || rc=$?
  case "$rc" in
    0|1) [ -n "$out" ] && eval "$out"; return "$rc" ;;
  esac
  board_log "$hook" "the boards binary could not run, so the card gate could not read $id"
  return 2
}
