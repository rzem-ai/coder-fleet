#!/usr/bin/env bash
# PostToolUse on Bash: close the cards a release carries when its tag is pushed.
#
# A card reaches Done through a gate, never a bare status write. TaskCompleted
# is one way in, on a task whose subject carries [board:<id>]. This is the
# other: a release commit's subject ends with the cards it carries in brackets
# (`v0.55.0: ... [CF-201.2, CF-192.3]`), and once the lead has pushed that
# release's tag, every card the subject names which is fully ticked and short
# of Done is moved to Done, through the same card gate and test gate
# TaskCompleted runs (lib/gates.sh).
#
# What it recognises: a successful Bash call whose command runs `git ... push`
# with a version tag as one of its arguments, `vX.Y.Z` or `refs/tags/vX.Y.Z`,
# and not a delete. The tag must resolve in the checkout the call ran in, and
# the commit it names must have a subject starting with the tag. PostToolUse
# fires only after a successful tool call; a push that git itself rejected
# inside a command that still succeeded is caught by its own words on stderr.
#
# Once per tag: the first run for a tag in a repository claims it with a marker
# under the state directory, so a repeated push, or a second call naming the
# same tag, closes nothing twice.
#
# Per card, in order, each with a log line saying which and why:
#   not on this board, or unreadable   left alone
#   already Done                       left alone
#   any criterion or DoD item unticked, or no criteria   left alone
#   otherwise                          a candidate
# Then the test gate runs once, in the checkout the push ran in, for every
# candidate together. Red, or strict with no result: each candidate stays where
# it is, with a comment saying so. Pass, or lenient with no result as
# TaskCompleted allows: each candidate moves to Done with a comment naming the
# tag. A card that fails a gate stays where it is rather than going to Blocked,
# because nobody completed a task here to be refused.
#
# It never fails the tool call and never blocks: a summary of what it closed
# and refused goes back to the session as additionalContext.
set -euo pipefail

input="$(cat)"

# Every Bash call in every session runs this hook, so the cheap test comes
# before anything is sourced or parsed: no "push", nothing to do.
case "$input" in
  *push*) ;;
  *) exit 0 ;;
esac

HOOK=ReleaseClose
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/board.sh
. "$HOOK_DIR/lib/board.sh"
# shellcheck source=lib/gates.sh
. "$HOOK_DIR/lib/gates.sh"

trap 'board_log "$HOOK" "unexpected error on line $LINENO; nothing more closed"; exit 0' ERR

command -v jq >/dev/null 2>&1 || exit 0

command_text="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || printf '')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null || printf '')"
session_id="$(printf '%s' "$input" | jq -r '.session_id // ""' 2>/dev/null || printf '')"
push_err="$(printf '%s' "$input" | jq -r '(.tool_response.stderr // "") | tostring' 2>/dev/null || printf '')"

# release_tags COMMAND -> one tag per line, each a version tag the command
# pushes. The command is split into simple commands at ; & | and newlines,
# and a simple command counts when it holds a `git` word with a `push` word
# after it and no delete flag. Quotes around a word are dropped.
release_tags() {
  printf '%s\n' "$1" | tr ';&|' '\n\n\n' | while IFS= read -r seg; do
    local seen_git="" seen_push="" tags="" w
    # shellcheck disable=SC2086
    set -f; set -- $seg; set +f
    for w in "$@"; do
      w="${w#[\"\']}"; w="${w%[\"\']}"
      case "$w" in
        git|*/git) seen_git=1 ;;
        push) [ -n "$seen_git" ] && seen_push=1 ;;
        -d|--delete) [ -n "$seen_push" ] && { tags=""; seen_push=""; seen_git=""; break; } ;;
        *)
          if [ -n "$seen_push" ]; then
            w="${w#+}"; w="${w#refs/tags/}"
            if printf '%s' "$w" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then tags="$tags$w
"; fi
          fi ;;
      esac
    done
    [ -n "$tags" ] && printf '%s' "$tags"
  done | awk 'NF && !seen[$0]++'
}

tags="$(release_tags "$command_text" || true)"
[ -n "$tags" ] || exit 0

if board_disabled; then
  board_log "$HOOK" "the board is off, so the cards of $(printf '%s' "$tags" | tr '\n' ' ')are not closed"
  exit 0
fi

case "$push_err" in
  *"[rejected]"*|*"[remote rejected]"*|*"failed to push"*|*"fatal:"*)
    board_log "$HOOK" "the push of $(printf '%s' "$tags" | tr '\n' ' ')reported a failure, so no card is closed: $(printf '%s' "$push_err" | tr '\n' ' ' | cut -c1-200)"
    exit 0 ;;
esac

if [ -z "$cwd" ] || [ ! -d "$cwd" ]; then
  board_log "$HOOK" "a release tag was pushed but the event has no usable cwd, so no card is closed"
  exit 0
fi
work_dir="$(cd "$cwd" && pwd -P)"
export BOARD_CWD="$work_dir"
BOARD_RUN_SESSION="$session_id"

