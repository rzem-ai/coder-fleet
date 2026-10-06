#!/usr/bin/env bash
#
# requirements-source-contract.sh - a project that names a requirements source
# skips spec-writer, and every reader of that rule reads the same line (CF-53,
# GitHub #26).
#
# The rule is one literal line in a project's AGENTS.md, `Requirements source:
# <path>`. With it, an item's card criteria are the requirement clauses it
# answers, in clause order, and no spec is written; a path that does not exist
# is a stop, never a fallback to a spec. Without it, nothing changes. The
# workflow's branches are pinned in workflow-logic.mjs; this holds the words:
# the template carries the line, init asks for it, kickoff and the lead route
# on it, spec-writer's description says when it runs, and nobody spells the
# line any other way.
#
# Usage:  claude/evals/lib/requirements-source-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)

AGENTS_TEMPLATE="$PLUGIN_ROOT/templates/AGENTS.md"
INIT="$PLUGIN_ROOT/commands/init.md"
KICKOFF="$PLUGIN_ROOT/commands/kickoff.md"
LEAD="$PLUGIN_ROOT/agents/lead.md"
SPEC_WRITER="$PLUGIN_ROOT/agents/spec-writer.md"
WORKFLOW="$PLUGIN_ROOT/workflows/spec-to-card.js"

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

# The body of one `## ` section of a markdown file, heading excluded.
section() { awk -v h="## $2" '$0 == h {f=1; next} f && /^## / {f=0} f' "$1"; }
where_work_lives_has_line() { section "$AGENTS_TEMPLATE" 'Where work lives' | grep -qE '^Requirements source: '; }
init_step3_says() { section "$INIT" '3. Guided fill' | grep -F 'Requirements source' | grep -qF -- "$1"; }
init_step2_asks() { section "$INIT" '2. Skeleton' | grep -F 'Requirements source: ' | grep -qF 'AskUserQuestion'; }
kickoff_start_says() { section "$KICKOFF" 'Start' | grep -qF -- "$1"; }
lead_step2() { grep -E '^2\. Route by job:' "$LEAD"; }
lead_step2_says() { lead_step2 | grep -qF -- "$1"; }
lead_steps() { section "$LEAD" 'How you work' | grep -cE '^[0-9]+\. '; }
spec_writer_description() { sed -n 's/^description: //p' "$SPEC_WRITER" | head -1; }
spec_writer_description_says() { spec_writer_description | grep -qF -- "$1"; }
spec_writer_description_lacks() { local d; d=$(spec_writer_description) && [ -n "$d" ] && ! printf '%s' "$d" | grep -qF -- "$1"; }
MISSPELT_RE='requirements?[ -]source:'
# The roots the spelling scan covers when it is given none.
SCAN_ROOTS=("$PLUGIN_ROOT" "$HARNESS_ROOT/evals" "$REPO_ROOT/docs" "$REPO_ROOT/README.md" \
    "$REPO_ROOT/AGENTS.md" "$REPO_ROOT/opencode" "$REPO_ROOT/codex")
