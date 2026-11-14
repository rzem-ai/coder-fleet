#!/usr/bin/env bash
# SessionStart: name the In Progress cards that look finished but never closed.
#
# A card reaches Done through a gate: a [board:<id>] task (TaskCompleted), or
# the push of a release tag whose subject names it (board-release-close.sh). A
# merge on GitHub fires neither, a project that does not release never pushes a
# tag, and a session can end between the merge or landing and the close. So at
# session start this hook lists every In Progress card that has at least one
# acceptance criterion, every criterion and Definition of Done item ticked, and
# at least one `ready to merge in PR #<n>` or `landed on <base> at <sha>`
# comment, every pull request so named merged and every commit so named on the
# trunk, local or origin's, which git answers (push base-only, CF-2.1).
# The list goes into the session's context, one line, so the lead closes those
# cards before other work. It reports and moves nothing.
#
# Quiet and fast: nothing printed when nothing qualifies, `gh` asked only about
# cards that are already fully ticked and name a pull request, each call bounded
# by CODER_FLEET_GH_TIMEOUT seconds (5) and none started after
# CODER_FLEET_MERGED_CARDS_BUDGET seconds (12), and the first failed or timed-out call
# ends the asking, since an offline machine fails them all. A missing `gh`, a
# failure, the board off: it logs why and prints nothing. It never exits
# non-zero and never blocks a session.

set -euo pipefail

HOOK=MergedCards
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/board.sh
. "$HOOK_DIR/lib/board.sh"

trap 'board_log "$HOOK" "unexpected error on line $LINENO; session continues"; exit 0' ERR

# shellcheck source=lib/fleet-config.sh
. "$HOOK_DIR/lib/fleet-config.sh"

input="$(cat)"

board_disabled && exit 0
command -v jq >/dev/null 2>&1 || exit 0

cwd="$(printf '%s' "$input" | jq -r '.cwd // ""' 2>/dev/null || printf '')"
[ -n "$cwd" ] || cwd="$PWD"
[ -d "$cwd" ] || exit 0
export BOARD_CWD="$cwd"

limit="${CODER_FLEET_GH_TIMEOUT:-5}"
case "$limit" in ''|*[!0-9]*|0) limit=5 ;; esac
# The whole hook, which hooks.json cuts off at 20 seconds: no gh call starts
# after this many have passed.
budget="${CODER_FLEET_MERGED_CARDS_BUDGET:-12}"
case "$budget" in ''|*[!0-9]*) budget=12 ;; esac

# on_trunk SHA -> 0 when the commit is on the trunk, local or origin's. The
# trunk is resolved once, on the first landed comment.
trunk_refs=""
trunk_read=""
on_trunk() {
  local ref root
  if [ -z "$trunk_read" ]; then
    trunk_read=1
    root="$(fleet_config_root "$cwd")" || root=""
    if [ -n "$root" ] && fleet_trunk "$root"; then
      trunk_refs="refs/heads/$FLEET_TRUNK refs/remotes/origin/$FLEET_TRUNK"
    else
      board_log "$HOOK" "no trunk, so no landed card is checked: ${FLEET_TRUNK_REASON:-no repository}"
    fi
  fi
  for ref in $trunk_refs; do
    git -C "$cwd" merge-base --is-ancestor "$1" "$ref" 2>/dev/null && return 0
  done
  return 1
}

# gh_pr_state N -> sets GH_STATE to the pull request's state (MERGED, OPEN,
# CLOSED), and GH_RC and GH_OUT to gh's exit status and output; returns 1 when
# gh failed or was cut off. Called directly, never in $(...), so the globals
# survive. Bounded like main-fast-forward.sh's fetch: macOS ships no
# timeout(1), so gh runs in its own process group beside a watchdog that kills
# the group.
gh_pr_state() {
  local out
  out="$(
    set -m
    cd "$cwd" && GH_PROMPT_DISABLED=1 gh pr view "$1" --json state --jq .state 2>&1 </dev/null &
    job=$!
    ( sleep "$limit"; kill -TERM -- "-$job" 2>/dev/null; sleep 1; kill -KILL -- "-$job" 2>/dev/null ) >/dev/null 2>&1 </dev/null &
    dog=$!
    set +m
    wait "$job"
    rc=$?
    kill -TERM -- "-$dog" 2>/dev/null
    kill -KILL -- "-$job" 2>/dev/null
    printf '\n%s' "$rc"
  )" || true
  GH_RC="${out##*$'\n'}"
  GH_OUT="${out%$'\n'*}"
  GH_STATE=""
  [ "$GH_RC" = 0 ] || return 1
  GH_STATE="$(printf '%s\n' "$GH_OUT" | awk 'NF {last = $0} END {print last}')"
}

