#!/usr/bin/env bash
#
# check-all.sh - every deterministic check in the repository, in one command.
#
# None of these calls a model, opens a network connection, or writes to a real
# board, so this is the thing to run before a commit and CI should run it. The
# model evals under evals/run.sh are separate and cost money.
#
#   handoff-parity        the two handoff validators agree, 32 fixtures
#   handoff-extractor     review-round reads a handoff exactly as the hook does
#   board-hook-contract   the board hooks read fields the runtime sends
#   scope-hook-contract   each role is held to its invariants, and can still work
#   disabled-agents       an agent listed in .claude/coder-fleet.json is denied
#                         at spawn, a core agent cannot be listed, and the file
#                         is read on every call
#   agents-command        /coder-fleet:agents edits .claude/coder-fleet.json
#                         through the shared validation and refuses without
#                         touching the file
#   fleet-config          this repository's own .claude/coder-fleet.json, if it
#                         has one, is valid
#   roster-contract       every agent is known to the matcher, runner and evals
#   roster-readme-fixture roster-contract.sh actually reads the README table
#   agent-pairs-contract  each editor pair renders from one body source
#   lead-rules-contract   the lead body keeps the phrases that carry CF-51's
#                         High trigger, floor deferral and never on main,
#                         and CF-111's disabled refuter with no substitute
#   steward-checks        the steward eval's FS-criteria gate needs a real
#                         acceptance criterion and refuses misplaced ones
#   workflow-logic       the workflow branches decide on evidence
#   runner-gate           the eval runner fails when the run failed
#   install-home-migration
#                         install-home.sh migrates a machine off the old
#                         secrets directory and marketplace source
#   instruction-file      the fleet writes and checks AGENTS.md, handles a
#                         shadowing CLAUDE.md, and names CLAUDE.md nowhere else
#   prune-worktrees       prune-worktrees.sh removes only adopted worktrees,
#                         forces nothing, and sweeps only dead scratch
#   board-backfill        board-backfill.sh gives open items the Definition
#                         of Done defaults and provisional criteria, and
#                         leaves closed items byte-identical (needs bun, jq)
#   task-tools            the lead keeps TaskCreate and TaskUpdate at project
#                         and user scope, and kickoff checks them
#   worktree-base         the template cuts agent worktrees from the local HEAD,
#                         init and kickoff carry it, and coder follows the
#                         project's worktree setup
#   requirements-source   a named requirements source skips spec-writer, and
#                         the template, init, kickoff, lead and workflow read
#                         one literal line
#   next-column           the configs list Next between To Do and In Progress,
#                         kickoff and init offer it, and the lead and the prose
#                         say what it means
#   board                 the board package type-checks, bundles, and its
#                         fleet-owned tests pass (CHECK_ALL_BOARD_FULL=1 for
#                         the whole upstream suite, which takes about 5 min)
#   glossary              the generated rule still matches the canonical skill
#   agent pairs           each editor pair renders from one source, check-all's
#                         own run of gen-agent-pairs.sh --check
#   versions              plugin.json and the marketplace entry carry the same
#                         version
#
# Usage:  evals/lib/check-all.sh [-v]

set -uo pipefail

VERBOSE="${1:-}"
LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)

FAILED=()

run() {
    # $1 label, rest: command
    local label="$1"; shift
    printf '\n=== %s ===\n' "$label"
    if "$@" ${VERBOSE:+"$VERBOSE"}; then
        printf '%s: ok\n' "$label"
    else
        printf '%s: FAILED\n' "$label"
        FAILED+=("$label")
    fi
}

printf '\n=== shell and node syntax ===\n'
syntax_failed=0
while IFS= read -r f; do
    bash -n "$f" 2>&1 || { printf '  syntax FAIL %s\n' "$f"; syntax_failed=1; }
done < <(find "$PLUGIN_ROOT/hooks" "$PLUGIN_ROOT/scripts" "$HARNESS_ROOT/scripts" "$HARNESS_ROOT/evals" \
            -name '*.sh' -type f 2>/dev/null)
