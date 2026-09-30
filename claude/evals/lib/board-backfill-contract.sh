#!/usr/bin/env bash
#
# board-backfill-contract.sh - scripts/board-backfill.sh gives every open item
# the board's Definition of Done defaults and, where it has no acceptance
# criteria, one provisional criterion, and leaves every closed item's file
# byte-identical (CF-24 criterion 12).
#
# Every case runs the real script against a fixture board under a mktemp root,
# through the board's own CLI run from source by bun, never a built binary and
# never this repository's .boards/. The fixture is a git repository with
# auto_commit on, so a write the script forgot to keep uncommitted shows up as
# a commit. Items:
#   BD-1  To Do, no criteria, no Definition of Done
#   BD-2  In Progress, one criterion, the first default already on it
#   BD-3  Done, no criteria
#   BD-4  in .boards/completed/, no criteria
# Needs bun and jq; prints a skip line and exits 0 without either.
#
# Usage:  claude/evals/lib/board-backfill-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
SCRIPT="$PLUGIN_ROOT/scripts/board-backfill.sh"
CLI="$PLUGIN_ROOT/board/src/cli.ts"

for tool in bun jq; do
    command -v "$tool" >/dev/null 2>&1 || { printf 'board-backfill-contract: skipped (%s is not on PATH)\n' "$tool"; exit 0; }
done

