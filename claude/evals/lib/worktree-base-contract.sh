#!/usr/bin/env bash
#
# worktree-base-contract.sh - agent worktrees are cut from the local HEAD, and
# coders follow the project's worktree setup (CF-52, GitHub #25).
#
# Claude Code defines worktree.baseRef as "fresh" (default, origin/<default
# branch>) or "head" (the current local HEAD). Under "fresh" an unpushed local
# main leaves every coder behind it. The template ships "head", init writes it,
# kickoff offers it to a project still on the default, and the dependency step
# lives in each project's AGENTS.md, which coder follows before building.
#
# The live cut from local HEAD needs a running Claude and is recorded in
# docs/limits.md, not here. This holds the configuration and the words to it.
#
# Usage:  claude/evals/lib/worktree-base-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"

TEMPLATE="$PLUGIN_ROOT/templates/project-settings.json"
AGENTS_TEMPLATE="$PLUGIN_ROOT/templates/AGENTS.md"
INIT="$PLUGIN_ROOT/commands/init.md"
KICKOFF="$PLUGIN_ROOT/commands/kickoff.md"
CODER="$PLUGIN_ROOT/agents/coder.md"

command -v jq >/dev/null 2>&1 || { printf 'worktree-base-contract: jq is needed\n' >&2; exit 2; }

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

kickoff_base_line_says() { grep -E '^7\. \*\*Worktree base\.\*\*' "$KICKOFF" | grep -qF -- "$1"; }

printf '\nThe template ships the local HEAD\n'
check 'the template sets worktree.baseRef to "head"'  jq -e '.worktree.baseRef == "head"' "$TEMPLATE"
check 'the template still sets the lead'              jq -e '.agent == "coder-fleet:lead"' "$TEMPLATE"

printf '\ninit writes it, kickoff offers it\n'
check 'init names worktree.baseRef'                   grep -qF 'worktree.baseRef' "$INIT"
check 'kickoff names worktree.baseRef'                grep -qF 'worktree.baseRef' "$KICKOFF"
check 'kickoff has a worktree base check'             grep -qE '^7\. \*\*Worktree base\.\*\*' "$KICKOFF"
check 'kickoff changes nothing without a yes'         kickoff_base_line_says "only on the human's yes"

printf '\nThe project says how a fresh worktree gets its dependencies\n'
check 'the AGENTS.md template has the section'        grep -qE '^## Worktree setup$' "$AGENTS_TEMPLATE"
check 'the section has a FILL marker'                 grep -qE '<FILL: .*worktree' "$AGENTS_TEMPLATE"
check 'the section allows "none needed"'              grep -qF 'none needed' "$AGENTS_TEMPLATE"
check 'init asks for it'                              grep -qF 'Worktree setup' "$INIT"
check 'coder follows it before building'              grep -qF 'Worktree setup' "$CODER"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'Agent worktrees may start behind local main, or coders may not know how to set one up.\n'
    exit 1
fi
printf 'Worktrees cut from the local HEAD, and coders follow the project setup.\n'
