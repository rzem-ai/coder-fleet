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
# Every mention of the line, in any case, that is not the exact spelling.
misspelt() {
    grep -rnoiE --exclude-dir=node_modules --exclude-dir=dist 'requirements[ -]source:' "$PLUGIN_ROOT" "$REPO_ROOT/docs/agent-contract.md" 2>/dev/null \
        | grep -vE ':Requirements source:$'
}
none_misspelt() { [ -z "$(misspelt)" ]; }
this_repo_has_no_line() { ! grep -qE '^Requirements source: ' "$REPO_ROOT/AGENTS.md"; }

printf '\nThe template carries the line, and init asks for it\n'
check 'Where work lives has a Requirements source line'   where_work_lives_has_line
check 'init step 3 asks about the Requirements source'    init_step3_says 'Requirements source'
check 'init step 3 always asks it, never infers it'       init_step3_says 'never inferred'
check 'init asks a project whose AGENTS.md exists too'    init_step2_asks

printf '\nkickoff and the workflow read the same line\n'
check 'kickoff Start names the line'                      kickoff_start_says 'Requirements source: <path>'
check 'kickoff Start skips spec-writer with it'           kickoff_start_says 'spec-writer never runs'
check 'kickoff Start stops on a path that does not exist' kickoff_start_says 'does not exist'
check 'spec-to-card matches the literal line'             grep -qE "^const REQUIREMENTS_LINE = /\^Requirements source: " "$WORKFLOW"

printf '\nThe lead routes on it\n'
check 'lead step 2 names the line'                        lead_step2_says 'Requirements source: <path>'
check 'lead step 2 sends open decisions to Actions for Human' lead_step2_says 'Actions for Human'
check 'lead step 2 answers them before the first build spawn' lead_step2_says 'before the first build spawn'
check 'lead step 2 stops on a path that does not exist'   lead_step2_says 'does not exist'
check 'lead keeps six How you work steps'                 test "$(lead_steps)" -eq 6

printf '\nspec-writer says when it runs\n'
check 'its description names the line'                    spec_writer_description_says 'Requirements source: <path>'
check 'its description names an unshaped idea'            spec_writer_description_says 'unshaped idea'
check 'its description no longer says every issue'        spec_writer_description_lacks 'Use before any building starts'

printf '\nOne spelling, and this repo is unchanged\n'
check 'every mention spells it Requirements source:'      none_misspelt
check "this repo's AGENTS.md names no requirements source" this_repo_has_no_line

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    misspelt | sed 's/^/        misspelt: /'
    printf 'A project that names a requirements source may still be sent to spec-writer, or the line is read two ways.\n'
    exit 1
fi
printf 'A named requirements source skips the spec, and every reader reads one line.\n'
