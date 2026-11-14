#!/usr/bin/env bash
#
# fleet-exclude-contract.sh - scripts/fleet-exclude.py, which /init runs to keep
# the fleet's memory, installed rules and config out of a
# project's history through the common git dir's info/exclude (CF-201).
#
# Case names, by the card's criteria:
#   1 fresh        X01-X04 every entry written once, under one header, to the
#                  common git dir's info/exclude; a second run adds nothing;
#                  no .gitignore written; settings.json and AGENTS.md untouched
#   3 worktrees    W01 the main checkout and a linked worktree honour it
#   2 migration    M01-M09 status names what is tracked and the old .gitignore
#                  lines; migrate untracks them in one commit, removes those
#                  lines, keeps every file on disk, then writes the exclude; a second migrate does nothing
#   2 refusals     R01-R04 write refuses while anything is tracked (a declined
#                  migration is half set up and changes nothing); migrate
#                  refuses other staged changes and a linked worktree
#
# Every case runs the real script in fixture repositories under this test's
# own temporary directory, never in this checkout.
#
# Usage:  claude/evals/lib/fleet-exclude-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
SCRIPT="$PLUGIN_ROOT/scripts/fleet-exclude.py"

command -v python3 >/dev/null 2>&1 || { printf 'fleet-exclude-contract: python3 is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/fleet-exclude-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
trap 'rm -rf "$TMP"' EXIT

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t

PASSED=0
FAILED=0
ok() {
    PASSED=$((PASSED + 1))
    [ "$VERBOSE" -eq 1 ] && printf '  ok    %s\n' "$1"
    return 0
}
bad() {
    FAILED=$((FAILED + 1))
    printf '  FAIL  %s\n' "$1"
    [ -n "${2:-}" ] && printf '%s\n' "$2" | sed 's/^/        /' | head -n 12
    return 0
}
expect() { # $1 label, rest: command that succeeds when the assertion holds
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then ok "$label"; else bad "$label" "$(cat "$OUT" 2>/dev/null)"; fi
}

OUT="$TMP/out"
RC=0
fx() { # runs the script from $P with its arguments; sets RC, writes $OUT
    (cd "$P" && python3 -I "$SCRIPT" "$@") > "$OUT" 2>&1
    RC=$?
}
rc_is()   { [ "$RC" -eq "$1" ]; }
out_has() { grep -qF -- "$1" "$OUT"; }

# Every entry the script must write, one per line, as it writes it.
ENTRIES='/.claude/agent-memory/coder-fleet-*/
/.claude/rules/glossary.md
/.claude/coder-fleet.json'

N=0
project() { # a fresh repository with one commit: README, AGENTS.md and .claude/settings.json
    N=$((N + 1))
    P="$TMP/p$N"
    git init -q -b main "$P"
    printf 'product\n' > "$P/README.md"
    printf '# P\n' > "$P/AGENTS.md"
    mkdir -p "$P/.claude"
    printf '{"agent": "coder-fleet:lead"}\n' > "$P/.claude/settings.json"
    git -C "$P" add -A
    git -C "$P" commit -q -m base
}
exclude_file() { printf '%s/.git/info/exclude' "$P"; }
every_entry_once() {
    local e
    while IFS= read -r e; do
        [ "$(grep -cxF -- "$e" "$(exclude_file)")" = 1 ] || return 1
    done <<EOF
$ENTRIES
EOF
}
ignored_from() { # $1 checkout: every entry's path is ignored there, by the common info/exclude
    local co="$1" path src
    for path in .claude/agent-memory/coder-fleet-coder/x .claude/rules/glossary.md .claude/coder-fleet.json; do
        src=$(git -C "$co" check-ignore -v --no-index -- "$path" 2>/dev/null) || return 1
        src=${src%%:*}
        case "$src" in /*) ;; *) src="$co/$src" ;; esac
        [ "$(cd "$(dirname "$src")" && pwd -P)/$(basename "$src")" = "$P/.git/info/exclude" ] || return 1
    done
}
other_memory_not_ignored() { ! git -C "$P" check-ignore -q --no-index -- .claude/agent-memory/other-tool/x; }
tracked() { [ -n "$(git -C "$P" ls-files -- "$1")" ]; }
untracked() { [ -z "$(git -C "$P" ls-files -- "$1")" ]; }
on_disk() { [ -f "$P/$1" ]; }
commits_is() { [ "$(git -C "$P" rev-list --count HEAD)" = "$1" ]; }

# --- 1 fresh --------------------------------------------------------------------

project
printf '# a line of the human'"'"'s own\n*.local' > "$(exclude_file)"
fx write
expect 'X01 write exits 0 on a fresh project' rc_is 0
expect 'X01 every entry is in the common info/exclude exactly once' every_entry_once
expect 'X01 the human'"'"'s own lines are kept, and the last one ended before the header' grep -qx '\*.local' "$(exclude_file)"
expect 'X01 the entries sit under one coder-fleet header' test "$(grep -c '^# coder-fleet' "$(exclude_file)")" = 1
expect 'X02 no .gitignore is written' test ! -e "$P/.gitignore"
expect 'X02 nothing is committed and nothing is staged' sh -c "[ \"\$(git -C '$P' rev-list --count HEAD)\" = 1 ] && git -C '$P' diff --cached --quiet"
expect 'X02 settings.json and AGENTS.md stay tracked and committable' sh -c "! git -C '$P' check-ignore -q --no-index -- .claude/settings.json && ! git -C '$P' check-ignore -q --no-index -- AGENTS.md"
expect 'X02 another tool'"'"'s memory beside the fleet'"'"'s is left alone' other_memory_not_ignored
cp "$(exclude_file)" "$TMP/exclude.before"
fx write
expect 'X03 a second write exits 0' rc_is 0
expect 'X03 a second write adds nothing' cmp -s "$TMP/exclude.before" "$(exclude_file)"
expect 'X03 a second write says every entry was already there' sh -c "! grep -q '^added' '$OUT' && [ \"\$(grep -c '^present' '$OUT')\" = 3 ]"
fx status
expect 'X04 status says the project is excluded' out_has 'state: excluded'

# --- 3 worktrees ------------------------------------------------------------------

git -C "$P" worktree add -q "$P/.claude/worktrees/agent-x" -b agent-x
expect 'W01 the main checkout honours it' ignored_from "$P"
expect 'W01 a linked agent worktree honours the same file' ignored_from "$P/.claude/worktrees/agent-x"

# --- 2 migration ------------------------------------------------------------------

tracked_project() { # a project an earlier /init set up: memory tracked, the rule and config committed
    project
    mkdir -p "$P/.claude/agent-memory/coder-fleet-coder" "$P/.claude/agent-memory/other-tool" \
        "$P/.claude/rules" "$P/docs/guide"
    printf -- '- a note\n' > "$P/.claude/agent-memory/coder-fleet-coder/MEMORY.md"
    printf -- '- theirs\n' > "$P/.claude/agent-memory/other-tool/MEMORY.md"
    printf 'rule\n' > "$P/.claude/rules/glossary.md"
    printf 'mine\n' > "$P/.claude/rules/house.md"
    printf '{}\n' > "$P/.claude/coder-fleet.json"
    printf 'guide\n' > "$P/docs/guide/x.md"
    printf 'node_modules/\ndocs/runs/\n.boards/\n.claude/agent-memory/\n*.log\n' > "$P/.gitignore"
    git -C "$P" add -A
    git -C "$P" add -f -- .claude/agent-memory
    git -C "$P" commit -q -m "set up by an earlier init"
}

tracked_project
fx status
expect 'M01 status exits 0' rc_is 0
expect 'M01 status names the tracked fleet memory' out_has 'tracked .claude/agent-memory/coder-fleet-coder/'
expect 'M01 status names the tracked rule and config' sh -c "grep -qF 'tracked .claude/rules/glossary.md' '$OUT' && grep -qF 'tracked .claude/coder-fleet.json' '$OUT'"
expect 'M01 status names the old .gitignore lines' sh -c "grep -qxF 'gitignore docs/runs/' '$OUT' && grep -qxF 'gitignore .boards/' '$OUT' && grep -qxF 'gitignore .claude/agent-memory/' '$OUT'"
expect 'M01 status says it needs the migration' out_has 'state: needs-migration'
fx write
expect 'R01 write refuses while fleet files are tracked' rc_is 1
expect 'R01 the refusal says the project is half set up' out_has 'half set up'
expect 'R01 the refusal writes no exclude' sh -c "! grep -qxF '/.claude/coder-fleet.json' '$(exclude_file)' 2>/dev/null"
fx migrate
expect 'M02 migrate exits 0' rc_is 0
expect 'M02 it made exactly one commit' commits_is 3
expect 'M02 the commit says what it is' sh -c "git -C '$P' log -1 --format=%s | grep -q 'out of this project'\''s history'"
expect 'M03 the fleet memory is untracked and still on disk' sh -c "[ -z \"\$(git -C '$P' ls-files -- .claude/agent-memory/coder-fleet-coder)\" ] && [ -f '$P/.claude/agent-memory/coder-fleet-coder/MEMORY.md' ]"
expect 'M03 the rule and config are untracked and still on disk' sh -c "[ -z \"\$(git -C '$P' ls-files -- .claude/rules/glossary.md .claude/coder-fleet.json)\" ] && [ -f '$P/.claude/rules/glossary.md' ] && [ -f '$P/.claude/coder-fleet.json' ]"
expect 'M04 another tool'"'"'s memory, a rule of the project'"'"'s own and other docs stay tracked' sh -c "[ -n \"\$(git -C '$P' ls-files -- .claude/agent-memory/other-tool/MEMORY.md)\" ] && [ -n \"\$(git -C '$P' ls-files -- .claude/rules/house.md)\" ] && [ -n \"\$(git -C '$P' ls-files -- docs/guide/x.md)\" ]"
expect 'M04 settings.json and AGENTS.md stay tracked' sh -c "[ -n \"\$(git -C '$P' ls-files -- .claude/settings.json AGENTS.md | wc -l | tr -d ' ' | grep -x 2)\" ]"
expect 'M05 the old .gitignore lines are gone and the human'"'"'s stay' sh -c "printf 'node_modules/\n*.log\n' | cmp -s - '$P/.gitignore' && [ -z \"\$(git -C '$P' status --porcelain -- .gitignore)\" ]"
expect 'M06 the exclude is written with every entry once' every_entry_once
expect 'M06 nothing is left to commit or untracked in sight' sh -c "[ -z \"\$(git -C '$P' status --porcelain --untracked-files=all)\" ]"
fx status
expect 'M08 status after it says excluded' out_has 'state: excluded'
fx migrate
expect 'M09 a second migrate exits 0' rc_is 0
expect 'M09 a second migrate commits nothing' commits_is 3
expect 'M09 a second migrate says there was nothing to do' out_has 'nothing to migrate'

# Only the old .gitignore lines: an earlier /init that chose to ignore both.
project
printf 'docs/runs/\n.boards/\n.claude/agent-memory/\n' > "$P/.gitignore"
git -C "$P" add .gitignore
git -C "$P" commit -q -m ignore
fx migrate
expect 'M10 lines alone are migrated in one commit' sh -c "[ \"\$(git -C '$P' rev-list --count HEAD)\" = 3 ] && [ ! -s '$P/.gitignore' ]"
expect 'M10 and the exclude is written' every_entry_once

# --- 2 refusals ---------------------------------------------------------------------

tracked_project
printf 'staged\n' > "$P/staged.txt"
git -C "$P" add staged.txt
HEAD_BEFORE=$(git -C "$P" rev-parse HEAD)
fx migrate
expect 'R02 migrate refuses another staged change' rc_is 1
expect 'R02 and says why' out_has 'staged'
expect 'R02 and changes nothing' sh -c "[ \"\$(git -C '$P' rev-parse HEAD)\" = '$HEAD_BEFORE' ] && [ -n \"\$(git -C '$P' ls-files -- .claude/coder-fleet.json)\" ] && ! grep -qxF '/.claude/coder-fleet.json' '$(exclude_file)' 2>/dev/null"
git -C "$P" reset -q -- staged.txt
git -C "$P" worktree add -q "$P/.claude/worktrees/agent-y" -b agent-y
(cd "$P/.claude/worktrees/agent-y" && python3 -I "$SCRIPT" migrate) > "$OUT" 2>&1
RC=$?
expect 'R03 migrate refuses a linked worktree' rc_is 1
expect 'R03 and changes nothing' sh -c "[ \"\$(git -C '$P' rev-parse HEAD)\" = '$HEAD_BEFORE' ] && [ -n \"\$(git -C '$P' ls-files -- .claude/coder-fleet.json)\" ]"
fx bogus
expect 'R04 an unknown mode is a usage error' rc_is 2

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The fleet'"'"'s files may reach a project'"'"'s history, or a migration may lose or keep the wrong ones.\n'
    exit 1
fi
printf 'The fleet'"'"'s files are excluded once, in every checkout, and a migration keeps every file.\n'