for f in "$PLUGIN_ROOT"/workflows/*.js; do
    node -e "
      const fs=require('fs');
      const src=fs.readFileSync('$f','utf8').replace(/^export const meta/m,'const meta');
      new Function('agent','parallel','pipeline','phase','log','args','return (async()=>{'+src+'})()');
    " 2>&1 || { printf '  parse FAIL %s\n' "$f"; syntax_failed=1; }
done
if [ "$syntax_failed" -eq 0 ]; then printf 'syntax: ok\n'; else FAILED+=("syntax"); fi

run handoff-parity      "$LIB_DIR/handoff-parity.sh"
run handoff-extractor   "$LIB_DIR/handoff-extractor-parity.sh"
run board-hook-contract "$LIB_DIR/board-hook-contract.sh"
run scope-hook-contract "$LIB_DIR/scope-hook-contract.sh"
run disabled-agents     "$LIB_DIR/disabled-agents-contract.sh"
run agents-command      "$LIB_DIR/agents-command-contract.sh"
run fleet-config        "$PLUGIN_ROOT/hooks/enforce-disabled-agents.sh" --check "$REPO_ROOT"
run roster-contract     "$LIB_DIR/roster-contract.sh"
run roster-readme-fixture "$LIB_DIR/roster-readme-fixture.sh"
run agent-pairs-contract "$LIB_DIR/agent-pairs-contract.sh"
run lead-rules-contract "$LIB_DIR/lead-rules-contract.sh"
run steward-checks      "$LIB_DIR/steward-checks-contract.sh"
run workflow-logic      node "$LIB_DIR/workflow-logic.mjs"
run runner-gate         "$LIB_DIR/runner-gate.sh"
run install-home-migration "$LIB_DIR/install-home-migration.sh"
run instruction-file    "$LIB_DIR/instruction-file-contract.sh"
run prune-worktrees     "$LIB_DIR/prune-worktrees-contract.sh"
run board-backfill      "$LIB_DIR/board-backfill-contract.sh"
run task-tools          "$LIB_DIR/task-tools-contract.sh"
run worktree-base       "$LIB_DIR/worktree-base-contract.sh"
run requirements-source "$LIB_DIR/requirements-source-contract.sh"
run next-column         "$LIB_DIR/next-column-contract.sh"

printf '\n=== board ===\n'
if ! command -v bun >/dev/null 2>&1; then
    printf 'board: skipped (bun is not on PATH)\n'
else
    # The test files the fleet owns. The rest of the upstream suite takes
    # about five minutes, and check-all.sh has to stay under two, so it runs
    # only under CHECK_ALL_BOARD_FULL=1.
    BOARD_TESTS=(
        src/test/board-root.test.ts
        src/test/cli-board.test.ts
        src/test/cli-board-behaviour.test.ts
        src/test/no-git.test.ts
        src/test/serve-board.test.ts
        src/test/mcp-serve.test.ts
        src/test/board-port.test.ts
        src/test/board-root-git.test.ts
        src/test/git-commit.test.ts
        src/test/branch-ids.test.ts
        src/test/focus.test.ts
        src/test/mcp-focus.test.ts
        src/test/task-edit-completed.test.ts
        src/test/mcp-task-edit-status.test.ts
        src/test/actions-for-human-markdown.test.ts
        src/test/actions-for-human-core.test.ts
        src/test/actions-for-human-cli.test.ts
        src/test/mcp-actions-for-human.test.ts
        src/test/server-actions-for-human.test.ts
        src/test/web-actions-for-human.test.tsx
        src/test/dod-defaults-config.test.ts
        src/test/cli-dod-config.test.ts
        src/test/require-acceptance-criteria.test.ts
        src/test/web-drafts-promote-error.test.tsx
        src/test/next-column.test.ts
    )
    BOARD_TMP=$(mktemp -d "${TMPDIR:-/tmp}/check-all-board.XXXXXX")
    board_failed=0
    (
        cd "$PLUGIN_ROOT/board" || exit 1
        # A fresh clone has no node_modules, and tsc then reports hundreds of
        # missing-module errors that look like the package is broken rather
        # than uninstalled.
        [ -d node_modules ] || bun install --frozen-lockfile >/dev/null || exit 1
        bunx tsc --noEmit || exit 1
        bun build --target=bun src/cli.ts --outdir "$BOARD_TMP" >/dev/null || exit 1
        if [ "${CHECK_ALL_BOARD_FULL:-}" = "1" ]; then
            bun test --timeout=10000 || exit 1
        else
            bun test --timeout=10000 "${BOARD_TESTS[@]}" || exit 1
        fi
    ) || board_failed=1
    rm -rf "$BOARD_TMP"
    if [ "$board_failed" -eq 0 ]; then
        printf 'board: ok\n'
    else
        printf 'board: FAILED\n'
        FAILED+=("board")
    fi
fi

printf '\n=== glossary ===\n'
if "$HARNESS_ROOT/scripts/gen-glossary-rule.sh" --check; then
    printf 'glossary: ok\n'
else
    printf 'glossary: FAILED\n'
    FAILED+=("glossary")
fi

printf '\n=== agent pairs ===\n'
if "$HARNESS_ROOT/scripts/gen-agent-pairs.sh" --check; then
    printf 'agent pairs: ok\n'
else
    printf 'agent pairs: FAILED\n'
    FAILED+=("agent pairs")
fi

# The marketplace listing shows the version in .claude-plugin/marketplace.json,
# not the one in the plugin's own manifest, so a release whose entry still
# carries the old number is invisible to clients. The two numbers move
# together or the release is not visible.
printf '\n=== versions ===\n'
if python3 - "$REPO_ROOT" "$PLUGIN_ROOT" <<'PY'
import json, sys
root, plugin_root = sys.argv[1], sys.argv[2]
plugin = json.load(open(f"{plugin_root}/.claude-plugin/plugin.json"))["version"]
entry = next(p for p in json.load(open(f"{root}/.claude-plugin/marketplace.json"))["plugins"] if p["name"] == "coder-fleet")["version"]
print(f"plugin.json {plugin}, marketplace entry {entry}")
sys.exit(0 if plugin == entry else 1)
PY
then
    printf 'versions: ok\n'
else
    printf 'versions: FAILED\n'
    FAILED+=("versions")
fi

printf '\n---\n'
if [ "${#FAILED[@]}" -ne 0 ]; then
    printf 'FAILED: %s\n' "${FAILED[*]}"
    exit 1
fi
printf 'Every deterministic check passes.\n'