# Every mention of the line, in any case, singular or plural, spaced or
# hyphenated, that is not the exact spelling - across the plugin, the docs, the
# README and both ports. Excluded: the workflow-logic fixtures that feed it
# wrong spellings on purpose, this file, and any docs/runs/ or docs/findings/
# directory, whose run articles and findings are historical records.
misspelt() {
    # $@ the roots to scan; the repo's own when none are given
    local roots=("$@")
    [ ${#roots[@]} -eq 0 ] && roots=("${SCAN_ROOTS[@]}")
    grep -rnoiE --exclude-dir=node_modules --exclude-dir=dist \
        --exclude=workflow-logic.mjs --exclude=requirements-source-contract.sh \
        "$MISSPELT_RE" "${roots[@]}" 2>/dev/null \
        | grep -vE '/docs/(runs|findings)/' \
        | grep -vE ':Requirements source:$'
}
# The self-tests run the real misspelt() over a scratch tree, so the real tree
# is never touched: a wrong spelling planted in a command is caught, and one
# planted in a run article or a finding - historical records - is not.
planted() {
    # $1 relative path to plant a singular spelling at; prints what misspelt() finds
    local tmp out
    tmp=$(mktemp -d "${TMPDIR:-/tmp}/reqsrc.XXXXXX") || return 1
    mkdir -p "$tmp/$(dirname "$1")"
    printf 'Requirement source: docs/r.md\n' > "$tmp/$1"
    out=$(misspelt "$tmp")
    rm -rf "$tmp"
    printf '%s' "$out"
}
misspelling_caught() { [ -n "$(planted commands/kickoff.md)" ]; }
# One plant per root, named as the root is (docs/x.md, codex/x.md, README.md),
# so a filter or an excluded directory that drops one root's matches is caught.
caught_under_every_root_name() {
    local r rel n=0
    for r in ${SCAN_ROOTS[@]+"${SCAN_ROOTS[@]}"}; do
        if [ -d "$r" ]; then rel="$(basename "$r")/x.md"; else rel=$(basename "$r"); fi
        [ -n "$(planted "$rel")" ] || return 1
        n=$((n + 1))
    done
    [ "$n" -gt 0 ]
}
history_not_scanned() { [ -z "$(planted docs/runs/2026-10-01-coder-x.md)" ] && [ -z "$(planted docs/findings/x.md)" ]; }
none_misspelt() { [ -z "$(misspelt)" ]; }
# grep's errors are silenced, so a mistyped root would empty the scan quietly.
# An unset list is a failure, not an unbound-variable abort that skips the check.
default_roots_exist() { local r n=0; for r in ${SCAN_ROOTS[@]+"${SCAN_ROOTS[@]}"}; do [ -e "$r" ] || return 1; n=$((n + 1)); done; [ "$n" -gt 0 ]; }
# The list existing is not the scan reading it: misspelt() with no roots must
# hand every SCAN_ROOTS entry to its search. A grep stub first on PATH, in a
# temp directory outside the checkout, records each argument it is given on a
# line of its own and matches nothing, so the scan reads and writes nothing in
# the checkout. That a real misspelling is caught is misspelling_caught's job.
scan_arguments() (
    stub=$(mktemp -d "${TMPDIR:-/tmp}/reqsrc-stub.XXXXXX") || exit 1
    trap 'rm -rf "$stub"' EXIT
    {
        printf '#!/bin/sh\n'
        printf 'for a in "$@"; do printf "%%s\\n" "$a"; done >> "$REQSRC_ARGS"\n'
        printf 'exit 1\n'
    } > "$stub/grep"
    chmod +x "$stub/grep" || exit 1
    export REQSRC_ARGS="$stub/args" PATH="$stub:$PATH"
    hash -r
    misspelt >/dev/null
    cat "$REQSRC_ARGS"
)
default_scan_covers_roots() {
    local args r n=0
    args=$(scan_arguments) || return 1
    for r in ${SCAN_ROOTS[@]+"${SCAN_ROOTS[@]}"}; do
        printf '%s\n' "$args" | grep -qxF -- "$r" || return 1
        n=$((n + 1))
    done
    [ "$n" -gt 0 ]
}
# The checkout as git sees it, untracked files included and the board's own
# files left out, without taking the index lock a plain status can take. Read
# once now and once after every check.
tree_state() {
    # $1 the checkout to read; the repo's own when none is given
    git -C "${1:-$REPO_ROOT}" --no-optional-locks status --porcelain --untracked-files=all \
        -- . ':(exclude).boards'
}
# Both reads go through one function, so a git warning on stderr can't make
# the before and after differ.
tree_snapshot() { tree_state "$@" 2>/dev/null; }
TREE_BEFORE=$(tree_snapshot) || TREE_BEFORE='(git status failed)'
tree_unchanged() { local after; after=$(tree_snapshot) || return 1; [ "$TREE_BEFORE" != '(git status failed)' ] && [ "$after" = "$TREE_BEFORE" ]; }
# A git stub first on PATH, outside the checkout, warns on stderr and prints a
# fixed status; the snapshot must be that status alone.
snapshot_ignores_git_warnings() (
    stub=$(mktemp -d "${TMPDIR:-/tmp}/reqsrc-git.XXXXXX") || exit 1
    trap 'rm -rf "$stub"' EXIT
    printf '#!/bin/sh\nprintf "warning: noise\\n" >&2\nprintf " M a.md\\n"\n' > "$stub/git"
    chmod +x "$stub/git" || exit 1
    export PATH="$stub:$PATH"
    hash -r
    [ "$(tree_snapshot)" = ' M a.md' ]
)
# The board auto-commits its own files in the main checkout while anything
# runs, the strict TaskCompleted gate included, so the tree check must not see
# .boards/. Proved on a scratch repository outside the checkout: a change under
# .boards/ is not in the state, and a change beside it is.
boards_not_in_tree_state() (
    tmp=$(mktemp -d "${TMPDIR:-/tmp}/reqsrc-tree.XXXXXX") || exit 1
    trap 'rm -rf "$tmp"' EXIT
    unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR
    git -C "$tmp" init -q || exit 1
    mkdir -p "$tmp/.boards/tasks" || exit 1
    printf 'x\n' > "$tmp/.boards/tasks/cf-1.md"
    printf 'x\n' > "$tmp/beside.md"
    state=$(tree_state "$tmp") || exit 1
    printf '%s\n' "$state" | grep -qF 'beside.md' || exit 1
    ! printf '%s\n' "$state" | grep -qF '.boards'
)
this_repo_has_no_line() { ! grep -qE '^Requirements source:' "$REPO_ROOT/AGENTS.md"; }
where_work_lives_says() { section "$AGENTS_TEMPLATE" 'Where work lives' | grep -qF -- "$1"; }
readme_row() { grep -E '^\| `spec-writer` \|' "$REPO_ROOT/README.md" | head -1; }
readme_row_says() { readme_row | grep -qF -- "$1"; }
readme_board_para_says() { grep -F "spec-to-card" "$REPO_ROOT/README.md" | grep -F 'Two workflow steps need the board' | grep -qF -- "$1"; }
design_says() { grep -qF -- "$1" "$REPO_ROOT/docs/fleet-design.md"; }
design_row_says() { grep -E '^\| `spec-writer` \|' "$REPO_ROOT/docs/fleet-design.md" | head -1 | grep -qF -- "$1"; }

printf '\nThe template carries the line, and init asks for it\n'
check 'Where work lives has a Requirements source line'   where_work_lives_has_line
check 'init step 3 asks about the Requirements source'    init_step3_says 'Requirements source'
check 'init step 3 always asks it, never infers it'       init_step3_says 'never inferred'
check 'init asks a project whose AGENTS.md exists too'    init_step2_asks
check 'the template says how a directory source is ordered' where_work_lives_says 'sorted by path'

printf '\nkickoff and the workflow read the same line\n'
check 'kickoff Start names the line'                      kickoff_start_says 'Requirements source: <path>'
check 'kickoff Start skips spec-writer with it'           kickoff_start_says 'spec-writer never runs'
check 'kickoff Start stops on a path that does not exist' kickoff_start_says 'does not exist'
check 'kickoff Start says how a directory source is ordered' kickoff_start_says 'sorted by path'
check 'spec-to-card matches the literal line'             grep -qE "^const REQUIREMENTS_LINE = /\\^Requirements source:" "$WORKFLOW"

printf '\nThe lead routes on it\n'
check 'lead step 2 names the line'                        lead_step2_says 'Requirements source: <path>'
check 'lead step 2 sends open decisions to Actions for Human' lead_step2_says 'Actions for Human'
check 'lead step 2 answers them before the first build spawn' lead_step2_says 'before the first build spawn'
check 'lead step 2 stops on a path that does not exist'   lead_step2_says 'does not exist'
check 'lead step 2 keeps spec-writer for a spec or a brain dump' lead_step2_says 'for a spec or an unshaped brain dump'
check 'lead keeps six How you work steps'                 test "$(lead_steps)" -eq 6

printf '\nspec-writer says when it runs\n'
check 'its description names the line'                    spec_writer_description_says 'Requirements source: <path>'
check 'its description names an unshaped idea'            spec_writer_description_says 'unshaped idea'
check 'its description no longer says every issue'        spec_writer_description_lacks 'Use before any building starts'

printf '\nOne spelling, and this repo is unchanged\n'
check 'every mention spells it Requirements source:'      none_misspelt
check 'every root the spelling scan covers exists'        default_roots_exist
check 'the default scan searches every root'               default_scan_covers_roots
check 'the spelling scan catches a singular spelling'     misspelling_caught
check 'it catches one under every root name'               caught_under_every_root_name
check 'the spelling scan skips run articles and findings' history_not_scanned
check "this repo's AGENTS.md names no requirements source" this_repo_has_no_line

printf '\nThe README and the design say it too\n'
check 'the README spec-writer row gives the condition'    readme_row_says 'Requirements source: <path>'
check 'the README board paragraph names the clauses'      readme_board_para_says 'requirement clauses'
check 'the design spec-writer row gives the condition'    design_row_says 'Requirements source: <path>'
check 'the design explains the rule'                      design_says 'second approval gate'

printf '\nThe contract writes nothing into the checkout it checks\n'
check 'the tree check leaves the board files out'         boards_not_in_tree_state
check "the tree check ignores git's warnings"            snapshot_ignores_git_warnings
check 'the checkout reads the same after every check'      tree_unchanged

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    misspelt | sed 's/^/        misspelt: /'
    printf 'A project that names a requirements source may still be sent to spec-writer, or the line is read two ways.\n'
    exit 1
fi
printf 'A named requirements source skips the spec, and every reader reads one line.\n'
