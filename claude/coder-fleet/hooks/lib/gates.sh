# shellcheck shell=bash
# The two gates a card meets on its way to Done, shared by the two hooks that
# move one there: board-task-completed.sh on a [board:<id>] task, and
# board-release-close.sh on a release tag push. Sourced after lib/board.sh,
# never executed. Each function decides and logs; what a refusal does to the
# card - Blocked for a task, left where it is for a release - is the caller's.
#
# Written for bash 3.2, like board.sh. Every step that can fail runs in a
# condition, so a caller under errexit sees a return code rather than dying.

CODER_FLEET_TEST_GATE="${CODER_FLEET_TEST_GATE:-lenient}"
CODER_FLEET_TEST_COMMAND="${CODER_FLEET_TEST_COMMAND:-}"
CODER_FLEET_TEST_TIMEOUT="${CODER_FLEET_TEST_TIMEOUT:-300}"
CODER_FLEET_TEST_STATUS_MAX_AGE="${CODER_FLEET_TEST_STATUS_MAX_AGE:-3600}"

gate_file_mtime() {
  stat -c '%Y' "$1" 2>/dev/null || stat -f '%m' "$1" 2>/dev/null || printf '0'
}

# Is any file in the work tree newer than the marker? An age window alone
# cannot answer "did this pass happen after the code it is approving?" - inside
# a one-hour lifetime you can edit a file and the old pass still approves it.
# Comparing against the tree does answer it, without needing a trusted runner to
# stamp a commit into the marker. -quit stops at the first hit, so this stays
# cheap even on a large checkout.
gate_tree_changed_since() {
  # $1 marker file, $2 work dir
  [ -n "$(find "$2" \
      \( -name .git -o -name node_modules -o -name .claude -o -name dist \
         -o -name build -o -name target -o -name .venv -o -name __pycache__ \) -prune -o \
      -type f -newer "$1" -print -quit 2>/dev/null)" ]
}

# gate_test_verdict HOOK WORK_DIR
# The test gate. Sets GATE_VERDICT to pass, fail or unknown, GATE_DETAIL to what
# a comment says about it, and GATE_STATUS_FILE to the marker file it read or
# would have read. "Tests pass" is not something the harness tells us, so it is
# resolved in order: a configured test command, then a test-status marker file,
# then unknown, which the caller settles by the gate mode. See hooks/README.md,
# "The test gate".
gate_test_verdict() {
  local hook="$1" work_dir="$2" runner="" out rc age word
  GATE_VERDICT=""
  GATE_DETAIL=""

  if [ -n "$CODER_FLEET_TEST_COMMAND" ]; then
    if [ "$CODER_FLEET_TEST_TIMEOUT" -gt 0 ] 2>/dev/null; then
      if command -v timeout >/dev/null 2>&1; then
        runner="timeout $CODER_FLEET_TEST_TIMEOUT"
      elif command -v gtimeout >/dev/null 2>&1; then
        runner="gtimeout $CODER_FLEET_TEST_TIMEOUT"
      fi
    fi
    board_log "$hook" "running the test command in $work_dir: $CODER_FLEET_TEST_COMMAND"
    # Run it as the condition of an if, not after `set +e`: the ERR trap fires on
    # any failing command regardless of errexit, and a failing test suite is the
    # expected case here, not an unexpected error.
    # bash -c, not eval of "$runner $CMD": prefixing timeout as text onto the
    # command breaks anything compound. "cd app && npm test" became
    # "timeout 300 cd app && npm test", which fails on `timeout cd` and never
    # runs the suite - and the gate then blocks the task for tests that were
    # never executed. Running the command as one shell string keeps pipelines,
    # && chains and loops working, with or without timeout present.
    if out="$(cd "$work_dir" && $runner bash -c "$CODER_FLEET_TEST_COMMAND" 2>&1)"; then
      rc=0
    else
      rc=$?
    fi
    if [ "$rc" -eq 0 ]; then
      GATE_VERDICT=pass
      GATE_DETAIL="\`$CODER_FLEET_TEST_COMMAND\` passed."
    else
      GATE_VERDICT=fail
      GATE_DETAIL="$(printf '`%s` exited %s.\n\nLast lines of output:\n\n%s' \
        "$CODER_FLEET_TEST_COMMAND" "$rc" "$(printf '%s\n' "$out" | tail -15 | cut -c1-200)")"
    fi
  fi

  GATE_STATUS_FILE="${CODER_FLEET_TEST_STATUS_FILE:-$work_dir/.claude/test-status}"
  if [ -z "$GATE_VERDICT" ] && [ -f "$GATE_STATUS_FILE" ]; then
    age=$(( $(date +%s) - $(gate_file_mtime "$GATE_STATUS_FILE") ))
    word="$(head -1 "$GATE_STATUS_FILE" | tr -d '\r' | awk '{print tolower($1)}')"
    case "$word" in
      # A failure is honoured whatever its age. Trust here is asymmetric on
      # purpose: a stale "fail" can only block a completion, which is safe, while
      # a stale "pass" approves code it never saw.
      fail|failed|red)
        GATE_VERDICT=fail
        GATE_DETAIL="$(printf '%s reports a failure.\n\n%s' "$GATE_STATUS_FILE" "$(sed -n '2,16p' "$GATE_STATUS_FILE" | cut -c1-200)")" ;;
      pass|passed|ok|green)
        if [ "$age" -gt "$CODER_FLEET_TEST_STATUS_MAX_AGE" ]; then
          board_log "$hook" "$GATE_STATUS_FILE reports a pass but is ${age}s old (limit ${CODER_FLEET_TEST_STATUS_MAX_AGE}s); treating it as stale"
        elif gate_tree_changed_since "$GATE_STATUS_FILE" "$work_dir"; then
          board_log "$hook" "$GATE_STATUS_FILE reports a pass, but $work_dir has been modified since it was written, so it is not evidence about the current code; ignoring it"
        else
          GATE_VERDICT=pass; GATE_DETAIL="$GATE_STATUS_FILE reports a pass, and nothing in $work_dir has changed since."
        fi ;;
      *)
        board_log "$hook" "$GATE_STATUS_FILE does not start with pass or fail (found \"$word\"); ignoring it" ;;
    esac
  fi

  [ -n "$GATE_VERDICT" ] || GATE_VERDICT=unknown
  return 0
}

