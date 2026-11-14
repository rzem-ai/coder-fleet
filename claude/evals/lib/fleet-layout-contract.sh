#!/usr/bin/env bash
#
# fleet-layout-contract.sh - claude/scripts/fleet-layout.py, and the
# installed-copy half of gen-glossary-rule.sh, in both of the layouts the
# coder-fleet repo can be in (CF-201.2).
#
# The repo commits its installed glossary rule until it is migrated with
# fleet-exclude.py, and keeps it out of history after. The checks that read it
# (task-tools, gen-glossary-rule.sh) ask fleet-layout.py which arm they are in. These cases build each arm
# in a fixture and pin the answer:
#
#   L01-L02 tracked layout: the file is here, or it is missing and that fails
#   L03     excluded layout, main checkout: the file is on disk, untracked
#   L04     excluded layout, a fresh clone: absent
#   L09     a path the fleet does not keep is refused
#   G01-G03 gen-glossary-rule.sh writes the installed copy when it is
#           committed, refreshes an excluded one and says so, and writes none
#           into a checkout that has none
#
# Every case runs in fixture repositories under this test's own temporary
# directory, never in this checkout. Each fixture sets its own identity.
#
# Usage:  claude/evals/lib/fleet-layout-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
LAYOUT="$HARNESS_ROOT/scripts/fleet-layout.py"
EXCLUDE="$PLUGIN_ROOT/scripts/fleet-exclude.py"

