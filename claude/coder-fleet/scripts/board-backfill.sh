#!/usr/bin/env bash
#
# board-backfill.sh - give every open item on this repository's board the
# Definition of Done defaults from .boards/config.yml, and give every open item
# with no acceptance criteria one provisional criterion. Run it once, when a
# board first gets defaults; it is idempotent, so a second run changes nothing.
# A board with no definition_of_done still gets the provisional criteria: the
# script says it skipped the defaults, with a no-defaults line, and exits 0.
#
# Open means listed by `board task list` with a status other than Done. Done
# is BOARD_COL_DONE, else "Done", compared ignoring case and spaces, and it
# must match one of the board's own statuses, or the script refuses: a value
# left over from another project's board would make it edit this board's Done
# items. Items in .boards/completed/, drafts and archived items are not
# listed, so they are left alone; Done items are reported and left alone. No
# closed item's file is touched. A default is added only when no Definition of
# Done item on the card, ticked or not, has the same trimmed text. Each item
# costs one `task view` and at most one `task edit`.
#
# Writes run with CODER_FLEET_BOARD_NO_COMMIT=1 and nothing is committed; the
# command is printed at the end. Until it runs the edits sit uncommitted in
# .boards/, and any other board write made meanwhile, by a hook or another
# session with auto_commit on, sweeps them into its own commit
# (`git add -- .boards`). So run this with no other fleet session open, and
# commit straight after. Move every merged item to Done first, or it gives
# them defaults too.
#
# The board is reached through BOARD_SHIM, else the plugin's board/board.sh,
# and found from the working directory as every board call finds it
# (CODER_FLEET_BOARD_ROOT overrides). It needs a binary with `config show`
# and `task edit --dod`; an older one is refused, naming the plugin's
# board/build.sh and BOARD_SHIM as the two ways round it.
#
# Output, one tab-separated line per verdict, would- prefixed under --dry-run:
#   no-defaults             the config has no definition_of_done; criteria only
#   added <id> <n>          n defaults added          (would-add)
#   provisional <id>        a provisional criterion   (would-provision)
#   unchanged <id>
#   skipped <id> done
#   failed <id> <first line of the board's stderr>
# Exit 0 when it ran, 1 if any item failed, 2 on a usage error, when the
# config cannot be read, or when the Done status is not one of the board's.
#
# Usage:  board-backfill.sh [--dry-run]

set -uo pipefail
export LC_ALL=C

usage() { printf 'usage: board-backfill.sh [--dry-run]\n' >&2; exit 2; }

DRY=0
case $# in
    0) ;;
    1) if [ "$1" = "--dry-run" ]; then DRY=1; else usage; fi ;;
    *) usage ;;
esac

PROVISIONAL='Provisional: the spec settles what done means here, and its criteria replace this one'

