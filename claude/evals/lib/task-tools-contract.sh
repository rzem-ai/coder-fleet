#!/usr/bin/env bash
#
# task-tools-contract.sh - the lead keeps the task tools the route to Done needs.
#
# The only route to Done is a native task whose subject carries [board:<id>],
# completed with TaskUpdate, which fires TaskCompleted. Claude Code 2.1.283
# offers TaskCreate and TaskUpdate only to a fixed list of older models unless
# CLAUDE_CODE_ENABLE_TODO_TOOLS is set, and the lead runs on a newer one, so
# without the variable nothing ever reaches Done. The variable is set
# at project scope only: the project settings template beside the lead, which
# init adds. The user-scope settings install-home.sh merges leave it out, so a
# fleet project never depends on a script having run on the
# machine. kickoff checks it and the lead's own TaskUpdate, and the docs say
# what happens when it is gone.
#
# The model-gated behaviour itself needs a paid model call, so it is proven
# live at release, not here. This holds the configuration and the words to it.
#
# Usage:  claude/evals/lib/task-tools-contract.sh [-v]

set -uo pipefail

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)

VAR=CLAUDE_CODE_ENABLE_TODO_TOOLS
TEMPLATE="$PLUGIN_ROOT/templates/project-settings.json"
HOME_SETTINGS="$HARNESS_ROOT/home/settings.json"

command -v jq >/dev/null 2>&1 || { printf 'task-tools-contract: jq is needed\n' >&2; exit 2; }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/task-tools-contract.XXXXXX") || exit 2
trap 'rm -rf "$TMP"' EXIT

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

# The CLI takes "1" and "true", and settings env values are strings; anything
# else, a JSON boolean or number included, or no key, is not what was measured.
sets_var() { jq -e --arg v "$VAR" '.env[$v] | . == "1" or . == "true"' "$1"; }
names_var() { grep -qF -- "$VAR" "$1"; }

printf '\nThe variable is set at project scope, and only there\n'
check 'the project settings template sets it'      sets_var "$TEMPLATE"
check 'the template still sets the lead'           jq -e '.agent == "coder-fleet:lead"' "$TEMPLATE"
check 'the user-scope settings leave it to init'   jq -e --arg v "$VAR" '(.env // {}) | has($v) | not' "$HOME_SETTINGS"

printf '\ninit adds it, kickoff checks it\n'
check 'init names the variable'                    names_var "$PLUGIN_ROOT/commands/init.md"
check 'kickoff names the variable'                 names_var "$PLUGIN_ROOT/commands/kickoff.md"
check "kickoff checks the lead's own TaskUpdate"   grep -qF 'TaskUpdate' "$PLUGIN_ROOT/commands/kickoff.md"

printf '\nThe docs say what happens without it\n'
check 'help-boards names the variable'       names_var "$PLUGIN_ROOT/skills/help-boards/SKILL.md"
check 'the hooks README names the variable'        names_var "$PLUGIN_ROOT/hooks/README.md"
check 'limits.md records the dependency'           names_var "$REPO_ROOT/docs/limits.md"

# This repository runs the fleet on itself, so it carries the settings /init
# writes, committed. Its test gate is the board's, on a release tag (CF-207),
# so the settings carry no test command.
REPO_SETTINGS="$REPO_ROOT/.claude/settings.json"
printf '\nThis repository carries the settings /init writes\n'
check 'its .claude/settings.json is committed'     git -C "$REPO_ROOT" ls-files --error-unmatch .claude/settings.json
check 'it sets the lead'                           jq -e '.agent == "coder-fleet:lead"' "$REPO_SETTINGS"
check 'it sets the task tools'                     sets_var "$REPO_SETTINGS"
# The installed glossary rule is committed while the repository commits the
# fleet's files. Once fleet-exclude.py keeps them out of its history (CF-201.2)
# the main checkout still has it, excluded, and a linked worktree or a CI clone
# has none, so the nearest true thing there is that nothing tracks it and the
# template /init installs from is current. fleet-layout.py names the arm.
RULE=.claude/rules/glossary.md
RULE_LINE=$(python3 -I "$HARNESS_ROOT/scripts/fleet-layout.py" --repo "$REPO_ROOT" "$RULE" 2>&1)
printf '  arm   %s: %s\n' "$RULE" "$RULE_LINE"
rule_matches_template() { cmp -s "$REPO_ROOT/$RULE" "$PLUGIN_ROOT/templates/rules/glossary.md"; }
rule_untracked() { [ -z "$(git -C "$REPO_ROOT" ls-files -- "$RULE")" ]; }
rule_excluded() { rule_untracked && git -C "$REPO_ROOT" check-ignore -q -- "$RULE"; }
case "$RULE_LINE" in
    tracked\ *)
        check 'its glossary rule is committed'             git -C "$REPO_ROOT" ls-files --error-unmatch "$RULE"
        check 'its glossary rule matches the template'     rule_matches_template ;;
    "excluded worktree "*)
        check 'its glossary rule is kept out of history'   rule_excluded
        check 'its glossary rule matches the template'     rule_matches_template ;;
    "excluded absent -")
        check 'its glossary rule is absent and untracked'  rule_untracked
        check 'the template it installs from is current'   "$HARNESS_ROOT/scripts/gen-glossary-rule.sh" --check ;;
    *)
        check 'fleet-layout.py names its glossary rule'    false ;;
esac

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The lead can lose TaskCreate and TaskUpdate, and with them the only route to Done.\n'
    exit 1
fi
printf 'The lead keeps the task tools through the project settings init writes, and kickoff checks them.\n'