# A fresh clone has no node_modules, and the CLI cannot start without them;
# check-all.sh's board step installs them the same way.
[ -d "$PLUGIN_ROOT/board/node_modules" ] || (cd "$PLUGIN_ROOT/board" && bun install --frozen-lockfile >/dev/null) || {
    printf 'board-backfill-contract: bun install failed in %s/board\n' "$PLUGIN_ROOT"; exit 1; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/board-backfill-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
trap 'rm -rf "$TMP"' EXIT

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
unset CODER_FLEET_BOARD_NO_COMMIT BOARD_COL_DONE
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

PROVISIONAL='Provisional: the spec settles what done means here, and its criteria replace this one'

# The shim the script calls: the board from source. A second one fails every
# `config` call, as a binary built before `config show` existed does, and a
# third fails every `task edit`.
SHIM="$TMP/board-shim.sh"
printf '#!/bin/sh\nexec bun "%s" "$@"\n' "$CLI" > "$SHIM"
OLD_SHIM="$TMP/old-shim.sh"
printf '#!/bin/sh\n[ "$1" = config ] && { echo "error: unknown command config" >&2; exit 1; }\nexec bun "%s" "$@"\n' "$CLI" > "$OLD_SHIM"
EDITLESS_SHIM="$TMP/editless-shim.sh"
printf '#!/bin/sh\n[ "$1 $2" = "task edit" ] && { echo "edit refused" >&2; exit 1; }\nexec bun "%s" "$@"\n' "$CLI" > "$EDITLESS_SHIM"
chmod +x "$SHIM" "$OLD_SHIM" "$EDITLESS_SHIM"

PASSED=0
FAILED=0

check() {
    # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        PASSED=$((PASSED + 1))
        [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$label"
    else
        FAILED=$((FAILED + 1))
        printf '  FAIL  %s\n' "$label"
    fi
    return 0
}

absent() { ! "$@"; }
# A negative or unchanged-state check means something only if the script ran
# and exited as the case expects, so these carry the expected exit code.
ran() { local want="$1"; shift; [ "$RC" -eq "$want" ] && "$@"; }

cli() { CODER_FLEET_BOARD_ROOT="$ROOT" CODER_FLEET_BOARD_NO_COMMIT=1 bun "$CLI" "$@"; }

make_board() {
    # $1 directory, $2 definition_of_done YAML lines (may be empty)
    ROOT="$1"
    mkdir -p "$ROOT/.boards/tasks" "$ROOT/.boards/completed"
    {
        printf 'project_name: "fixture"\ntask_prefix: "BD"\n'
        printf 'statuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]\n'
        printf 'default_status: "To Do"\n'
        printf 'auto_commit: true\n'
    } > "$ROOT/.boards/config.yml"
    git -C "$ROOT" init -q -b main
    cli task create "Open, no criteria" >/dev/null
    cli task create "Open, criteria, first default" --ac "It works" -s "In Progress" >/dev/null
    cli task edit BD-2 --dod "Checks pass" >/dev/null
    cli task create "Closed in place" -s Done >/dev/null
    cli task create "Closed and filed" >/dev/null
    mv "$ROOT"/.boards/tasks/bd-4\ -\ *.md "$ROOT/.boards/completed/"
    # The defaults arrive after the items, as they do on a board that predates them.
    printf '%s' "$2" >> "$ROOT/.boards/config.yml"
    git -C "$ROOT" add -A
    git -C "$ROOT" commit -q -m base
}

OUT=""
ERR=""
RC=0
backfill() {
    # $1 shim, rest: script arguments. Sets OUT, ERR and RC.
    local shim="$1"; shift
    OUT=$(CODER_FLEET_BOARD_ROOT="$ROOT" BOARD_SHIM="$shim" bash "$SCRIPT" "$@" 2>"$TMP/err")
    RC=$?
    ERR=$(cat "$TMP/err")
}

has_line() { printf '%s\n' "$OUT" | grep -qxF -- "$1"; }
err_has() { printf '%s\n' "$ERR" | grep -qF -- "$1"; }
line() { local IFS=$'\t'; printf '%s' "$*"; }
dod_of() { cli task view "$1" --json | jq -c '[.task.definitionOfDone[].text]'; }
ac_of() { cli task view "$1" --json | jq -c '[.task.acceptanceCriteria[] | [.text, .checked]]'; }
tree_sum() { (cd "$ROOT/.boards" && find . -type f -name '*.md' -print0 | LC_ALL=C sort -z | xargs -0 cksum); }
closed_sum() { cksum "$ROOT"/.boards/tasks/bd-3\ -\ *.md "$ROOT"/.boards/completed/bd-4\ -\ *.md; }
commits() { git -C "$ROOT" rev-list --count HEAD; }

TWO_DEFAULTS=$'definition_of_done:\n  - "Checks pass"\n  - "Docs updated"\n'

# --- a run -------------------------------------------------------------------

printf 'A run over the fixture\n'
make_board "$TMP/b1" "$TWO_DEFAULTS"
CLOSED_BEFORE=$(closed_sum)
COMMITS_BEFORE=$(commits)
backfill "$SHIM"
check 'B01 exits 0'                                    test "$RC" -eq 0
check 'B02 BD-1 gets both defaults, in order'          ran 0 test "$(dod_of BD-1)" = '["Checks pass","Docs updated"]'
check 'B02 reported: added BD-1 2'                     has_line "$(line added BD-1 2)"
check 'B03 BD-2 gets only the default it lacked'       test "$(dod_of BD-2)" = '["Checks pass","Docs updated"]'
check 'B03 reported: added BD-2 1'                     has_line "$(line added BD-2 1)"
check 'B04 BD-1 gets one unticked provisional criterion' test "$(ac_of BD-1)" = "$(jq -cn --arg p "$PROVISIONAL" '[[$p,false]]')"
check 'B04 reported: provisional BD-1'                 has_line "$(line provisional BD-1)"
check 'B05 BD-2 keeps its own criterion alone'         test "$(ac_of BD-2)" = '[["It works",false]]'
check 'B05 and is not reported provisional'            ran 0 absent has_line "$(line provisional BD-2)"
check 'B06 the Done item is reported skipped'          has_line "$(line skipped BD-3 done)"
check 'B07 the closed files are byte-identical'        ran 0 test "$(closed_sum)" = "$CLOSED_BEFORE"
check 'B08 the completed item is never named'          ran 0 absent grep -q 'BD-4' <<<"$OUT"
check 'B09 nothing is committed'                       ran 0 test "$(commits)" = "$COMMITS_BEFORE"
check 'B09 the commit command is printed'              err_has 'git add .boards'

printf '\nA second run\n'
SUM_AFTER_FIRST=$(tree_sum)
backfill "$SHIM"
check 'B10 exits 0'                                    test "$RC" -eq 0
check 'B10 reports BD-1 unchanged'                     has_line "$(line unchanged BD-1)"
check 'B10 reports BD-2 unchanged'                     has_line "$(line unchanged BD-2)"
check 'B10 adds nothing'                               ran 0 absent grep -qE '^(added|provisional)' <<<"$OUT"
check 'B10 changes no file'                            ran 0 test "$(tree_sum)" = "$SUM_AFTER_FIRST"
check 'B10 prints no commit command'                   ran 0 absent err_has 'git add .boards'

# --- dry run -------------------------------------------------------------------

printf '\nA dry run\n'
make_board "$TMP/b2" "$TWO_DEFAULTS"
SUM_BEFORE=$(tree_sum)
backfill "$SHIM" --dry-run
check 'B11 exits 0'                                    test "$RC" -eq 0
check 'B11 says what it would add'                     has_line "$(line would-add BD-1 2)"
check 'B11 and which would get a provisional criterion' has_line "$(line would-provision BD-1)"
check 'B11 and what it would add to BD-2'              has_line "$(line would-add BD-2 1)"
check 'B11 writes nothing'                             ran 0 test "$(tree_sum)" = "$SUM_BEFORE"

# --- refusals ------------------------------------------------------------------

printf '\nRefusals\n'
make_board "$TMP/b3" ""
SUM_BEFORE=$(tree_sum)
backfill "$SHIM"
check 'B12 no defaults in the config exits 2'          test "$RC" -eq 2
check 'B12 and says so'                                err_has 'definition_of_done'
check 'B12 and writes nothing'                         ran 2 test "$(tree_sum)" = "$SUM_BEFORE"

make_board "$TMP/b4" "$TWO_DEFAULTS"
SUM_BEFORE=$(tree_sum)
backfill "$OLD_SHIM"
check 'B13 a binary without config show exits 2'       test "$RC" -eq 2
check 'B13 and says to rebuild it'                     err_has 'install-home.sh'
check 'B13 and writes nothing'                         ran 2 test "$(tree_sum)" = "$SUM_BEFORE"

backfill "$EDITLESS_SHIM"
check 'B14 a failed edit exits 1'                      test "$RC" -eq 1
check 'B14 and is reported for the item'               has_line "$(line failed BD-1 'edit refused')"
check 'B14 and the other items are still tried'        has_line "$(line failed BD-2 'edit refused')"

backfill "$SHIM" --bogus
check 'B15 an unknown argument exits 2'                test "$RC" -eq 2

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'board-backfill.sh can miss an open item, touch a closed one, or commit behind the human.\n'
    exit 1
fi
printf 'board-backfill.sh gives open items the defaults and provisional criteria, and leaves closed items alone.\n'
