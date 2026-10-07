#!/usr/bin/env bash
#
# check-all.sh - every deterministic check in the repository, in one command.
#
# None of these calls a model, opens a network connection, or writes to a real
# board, so this is the thing to run before a commit and CI should run it. The
# model evals under evals/run.sh are separate and cost money. This repository's
# TaskCompleted gate runs it on every close, so it keeps to the budget in
# AGENTS.md; the slow checks no close depends on are in check-slow.sh, which CI
# runs after this.
#
#   board install         the board's node_modules, once, before anything that
#                         needs them starts; skipped when present or, outside
#                         CI, when bun is not on PATH (with CI set that fails)
#   syntax                every shell script parses, and every workflow
#   check-all-timing      this script prints each section's duration and the
#                         total, so a slow suite shows where the time goes
#   check-all-ci-bun      with CI set and no bun, the board sections fail
#                         rather than skip
#   check-all-lock        a second check-all waits for the first instead of
#                         running beside it, a nested run does not, and an
#                         unusable lock runs unlocked
#   suite-coverage        every check under lib/ runs in this suite or in
#                         check-slow.sh, never both, and CI runs both
#   shards-contract       shards.sh fails a sharded contract whose copies did
#                         not split its cases or whose cases failed
#   check-slow-contract   check-slow.sh exits 1 on a red check, and
#                         suite-coverage counts only live run lines
#   handoff-parity      the two handoff validators agree, 32 fixtures
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
#   board-git-check       board-git-check.sh reports uncommitted .boards
#                         writes and a stale index.lock, and deletes nothing
#   task-tools            the lead keeps TaskCreate and TaskUpdate at project
#                         and user scope, and kickoff checks them
#   worktree-base         the template cuts agent worktrees from the local HEAD,
#                         init and kickoff carry it, and coder follows the
#                         project's worktree setup
#   requirements-source   a named requirements source skips spec-writer, and
#                         the template, init, kickoff, lead and workflow read
#                         one literal line
#   next-column           the configs list Next between To Do and In Progress,
#                         kickoff and init offer it, and the docs say what it
#                         means
#   editor-models         editor-models.py records each editor answer in
#                         AGENTS.md and denies the unchosen definitions in
#                         .claude/settings.json, touching no other key
#   board                 the board package type-checks, bundles, and its
#                         fleet-owned tests pass (CHECK_ALL_BOARD_FULL=1 for
#                         the whole upstream suite, which takes about 5 min)
#   glossary              the generated rule still matches the canonical skill
#   agent pairs           each editor pair renders from one source, check-all's
#                         own run of gen-agent-pairs.sh --check
#   versions              plugin.json and the marketplace entry carry the same
#                         version
#
# After board install, every section runs at once and prints, in the order
# above, its output, its verdict and its own duration; the run ends with the
# total. CHECK_ALL_SERIAL=1 runs one section at a time. Only one check-all
# runs per machine at once; a second waits for the lock (see take_lock).
#
# Usage:  evals/lib/check-all.sh [-v]

set -uo pipefail

VERBOSE="${1:-}"
LIB_DIR=$(cd "$(dirname "$0")" && pwd)
HARNESS_ROOT=$(cd "$LIB_DIR/../.." && pwd)
PLUGIN_ROOT="$HARNESS_ROOT/coder-fleet"
REPO_ROOT=$(cd "$HARNESS_ROOT/.." && pwd)

FAILED=()

# Seconds since the epoch, to a fraction where the shell can say. bash 5 has
# EPOCHREALTIME; the bash 3.2 that macOS ships does not, so fall back to whole
# seconds there.
now() {
    if [ -n "${EPOCHREALTIME:-}" ]; then
        printf '%s' "${EPOCHREALTIME/,/.}"
    else
        date +%s
    fi
}
since() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }

SUITE_START=$(now)
JOBS=$(mktemp -d "${TMPDIR:-/tmp}/check-all.XXXXXX") || exit 2
trap 'rm -rf "$JOBS"' EXIT

