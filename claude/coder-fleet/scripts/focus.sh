#!/usr/bin/env bash
# Focus this checkout on one GitHub issue, so the board hooks label that issue
# as agents start and stop. The lead runs it before the first spawn on an
# issue, and /work runs it for the human.
#
#   focus.sh <ref>    focus on an issue: #12, 12 or the issue's URL
#   focus.sh --show   print the focused issue, or nothing
#   focus.sh --clear  forget the focus
#
# The focus is one line in <git common dir>/coder-fleet/focus: the main
# checkout's .git, shared by every linked worktree of it and never committed.
# Focusing checks the issue with `gh issue view` and prints `#N <title>`; it
# refuses an issue gh cannot find, and a closed one, since a start binds nothing
# to a closed issue. With gh missing or signed out it says so and focuses
# anyway, because the hooks read the file, not gh.
#
# Exit 0 on success, 1 on a refusal (bad ref, issue not found or closed), 2 on
# a usage error or no repository here.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../hooks/lib/board.sh
. "$HERE/../hooks/lib/board.sh"

BOARD_LOG_FILE=/dev/null
export BOARD_CWD="${BOARD_CWD:-$PWD}"

usage() {
  printf 'usage: focus.sh <#n | n | issue url> | --show | --clear\n' >&2
  exit 2
}

[ $# -eq 1 ] || usage

file="$(board_focus_file)" || { printf 'focus: not inside a git repository\n' >&2; exit 2; }

case "$1" in
  --show)
    [ -f "$file" ] && head -n 1 "$file"
    exit 0
    ;;
  --clear)
    rm -f "$file"
    printf 'focus cleared\n'
    exit 0
    ;;
  -*)
    usage
    ;;
esac

ref="$(normalise_page_id "$1")" || { printf 'focus: %s is not an issue ref (#12, 12 or the issue URL)\n' "$1" >&2; exit 1; }

title=""
if command -v "$BOARD_GH" >/dev/null 2>&1; then
  if out="$(BOARD_CLI_QUIET=1 board_cli focus issue view "$(issue_number "$ref")" --json number,title,state)"; then
    if [ "$(printf '%s' "$out" | jq -r '.state // "" | ascii_upcase')" = "CLOSED" ]; then
      printf 'focus: %s is closed, so a spawn would bind nothing to it. Reopen it first, or focus the issue the work is on.\n' "$ref" >&2
      exit 1
    fi
    title="$(printf '%s' "$out" | jq -r '.title // ""')"
  else
    case "$BOARD_CLI_ERR" in
      *"Could not resolve to an issue"*|*"not found"*)
        printf 'focus: no issue %s in this repository\n' "$ref" >&2
        exit 1
        ;;
      *)
        printf 'focus: gh could not check %s (%s); focusing anyway, since the hooks read the file\n' "$ref" "$(printf '%s' "$BOARD_CLI_ERR" | head -n 1 | cut -c1-200)" >&2
        ;;
    esac
  fi
else
  printf 'focus: gh is not installed, so %s was not checked; focusing anyway, since the hooks read the file. The hooks need gh to label the issue.\n' "$ref" >&2
fi

( umask 077; mkdir -p "$(dirname "$file")" ) || { printf 'focus: could not create %s\n' "$(dirname "$file")" >&2; exit 2; }
printf '%s\n' "$ref" > "$file"
printf '%s%s\n' "$ref" "${title:+ $title}"