# gate_card_check HOOK ID
# The card gate. Tests passing says the code works; it does not say the issue
# is finished. So a card reaches Done only when it has at least one acceptance
# criterion and every criterion and Definition of Done item is ticked. The gate
# reads ticks and nothing else: whether a tick carries its evidence, or
# `not applicable: <reason>` for a DoD item that does not apply, is the lead's
# to get right and the reviewer's to check.
#
# Returns 0 when the card is finished, 1 when it is not, with GATE_CARD_BODY
# saying what is missing in card markdown, and 2 when the card could not be
# read, which board_item_checklist has logged. The BOARD_ITEM_* counts are set
# on 0 and 1. The caller skips a disabled board itself, so it can say why.
gate_card_check() {
  local hook="$1" id="$2"
  GATE_CARD_BODY=""
  board_item_checklist "$hook" "$id" || return 2
  if [ "$BOARD_ITEM_AC_COUNT" -gt 0 ] && [ "$BOARD_ITEM_OPEN_COUNT" -eq 0 ]; then
    return 0
  fi
  if [ "$BOARD_ITEM_AC_COUNT" -eq 0 ]; then
    GATE_CARD_BODY="$id has no acceptance criteria, so there is nothing to say it is finished. Add them from the spec, or from the brief if there is none."
  fi
  if [ -n "$BOARD_ITEM_OPEN_AC" ]; then
    GATE_CARD_BODY="${GATE_CARD_BODY:+$GATE_CARD_BODY

}$(printf 'Acceptance criteria not ticked:\n\n%s' "$BOARD_ITEM_OPEN_AC")"
  fi
  if [ -n "$BOARD_ITEM_OPEN_DOD" ]; then
    GATE_CARD_BODY="${GATE_CARD_BODY:+$GATE_CARD_BODY

}$(printf 'Definition of Done items not ticked:\n\n%s' "$BOARD_ITEM_OPEN_DOD")"
  fi
  # The advice follows a list: a card with no criteria and nothing unticked has
  # nothing to tick. The backticks are markdown for the card, not a
  # substitution.
  if [ -n "$BOARD_ITEM_OPEN_AC" ] || [ -n "$BOARD_ITEM_OPEN_DOD" ]; then
    # shellcheck disable=SC2016
    GATE_CARD_BODY="$(printf '%s\n\nTick each one with its evidence in a comment. A Definition of Done item that does not apply is ticked, with `not applicable: <reason>` in the comment.' "$GATE_CARD_BODY")"
  fi
  return 1
}