# One check-all at a time per machine (CF-76.1). A run starts every section at
# once and keeps all the cores busy by design; two runs together pushed the
# load to 58 on 16 cores, ran 3.4 times slower and failed the board section in
# both on its per-test timeouts, while the same two one after the other took
# 172 s and passed. So the run takes a machine-wide lock and a second run waits
# for it. The lock is flock on file descriptor 9, taken by python3 (macOS ships
# no flock command) and held by this shell's open descriptor until it exits;
# every section runs with 9 closed, so nothing a section leaves running can
# keep it. A run nested inside a locked one (a contract that runs check-all)
# sees CHECK_ALL_LOCK_HELD and does not wait on its own parent. When the lock
# cannot be taken - no python3, a path that cannot be opened, or a wait longer
# than CHECK_ALL_LOCK_WAIT seconds - the run says so and goes ahead unlocked
# rather than failing or hanging. CHECK_ALL_LOCK=0 turns it off.
take_lock() {
    [ -n "${CHECK_ALL_LOCK_HELD:-}" ] && return 0
    [ "${CHECK_ALL_LOCK:-1}" = "0" ] && return 0
    local file="${CHECK_ALL_LOCK_FILE:-/tmp/coder-fleet-check-all-$(id -u).lock}"
    local wait="${CHECK_ALL_LOCK_WAIT:-600}"
    if ! { exec 9>>"$file"; } 2>/dev/null; then
        printf 'check-all: cannot open the lock %s; running unlocked\n' "$file"
        return 0
    fi
    local rc=0
    python3 - "$wait" "$file" <<'PY' || rc=$?
import fcntl, sys, time
wait, path = float(sys.argv[1]), sys.argv[2]
start = time.monotonic()
said = False
while True:
    try:
        fcntl.flock(9, fcntl.LOCK_EX | fcntl.LOCK_NB)
        break
    except BlockingIOError:
        if not said:
            print(f"check-all: another check-all holds {path}; waiting up to {int(wait)} s", flush=True)
            said = True
        if time.monotonic() - start >= wait:
            sys.exit(3)
        time.sleep(0.5)
if said:
    print(f"check-all: lock taken after {time.monotonic() - start:.0f} s", flush=True)
PY
    case "$rc" in
        0) export CHECK_ALL_LOCK_HELD=1 ;;
        3) printf 'check-all: waited %s s for %s; running unlocked\n' "$wait" "$file"; exec 9>&- ;;
        *) printf 'check-all: could not take the lock %s; running unlocked\n' "$file"; exec 9>&- ;;
    esac
    return 0
}
take_lock
LABELS=()
PIDS=()
STARTS=()

