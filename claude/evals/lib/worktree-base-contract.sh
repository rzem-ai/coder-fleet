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
# The live cut from local HEAD needs a running Claude; its evidence is recorded
# in docs/limits.md, and this holds the configuration and the words to it.
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
SCRIPTER="$PLUGIN_ROOT/agents/scripter.md"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)
LIMITS="$REPO_ROOT/docs/limits.md"

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
kickoff_base_line_lacks() { local l; l=$(grep -E '^7\. \*\*Worktree base\.\*\*' "$KICKOFF") && [ -n "$l" ] && ! printf '%s' "$l" | grep -qF -- "$1"; }
step2_says() { grep -E '^2\. Confirm you are in your worktree' "$1" | grep -qF -- "$2"; }
limits_entry() { grep -F '**Worktree isolation for a workflow-spawned `coder`.**' "$LIMITS"; }
limits_entry_says() { limits_entry | grep -qF -- "$1"; }
limits_entry_lacks() { local l; l=$(limits_entry) && [ -n "$l" ] && ! printf '%s' "$l" | grep -qF -- "$1"; }

printf '\nThe template ships the local HEAD\n'
check 'the template sets worktree.baseRef to "head"'  jq -e '.worktree.baseRef == "head"' "$TEMPLATE"
check 'the template still sets the lead'              jq -e '.agent == "coder-fleet:lead"' "$TEMPLATE"

printf '\ninit writes it, kickoff offers it\n'
check 'init names worktree.baseRef'                   grep -qF 'worktree.baseRef' "$INIT"
check 'kickoff names worktree.baseRef'                grep -qF 'worktree.baseRef' "$KICKOFF"
check 'kickoff has a worktree base check'             grep -qE '^7\. \*\*Worktree base\.\*\*' "$KICKOFF"
check 'kickoff step 7 asks with AskUserQuestion'      kickoff_base_line_says 'AskUserQuestion'
check 'kickoff merges only on the human'"'"'s yes'        kickoff_base_line_says "and only then, merge"
check 'kickoff never says it merges unasked'          kickoff_base_line_lacks 'Do not ask'
check 'kickoff never says to skip the question'       kickoff_base_line_lacks 'without asking'
check 'kickoff names the local file when it sets it'  kickoff_base_line_says 'settings.local.json'
check 'kickoff counts a user-scope head as passing'   kickoff_base_line_says '~/.claude/settings.json'
check 'init leaves a differing existing key alone'    grep -qF 'is a conflict: report it and leave it alone rather than changing it' "$INIT"
check 'a declined interview leaves the setup marker'  grep -qF 'leave the `Worktree setup` marker' "$INIT"

printf '\nThe project says how a fresh worktree gets its dependencies\n'
check 'the AGENTS.md template has the section'        grep -qE '^## Worktree setup$' "$AGENTS_TEMPLATE"
check 'the section has a FILL marker'                 grep -qE '<FILL: .*worktree' "$AGENTS_TEMPLATE"
check 'the section allows "none needed"'              grep -qF 'none needed' "$AGENTS_TEMPLATE"
check 'init asks for it'                              grep -qF 'Worktree setup' "$INIT"
check 'coder follows it before building'              step2_says "$CODER" 'Worktree setup'
check 'scripter follows it before building'           step2_says "$SCRIPTER" 'Worktree setup'
check 'the template names scripter beside coders'     grep -qF 'Coders and scripters follow this section' "$AGENTS_TEMPLATE"
check 'coder files a missing section under Unverified' step2_says "$CODER" 'under Unverified'
check 'scripter files a missing section under Unverified' step2_says "$SCRIPTER" 'under Unverified'
check 'coder still honours setup given in the brief'  step2_says "$CODER" 'given in the brief'
check 'scripter still honours setup given in the brief' step2_says "$SCRIPTER" 'given in the brief'

# The live run is recorded (CF-144): CF-52 comment #11 shows a type-isolated
# coder spawn cut at local HEAD fc1b90e while local main was ten commits ahead
# of origin, and review-round's fix lane cuts its own worktree at the pinned
# head (CF-127, PR #58). The entry and item 18 cite that evidence, and neither
# still says the run is pending.
printf '\nThe live run is recorded, with its evidence\n'
check 'limits.md cites the live coder spawn'          limits_entry_says 'CF-52 comment #11'
check 'limits.md cites the fix-lane worktree'         limits_entry_says 'PR #58'
check 'limits.md no longer says the run is pending'   limits_entry_lacks 'Until that run is recorded here'
check 'limits.md says a PR branch carries no board commits' limits_entry_says 'must not carry `.boards/` commits'
check 'hooks README cites the live coder spawn'       grep -qF 'CF-52 comment #11' "$PLUGIN_ROOT/hooks/README.md"
check 'hooks README no longer says the run is pending' bash -c '! grep -qF "is pending; docs/limits.md carries it until it runs" "$1"' _ "$PLUGIN_ROOT/hooks/README.md"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'Agent worktrees may start behind local main, or coders may not know how to set one up.\n'
    exit 1
fi
printf 'Worktrees cut from the local HEAD, and coders follow the project setup.\n'