col=""
for c in "In Progress" "Doing"; do
  rc=0
  board_status_listed "$HOOK" "$c" || rc=$?
  if [ "$rc" -eq 0 ]; then col="$c"; break; fi
  [ "$rc" -eq 1 ] || exit 0
done
[ -n "$col" ] || exit 0

ids="$(board_cli "$HOOK" task list --status "$col" --plain | awk 'NF {print $1}')" || exit 0
[ -n "$ids" ] || exit 0

have_gh=""
command -v gh >/dev/null 2>&1 && have_gh=1
found=""
for id in $ids; do
  out="$(board_cli "$HOOK" task view "$id" --json)" || continue
  # Fully ticked: at least one criterion, nothing unticked in either list.
  # Then every PR number a comment names after "ready to merge in PR #", and
  # every commit after "landed on <base> at ".
  refs="$(printf '%s' "$out" | jq -r '
      .task as $t
      | if (($t.acceptanceCriteria // []) | length) > 0
           and ([($t.acceptanceCriteria // [])[], ($t.definitionOfDone // [])[] | select(.checked != true)] | length) == 0
        then ([($t.comments // [])[] | .body // "" | scan("ready to merge in PR #([0-9]+)") | "pr " + .[0]]
              + [($t.comments // [])[] | .body // "" | scan("landed on [^ ]+ at ([0-9a-f]{7,40})") | "sha " + .[0]]) | unique | .[]
        else empty end' 2>/dev/null)" || refs=""
  [ -n "$refs" ] || continue
  prs="$(printf '%s\n' "$refs" | sed -n 's/^pr //p')"
  shas="$(printf '%s\n' "$refs" | sed -n 's/^sha //p')"
  merged=1
  named=""
  for sha in $shas; do
    if ! on_trunk "$sha"; then merged=""; break; fi
    named="${named:+$named, }landed $sha"
  done
  [ -n "$merged" ] || continue
  if [ -z "$prs" ]; then
    found="${found:+$found; }$id ($named)"
    continue
  fi
  if [ -z "$have_gh" ]; then
    board_log "$HOOK" "gh is not installed, so whether the pull requests of fully ticked In Progress cards have merged is not checked; nothing listed"
    exit 0
  fi
  if [ "$SECONDS" -ge "$budget" ]; then
    board_log "$HOOK" "the ${budget}s budget ran out at $id; the cards after it are not checked"
    break
  fi
  prnamed=""
  for pr in $prs; do
    if ! gh_pr_state "$pr"; then
      board_log "$HOOK" "gh pr view $pr for $id failed (exit ${GH_RC:-?}): $(printf '%s' "${GH_OUT:-}" | tr '\n' ' ' | cut -c1-200); gh is offline or unauthorised, so nothing is listed"
      exit 0
    fi
    if [ "$GH_STATE" != MERGED ]; then merged=""; break; fi
    prnamed="${prnamed:+$prnamed, }#$pr"
  done
  [ -n "$merged" ] || continue
  found="${found:+$found; }$id (PR $prnamed${named:+, $named})"
done

[ -n "$found" ] || exit 0
board_log "$HOOK" "fully ticked In Progress cards whose pull requests have merged or whose work landed: $found"
trap - ERR
jq -nc --arg m "Board: fully ticked and merged or landed, still In Progress: $found. A release tag whose subject names a card closes it when pushed; to close one now, complete a task whose subject carries [board:<id>], as /triage does." \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $m}}'
exit 0