common_dir="$(git -C "$work_dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
if [ -z "$common_dir" ]; then
  board_log "$HOOK" "a release tag was pushed from $work_dir, which is not a git checkout, so no card is closed"
  exit 0
fi
repo_key="$(printf '%s' "$common_dir" | cksum | awk '{print $1}')"
marker_dir="$CODER_FLEET_STATE_DIR/releases/$repo_key"

summary=""
say() { summary="${summary}$*
"; board_log "$HOOK" "$*"; }

close_tag() {
  local tag="$1" commit subject list id status out rc
  commit="$(git -C "$work_dir" rev-parse --verify -q "refs/tags/$tag^{commit}" 2>/dev/null || true)"
  if [ -z "$commit" ]; then
    board_log "$HOOK" "$tag was pushed but does not resolve in $work_dir; no card is closed for it"
    return 0
  fi
  if ! ( umask 077; mkdir -p "$marker_dir" ) 2>/dev/null; then
    board_log "$HOOK" "could not create $marker_dir; no card is closed for $tag"
    return 0
  fi
  if ! ( set -C; printf '%s\n' "$commit" > "$marker_dir/$tag" ) 2>/dev/null; then
    board_log "$HOOK" "$tag has already been handled in this repository; nothing closed twice"
    return 0
  fi
  subject="$(git -C "$work_dir" log -1 --format=%s "$commit" 2>/dev/null || true)"
  case "$subject" in
    "$tag:"*|"$tag "*) ;;
    *)
      board_log "$HOOK" "$tag names commit ${commit:0:12}, whose subject does not start with $tag, so it is not read as a release: \"$(printf '%s' "$subject" | cut -c1-120)\""
      return 0 ;;
  esac
  list="$(printf '%s' "$subject" | sed -nE 's/.*\[([^]]*)\][[:space:]]*$/\1/p')"
  if [ -z "$list" ]; then
    say "Release $tag names no cards in its subject, so none is closed."
    return 0
  fi

  local candidates="" raw
  for raw in $(printf '%s' "$list" | tr ',' ' '); do
    if ! id="$(normalise_page_id "$raw")"; then
      say "$tag: \"$raw\" in the release subject is not a card id; left alone."
      continue
    fi
    out=""
    if ! out="$(board_cli "$HOOK" task view "$id" --json)"; then
      say "$tag: $id is not on this board, or could not be read; left alone."
      continue
    fi
    status="$(printf '%s' "$out" | jq -r '.task.status // ""' 2>/dev/null || true)"
    if [ -z "$status" ]; then
      say "$tag: $id answered with no status; left alone."
      continue
    fi
    if board_status_same "$status" "$BOARD_COL_DONE"; then
      say "$tag: $id is already Done; left alone."
      continue
    fi
    rc=0
    gate_card_check "$HOOK" "$id" || rc=$?
    if [ "$rc" -eq 1 ]; then
      say "$tag: $id is not fully ticked ($BOARD_ITEM_AC_COUNT acceptance criteria, $BOARD_ITEM_OPEN_COUNT unticked item(s)); left in \"$status\"."
      continue
    elif [ "$rc" -ne 0 ]; then
      say "$tag: the criteria and Definition of Done of $id could not be read; left in \"$status\"."
      continue
    fi
    candidates="$candidates $id"
  done
  [ -n "$candidates" ] || return 0

  gate_test_verdict "$HOOK" "$work_dir"
  BOARD_RUN_STATUS="test gate: $GATE_VERDICT"
  local refuse=""
  case "$GATE_VERDICT" in
    fail) refuse="the test gate failed" ;;
    unknown)
      if [ "$CODER_FLEET_TEST_GATE" = "strict" ]; then
        refuse="no test result was available and CODER_FLEET_TEST_GATE is strict"
        GATE_DETAIL="Set CODER_FLEET_TEST_COMMAND, or write the result to $GATE_STATUS_FILE with pass or fail on the first line."
      else
        board_log "$HOOK" "no test gate configured (no CODER_FLEET_TEST_COMMAND, no usable $GATE_STATUS_FILE); closing without a test result. Set CODER_FLEET_TEST_GATE=strict to refuse instead."
      fi ;;
  esac

  for id in $candidates; do
    if [ -n "$refuse" ]; then
      say "$tag: $id is fully ticked, but $refuse; left where it is."
      board_comment "$HOOK" "$id" "$(printf 'Not closed on release %s: %s, so the card stays where it is.\n\n%s\n' "$tag" "$refuse" "$GATE_DETAIL")"
    else
      say "$tag: $id is fully ticked and the test gate allows it; moved to Done."
      board_write "$HOOK" "$id" "$BOARD_COL_DONE" "$(printf 'Done. Closed on release %s, whose commit %s names this card, after the card gate and the test gate.\n' "$tag" "${commit:0:12}")"
    fi
  done
}

while IFS= read -r tag; do
  [ -n "$tag" ] || continue
  close_tag "$tag" || true
done <<EOF
$tags
EOF

if [ -n "$summary" ]; then
  trap - ERR
  jq -nc --arg m "Release close: $summary" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $m}}'
fi
exit 0