command -v python3 >/dev/null 2>&1 || { printf 'fleet-layout-contract: python3 is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/fleet-layout-contract.XXXXXX") || exit 2
TMP=$(cd "$TMP" && pwd -P) || exit 2
trap 'rm -rf "$TMP"' EXIT

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL
export GIT_CEILING_DIRECTORIES="$TMP"
export GIT_CONFIG_NOSYSTEM=1
# CI's runner has no identity, so none is guessed here either: every fixture
# that commits sets its own, and one that forgets fails on this machine too.
printf '[user]\n\tuseConfigOnly = true\n' > "$TMP/gitconfig"
export GIT_CONFIG_GLOBAL="$TMP/gitconfig"

PASSED=0
FAILED=0
OUT="$TMP/out"
RC=0
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
q() { git -C "$1" "${@:2}" >/dev/null 2>&1; }
identity() { q "$1" config user.name fixture && q "$1" config user.email fixture@example.invalid; }

lay() { # $1 checkout, rest: fleet-layout.py arguments; sets RC, writes $OUT
    python3 -I "$LAYOUT" --repo "$1" "${@:2}" > "$OUT" 2>&1
    RC=$?
}
said() { [ "$RC" -eq "$1" ] && [ "$(head -n 1 "$OUT")" = "$2" ]; }

# A repository that commits the fleet's files, as the coder-fleet repo did before CF-201.2 migrated it.
make_tracked() { # $1 dir
    mkdir -p "$1/.claude/rules" || return 1
    q "$1" init -q -b main || return 1
    identity "$1" || return 1
    printf 'rule\n' > "$1/.claude/rules/glossary.md"
    printf 'readme\n' > "$1/README"
    q "$1" add -A && q "$1" commit -q -m tracked
}

printf '\nfleet-layout.py names the arm each checkout is in\n'
T="$TMP/tracked"
make_tracked "$T"
lay "$T" .claude/rules/glossary.md
expect 'L01 tracked layout, file here: tracked worktree' said 0 "tracked worktree $T/.claude/rules/glossary.md"

T2="$TMP/tracked-gone"
make_tracked "$T2"
printf 'x\n' > "$T2/.claude/coder-fleet.json"
q "$T2" add -f .claude/coder-fleet.json && q "$T2" rm -q .claude/rules/glossary.md && q "$T2" commit -q -m gone
lay "$T2" .claude/rules/glossary.md
expect 'L02 tracked layout, file missing: tracked absent, exit 1' said 1 'tracked absent -'

M="$TMP/migrated"
make_tracked "$M"
(cd "$M" && python3 -I "$EXCLUDE" migrate) > "$OUT" 2>&1
lay "$M" .claude/rules/glossary.md
expect 'L03 excluded layout, main checkout: excluded worktree' said 0 "excluded worktree $M/.claude/rules/glossary.md"

C="$TMP/ci-clone"
q "$TMP" clone -q "file://$M" "$C"
lay "$C" .claude/rules/glossary.md
expect 'L04 excluded layout, fresh clone: excluded absent, exit 0' said 0 'excluded absent -'

lay "$T" README
expect 'L09 a path the fleet does not keep: exit 2' test "$RC" -eq 2

# gen-glossary-rule.sh writes the installed copy beside its own repository, so
# each fixture carries the generator, its source and the scripts it calls.
make_gen() { # $1 dir
    mkdir -p "$1/claude/scripts" "$1/claude/coder-fleet/skills/glossary" "$1/claude/coder-fleet/templates/rules" \
        "$1/claude/coder-fleet/scripts" "$1/.claude/rules" || return 1
    cp "$HARNESS_ROOT/scripts/gen-glossary-rule.sh" "$HARNESS_ROOT/scripts/fleet-layout.py" "$1/claude/scripts/"
    cp "$PLUGIN_ROOT/skills/glossary/SKILL.md" "$1/claude/coder-fleet/skills/glossary/"
    cp "$PLUGIN_ROOT/templates/rules/glossary.md" "$1/claude/coder-fleet/templates/rules/"
    cp "$EXCLUDE" "$1/claude/coder-fleet/scripts/"
    # fleet-exclude.py is a shim onto the boards binary, reached through ../boards/boards.sh (CF-1.2).
    ln -s "$PLUGIN_ROOT/boards" "$1/claude/coder-fleet/boards"
    printf 'stale\n' > "$1/.claude/rules/glossary.md"
    q "$1" init -q -b main && identity "$1" && q "$1" add -A && q "$1" commit -q -m gen
}
gen() { # $1 checkout; sets RC, writes $OUT
    bash "$1/claude/scripts/gen-glossary-rule.sh" > "$OUT" 2>&1
    RC=$?
}
out_has() { grep -qF -- "$1" "$OUT"; }
same_as_template() { cmp -s "$1/.claude/rules/glossary.md" "$1/claude/coder-fleet/templates/rules/glossary.md"; }
clean() { [ -z "$(git -C "$1" status --porcelain)" ]; }

printf '\ngen-glossary-rule.sh and the installed copy, in each layout\n'
G="$TMP/gen-tracked"
make_gen "$G"
gen "$G"
expect 'G01 tracked: exit 0' test "$RC" -eq 0
expect 'G01 tracked: it writes the committed copy' out_has 'wrote .claude/rules/glossary.md from'
expect 'G01 tracked: the copy matches the template' same_as_template "$G"

GM="$TMP/gen-migrated"
make_gen "$GM"
(cd "$GM" && python3 -I "$EXCLUDE" migrate) > "$OUT" 2>&1
gen "$GM"
expect 'G02 excluded, copy on disk: exit 0' test "$RC" -eq 0
expect 'G02 excluded, copy on disk: it refreshes it and says history keeps it out' out_has 'wrote .claude/rules/glossary.md (kept out of history, so there is nothing to commit) from'
expect 'G02 excluded, copy on disk: the copy matches the template' same_as_template "$GM"
expect 'G02 excluded, copy on disk: nothing shows in git status' clean "$GM"

GC="$TMP/gen-clone"
q "$TMP" clone -q "file://$GM" "$GC"
gen "$GC"
expect 'G03 excluded, no copy: exit 0' test "$RC" -eq 0
expect 'G03 excluded, no copy: it says it skipped the copy' out_has 'skipped .claude/rules/glossary.md:'
expect 'G03 excluded, no copy: it writes none' test ! -e "$GC/.claude/rules/glossary.md"
expect 'G03 excluded, no copy: the template is still current' out_has 'unchanged - templates/rules/glossary.md is already current.'

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || { printf 'A check that reads the repo'"'"'s own fleet files can misread its layout.\n'; exit 1; }
printf 'Each layout and arm is named, and gen-glossary-rule.sh writes the installed copy only where it belongs.\n'
