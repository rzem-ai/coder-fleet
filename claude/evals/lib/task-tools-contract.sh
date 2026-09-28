#!/usr/bin/env bash
#
# task-tools-contract.sh - the lead keeps the task tools the route to Done needs.
#
# The only route to Done is a native task whose subject carries [board:<id>],
# completed with TaskUpdate, which fires TaskCompleted. Claude Code 2.1.283
# offers TaskCreate and TaskUpdate only to a fixed list of older models unless
# CLAUDE_CODE_ENABLE_TODO_TOOLS is set, and the lead runs on a newer one, so
# without the variable nothing ever reaches Done (CF-20). The variable is set
# at both scopes: the project settings template beside the lead, and the
# user-scope settings install-home.sh merges. init adds it, kickoff checks it
# and the lead's own TaskUpdate, and the docs say what happens when it is gone.
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
MERGE="$HARNESS_ROOT/scripts/merge-settings.py"

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

printf '\nThe variable is set at both scopes\n'
check 'the project settings template sets it'      sets_var "$TEMPLATE"
check 'the template still sets the lead'           jq -e '.agent == "coder-fleet:lead"' "$TEMPLATE"
check 'the user-scope settings set it'             sets_var "$HOME_SETTINGS"

# install-home.sh merges user settings additively. The key must land on a
# machine whose settings already carry other env entries, and leave them be.
printf '{"env":{"OTHER_ENV":"keep"},"model":"opus"}\n' > "$TMP/existing.json"
python3 "$MERGE" "$TMP/existing.json" "$HOME_SETTINGS" "$TMP/merged.json" >/dev/null 2>&1
check 'the install merge adds it'                  sets_var "$TMP/merged.json"
check 'the install merge keeps other env keys'     jq -e '.env.OTHER_ENV == "keep" and .model == "opus"' "$TMP/merged.json"

printf '\ninit adds it, kickoff checks it\n'
check 'init names the variable'                    names_var "$PLUGIN_ROOT/commands/init.md"
check 'kickoff names the variable'                 names_var "$PLUGIN_ROOT/commands/kickoff.md"
check "kickoff checks the lead's own TaskUpdate"   grep -qF 'TaskUpdate' "$PLUGIN_ROOT/commands/kickoff.md"

printf '\nThe docs say what happens without it\n'
check 'board-conventions names the variable'       names_var "$PLUGIN_ROOT/skills/board-conventions/SKILL.md"
check 'the hooks README names the variable'        names_var "$PLUGIN_ROOT/hooks/README.md"
check 'limits.md records the dependency'           names_var "$REPO_ROOT/docs/limits.md"

# This repository runs the fleet on itself, so it carries the settings /init
# writes, committed, and a test gate that is on (CF-57). A Done that passed an
# unconfigured, lenient gate is not evidence the suite was green.
REPO_SETTINGS="$REPO_ROOT/.claude/settings.json"
printf '\nThis repository closes items through a real gate\n'
check 'its .claude/settings.json is committed'     git -C "$REPO_ROOT" ls-files --error-unmatch .claude/settings.json
check 'it sets the lead'                           jq -e '.agent == "coder-fleet:lead"' "$REPO_SETTINGS"
check 'it sets the task tools'                     sets_var "$REPO_SETTINGS"
check 'its test command is check-all.sh'           jq -e '.env.CODER_FLEET_TEST_COMMAND | test("claude/evals/lib/check-all\\.sh")' "$REPO_SETTINGS"
check 'its gate is strict'                         jq -e '.env.CODER_FLEET_TEST_GATE == "strict"' "$REPO_SETTINGS"
check 'its timeout fits the suite and the hook'    jq -e '(.env.CODER_FLEET_TEST_TIMEOUT | tonumber) as $t | $t >= 300 and $t < 600' "$REPO_SETTINGS"
check 'its glossary rule is committed and current' cmp -s "$REPO_ROOT/.claude/rules/glossary.md" "$PLUGIN_ROOT/templates/rules/glossary.md"

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
if [ "$FAILED" -ne 0 ]; then
    printf 'The lead can lose TaskCreate and TaskUpdate, and with them the only route to Done.\n'
    exit 1
fi
printf 'The lead keeps the task tools, at project and user scope, and kickoff checks them.\n'