# run <label> <command...>: starts a section in the background, with its
# output in a file of its own and nothing on stdin. The sections are
# independent, each in its own scratch directory, so they run at once and the
# suite costs its slowest section rather than the sum of them all (CF-56).
# CHECK_ALL_SERIAL=1 runs them one at a time, which is the way to measure a
# section's own cost without the others competing for the machine.
run() {
    local label="$1"; shift
    local n=${#LABELS[@]}
    LABELS+=("$label")
    STARTS+=("$(now)")
    (
        start=$(now)
        export CHECK_ALL_SKIP_FILE="$JOBS/$n.skip"
        if "$@" ${VERBOSE:+"$VERBOSE"} < /dev/null > "$JOBS/$n.out" 2>&1 9>&-; then rc=0; else rc=1; fi
        printf '%s %s\n' "$rc" "$(since "$start")" > "$JOBS/$n.rc"
    ) &
    PIDS+=("$!")
    [ "${CHECK_ALL_SERIAL:-}" = "1" ] && wait "$!"
    return 0
}

# settle: waits for every section started since the last settle and prints
# each in the order it was started, closing with its verdict and how long it
# took on its own. A section whose shell was killed before it wrote its rc
# file has no verdict of its own, so it fails, timed from its start (CF-56.1).
SETTLED=0
settle() {
    local i rc secs verdict
    for (( i = SETTLED; i < ${#LABELS[@]}; i++ )); do
        wait "${PIDS[$i]}"
        printf '\n=== %s ===\n' "${LABELS[$i]}"
        cat "$JOBS/$i.out" 2>/dev/null
        rc=''; secs=''
        [ -f "$JOBS/$i.rc" ] && read -r rc secs < "$JOBS/$i.rc"
        if [ "$rc" = 0 ]; then
            verdict=ok
            [ -e "$JOBS/$i.skip" ] && verdict=skipped
        elif [ "$rc" = 1 ]; then
            verdict=FAILED
            FAILED+=("${LABELS[$i]}")
        else
            verdict='FAILED (killed before it wrote its result)'
            secs=$(since "${STARTS[$i]}")
            FAILED+=("${LABELS[$i]}")
        fi
        printf '%s: %s (%ss)\n' "${LABELS[$i]}" "$verdict" "$secs"
    done
    SETTLED=${#LABELS[@]}
}

# Marks the running section as skipped rather than passed.
skip_section() { : > "${CHECK_ALL_SKIP_FILE:?}"; }

check_syntax() {
    local f failed=0
    while IFS= read -r f; do
        bash -n "$f" 2>&1 || { printf '  syntax FAIL %s\n' "$f"; failed=1; }
    done < <(find "$PLUGIN_ROOT/hooks" "$PLUGIN_ROOT/scripts" "$HARNESS_ROOT/scripts" "$HARNESS_ROOT/evals" \
                -name '*.sh' -type f 2>/dev/null)
    for f in "$PLUGIN_ROOT"/workflows/*.js; do
        node -e "
          const fs=require('fs');
          const src=fs.readFileSync('$f','utf8').replace(/^export const meta/m,'const meta');
          new Function('agent','parallel','pipeline','phase','log','args','return (async()=>{'+src+'})()');
        " 2>&1 || { printf '  parse FAIL %s\n' "$f"; failed=1; }
    done
    return "$failed"
}

# Without bun the board sections skip on a developer's machine, which may have
# no board. In CI (CI is set, as GitHub Actions does) a skip would be a silent
# green, so a missing bun fails there (CF-29).
no_bun() { # $1 what is not done
    if [ -n "${CI:-}" ]; then
        printf 'bun is not on PATH and CI is set, so %s: install bun in the workflow\n' "$1"
        return 1
    fi
    printf 'bun is not on PATH, so %s\n' "$1"
    skip_section; return 0
}

# A fresh clone has no node_modules. The board section, board-backfill and
# board-hook-contract's live cases all need them, so they are installed once
# here, before those sections start, rather than by two of them at once.
board_install() {
    if ! command -v bun >/dev/null 2>&1; then
        no_bun 'nothing is installed'; return
    fi
    if [ -d "$PLUGIN_ROOT/board/node_modules" ]; then
        printf 'node_modules is present\n'
        skip_section; return 0
    fi
    (cd "$PLUGIN_ROOT/board" && bun install --frozen-lockfile >/dev/null)
}

check_board() {
    if ! command -v bun >/dev/null 2>&1; then
        no_bun 'the board package is not checked'; return
    fi
    # Each test gets 60 s, not bun's 10 s: under a full machine a test that
    # spawns the CLI four or five times (a fresh TypeScript compile each)
    # crossed 10 s while nothing was wrong (CF-76.1). The lock above keeps two
    # suites apart; this covers load the lock cannot see, such as a refuter's
    # mutant copies. The test files the fleet owns. The rest of the upstream suite takes
    # about five minutes, and check-all.sh has to stay inside its budget in
    # AGENTS.md, so it runs only under CHECK_ALL_BOARD_FULL=1.
    BOARD_TESTS=(
        src/test/board-root.test.ts
        src/test/cli-board.test.ts
        src/test/cli-board-behaviour.test.ts
        src/test/no-git.test.ts
        src/test/serve-board.test.ts
        src/test/mcp-serve.test.ts
        src/test/mcp-server.test.ts
        src/test/board-port.test.ts
        src/test/board-root-git.test.ts
        src/test/git-commit.test.ts
        src/test/board-commit-log.test.ts
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
        src/test/server-host-guard.test.ts
        src/test/mcp-task-ack.test.ts
    )
    local BOARD_TMP board_failed=0
    BOARD_TMP=$(mktemp -d "${TMPDIR:-/tmp}/check-all-board.XXXXXX")
    (
        cd "$PLUGIN_ROOT/board" || exit 1
        # A fresh clone has no node_modules, and tsc then reports hundreds of
        # missing-module errors that look like the package is broken rather
        # than uninstalled.
        [ -d node_modules ] || bun install --frozen-lockfile >/dev/null || exit 1
        bunx tsc --noEmit || exit 1
        bun build --target=bun src/cli.ts --outdir "$BOARD_TMP" >/dev/null || exit 1
        if [ "${CHECK_ALL_BOARD_FULL:-}" = "1" ]; then
            bun test --timeout=60000 || exit 1
        else
            bun test --timeout=60000 "${BOARD_TESTS[@]}" || exit 1
        fi
    ) || board_failed=1
    rm -rf "$BOARD_TMP"
    return "$board_failed"
}

# The marketplace listing shows the version in .claude-plugin/marketplace.json,
# not the one in the plugin's own manifest, so a release whose entry still
# carries the old number is invisible to clients. The two numbers move
# together or the release is not visible.
check_versions() {
    python3 - "$REPO_ROOT" "$PLUGIN_ROOT" <<'PY'
import json, sys
root, plugin_root = sys.argv[1], sys.argv[2]
plugin = json.load(open(f"{plugin_root}/.claude-plugin/plugin.json"))["version"]
entry = next(p for p in json.load(open(f"{root}/.claude-plugin/marketplace.json"))["plugins"] if p["name"] == "coder-fleet")["version"]
print(f"plugin.json {plugin}, marketplace entry {entry}")
sys.exit(0 if plugin == entry else 1)
PY
}

check_glossary()    { "$HARNESS_ROOT/scripts/gen-glossary-rule.sh" --check; }
check_agent_pairs() { "$HARNESS_ROOT/scripts/gen-agent-pairs.sh" --check; }

run "board install"     board_install
settle

run syntax              check_syntax
run check-all-timing    "$LIB_DIR/check-all-timing.sh"
run check-all-ci-bun    "$LIB_DIR/check-all-ci-bun.sh"
run check-all-lock      "$LIB_DIR/check-all-lock.sh"
run suite-coverage      "$LIB_DIR/suite-coverage.sh"
run shards-contract     "$LIB_DIR/shards-contract.sh"
run check-slow-contract "$LIB_DIR/check-slow-contract.sh"
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
run workflow-logic      node "$LIB_DIR/workflow-logic.mjs"
run runner-gate         "$LIB_DIR/runner-gate.sh"
run install-home-migration "$LIB_DIR/install-home-migration.sh"
run instruction-file    "$LIB_DIR/instruction-file-contract.sh"
run prune-worktrees     "$LIB_DIR/prune-worktrees-contract.sh"
run board-backfill      "$LIB_DIR/board-backfill-contract.sh"
run board-git-check     "$LIB_DIR/board-git-check-contract.sh"
run task-tools          "$LIB_DIR/task-tools-contract.sh"
run worktree-base       "$LIB_DIR/worktree-base-contract.sh"
run requirements-source "$LIB_DIR/requirements-source-contract.sh"
run next-column         "$LIB_DIR/next-column-contract.sh"
run challenge-gate      "$LIB_DIR/challenge-gate-contract.sh"
run editor-models       "$LIB_DIR/editor-models-contract.sh"
run spec-editor-checks  "$LIB_DIR/spec-editor-checks-contract.sh"
run tech-editor-checks  "$LIB_DIR/tech-editor-checks-contract.sh"
run board               check_board
run glossary            check_glossary
run "agent pairs"       check_agent_pairs
run versions            check_versions
settle

printf '\n---\ntotal: %ss\n' "$(since "$SUITE_START")"
if [ "${#FAILED[@]}" -ne 0 ]; then
    printf 'FAILED: %s\n' "${FAILED[*]}"
    exit 1
fi
printf 'Every deterministic check passes.\n'