here=$(cd "$(dirname "$0")" && pwd)
BOARD_SHIM="${BOARD_SHIM:-$here/../board/board.sh}"
DONE_KEY=$(printf '%s' "${BOARD_COL_DONE:-Done}" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')

command -v jq >/dev/null 2>&1 || { printf 'board-backfill.sh: needs jq on PATH\n' >&2; exit 2; }

emit() { local IFS=$'\t'; printf '%s\n' "$*"; }
first_line() { local s=${1%%$'\n'*}; printf '%s' "${s%$'\r'}"; }
ERR=$(mktemp "${TMPDIR:-/tmp}/board-backfill.XXXXXX") || exit 2
trap 'rm -f "$ERR"' EXIT
board() { CODER_FLEET_BOARD_NO_COMMIT=1 "$BOARD_SHIM" "$@" 2>"$ERR"; }

if ! config=$(board config show --json) || ! jq -e '.kind == "config"' >/dev/null 2>&1 <<<"$config"; then
    printf 'board-backfill.sh: could not read the board config: %s\n' "$(first_line "$(cat "$ERR")")" >&2
    printf 'A board binary built before `config show` cannot run this. Point BOARD_SHIM at a wrapper that runs `bun <plugin>/board/src/cli.ts "$@"`, or rebuild the binary with `<plugin>/board/build.sh ~/.local/bin/board`.\n' >&2
    exit 2
fi
done_found=0
while IFS= read -r configured; do
    [ "$(printf '%s' "$configured" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" = "$DONE_KEY" ] && done_found=1
done < <(jq -r '.config.statuses[]? | strings' <<<"$config")
if [ "$done_found" -eq 0 ]; then
    printf 'board-backfill.sh: the Done status "%s" (BOARD_COL_DONE, else Done) is not one of this board'"'"'s statuses: %s\n' \
        "${BOARD_COL_DONE:-Done}" "$(jq -r '[.config.statuses[]? | strings] | join(", ")' <<<"$config")" >&2
    exit 2
fi
defaults=$(jq -c '[.config.definitionOfDone[]? | select(type == "string") | gsub("^\\s+|\\s+$"; "") | select(length > 0)]' <<<"$config")
if [ "$(jq 'length' <<<"$defaults")" -eq 0 ]; then
    emit no-defaults
    printf 'board-backfill.sh: the config has no definition_of_done defaults, so only provisional criteria are added\n' >&2
fi

if ! listed=$(board task list --json) || ! jq -e '.kind == "task-list"' >/dev/null 2>&1 <<<"$listed"; then
    printf 'board-backfill.sh: could not list the board: %s\n' "$(first_line "$(cat "$ERR")")" >&2
    exit 2
fi

failures=0
wrote=0
while IFS=$'\t' read -r id status; do
    [ -n "$id" ] || continue
    if [ "$(printf '%s' "$status" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')" = "$DONE_KEY" ]; then
        emit skipped "$id" done
        continue
    fi
    if ! view=$(board task view "$id" --json) || ! jq -e '.kind == "task-view"' >/dev/null 2>&1 <<<"$view"; then
        emit failed "$id" "$(first_line "$(cat "$ERR")")"
        failures=$((failures + 1))
        continue
    fi
    missing=()
    while IFS= read -r item; do
        [ -n "$item" ] && missing+=("$item")
    done < <(jq -r --argjson want "$defaults" \
        '[.task.definitionOfDone[]?.text | gsub("^\\s+|\\s+$"; "")] as $have | $want[] | . as $w | select(any($have[]; . == $w) | not)' <<<"$view")
    criteria=$(jq '[.task.acceptanceCriteria[]?] | length' <<<"$view")

    if [ "${#missing[@]}" -eq 0 ] && [ "$criteria" -gt 0 ]; then
        emit unchanged "$id"
        continue
    fi
    if [ "$DRY" -eq 1 ]; then
        [ "${#missing[@]}" -gt 0 ] && emit would-add "$id" "${#missing[@]}"
        [ "$criteria" -eq 0 ] && emit would-provision "$id"
        continue
    fi
    args=()
    for item in ${missing[@]+"${missing[@]}"}; do args+=(--dod "$item"); done
    [ "$criteria" -eq 0 ] && args+=(--ac "$PROVISIONAL")
    if ! board task edit "$id" "${args[@]}" >/dev/null; then
        emit failed "$id" "$(first_line "$(cat "$ERR")")"
        failures=$((failures + 1))
        continue
    fi
    wrote=1
    [ "${#missing[@]}" -gt 0 ] && emit added "$id" "${#missing[@]}"
    [ "$criteria" -eq 0 ] && emit provisional "$id"
done < <(jq -r '.tasks[] | [.id, .status] | @tsv' <<<"$listed")

if [ "$wrote" -eq 1 ]; then
    printf 'Nothing is committed. From the repository root: git add -- .boards && git commit -m "Backfill the Definition of Done defaults and provisional criteria"\n' >&2
fi
[ "$failures" -eq 0 ] || exit 1
exit 0
