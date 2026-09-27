---
id: CF-26
title: Make board task edit reach completed cards or fail loudly
status: In Progress
assignee: []
created_date: '2026-09-27 03:15'
updated_date: '2026-09-27 06:58'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - claude/coder-fleet/board
  - docs/plans/CF-26.md
  - 'https://github.com/rzem-ai/coder-fleet/issues/12'
priority: Medium
type: bug
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#3, point 5 (taint: external; restated here as the requirement). In the Fathom repo on 2026-09-27, `board.sh task edit FTH-001.12 --check-ac 1 ...` printed `Task not found: FTH-001.12` once the card had moved to `.boards/completed/`, and nothing changed; the lead only noticed on re-reading the file, because the exit status was lost through a pipe to `tail`. Decide whether `task edit` (CLI and MCP task_edit) should reach a completed card - ticking criteria and commenting after completion are normal, as the lead did on CF-8 and CF-6 after merge - or say plainly that completed cards are read-only; either way, "not found" must exit non-zero. The board is the carried fork under claude/coder-fleet/board (AGENTS.md: ported by hand, LICENSE and NOTICE intact); its tests live there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A comment, a criterion tick and a label on a card in .boards/completed/ succeed through the CLI, MCP task_edit and the web PUT; the card stays in completed/ with status Done and no status callback fires
- [ ] #2 A status change on a completed card is refused with a message saying it is completed: the CLI exits non-zero, MCP returns isError, the web returns 400
- [ ] #3 A missing id exits non-zero from the CLI and returns isError from MCP, pinned by tests
- [ ] #4 task-edit-completed.test.ts failed first as listed, now passes, and is in BOARD_TESTS; core.test.ts:148-159 is rewritten; full-suite counts match the baseline plus the new passes
- [ ] #5 board/package.json is at 0.1.5, bin/board --version prints it, and the kickoff installer note holds
- [ ] #6 NOTICE.md records the divergence; check-all passes locally; the PR notes CI cannot prove the board tests (CF-29)
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 06:31
---
Plan docs/plans/CF-26.md approved by the human 2026-09-27, every open question on the recommended answer. Card brought into line with the plan: criteria replaced by the plan's Done when (the plan wins). Phase 1 of 1 starting now: a coder on branch cf-26-27-completed-edit, CF-27 follows on the same branch.
---

author: @SubagentStop
created: 2026-09-27 06:51
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree confirmed (`--git-common-dir` is the main `.git`, the top level is the worktree) and clean. Fetched, cut `cf-26-27-completed-edit` from `origin/main`, and unset its upstream so a bare push can't reach `main`. Nothing pushed.
- `787cfe3` "Add the approved CF-26 plan": `docs/plans/CF-26.md`, byte-identical to the main checkout's copy (checked with `cmp`).
- Phase 0 baseline: `bun install --frozen-lockfile` passed. The full suite (`bun test --timeout=10000`, background, exit 1) gave 1457 pass, 4 fail, 3 errors, 1461 tests across 146 files.
- Baseline named failures: `mcp-server.test.ts` (McpServer bootstrap) and `packaging-bin.test.ts` (bin wrapper).
- Baseline unhandled errors: `cli-launcher.test.ts` and `resolveBinary.test.ts` (both missing `scripts/resolveBinary.cjs`), plus a leaked jsdom `dispatchEvent` error printed under `dependency.test.ts`.
- Phase 1 red run: `bun test --timeout=10000 src/test/task-edit-completed.test.ts src/test/core.test.ts`, exit 1, 52 pass, 12 fail. Failing: (a), (b), (c), (d), (e), (g), (h), (j), (k), (m), (n) and the rewritten core test "edits a completed-only task in place while refusing a status change". For every red test, the change that makes it fail is the pre-fix code.
- Passing before the fix: (f), (i) and (l), as the plan expected. They are regression pins.
- Deviation from the plan: (e) failed red rather than passing trivially, because my test lets the edit's rejection surface instead of catching it. It also runs a positive control first: a real status change on an active card must create the marker file.
- Phase 2, `f194381` "Let board task edit reach completed cards, refusing only a status change": `task-identity-index.ts` adds `resolveCompletedForMutation`, and `content-store.ts` adds `resolveCompletedTaskForMutation` with the no-index fallback.
- Also in `f194381`, `backlog.ts` adds the exported `CompletedTaskStatusError`, `loadCompletedTaskForMutation` (including the `includeCrossBranch === false` branch) and the private `updateCompletedTaskFromInput`. That path locks, re-reads, applies with a status check, sets `updatedDate` only on relevant changes, writes with `saveTask` (path kept), calls `refreshCompletedTask`, and commits only that file. It never calls the status callback.
- Also in `f194381`, `updateTaskFromInput` falls back to the completed lookup only after the existing lookup says not-found. `editTaskOrDraft`'s Draft branch now falls through to `updateTaskFromInput` when no active card exists, so a Draft request on a completed card gets the completed message.
- The refusal message is built from `backlogDirName` plus the file's folder, not a literal. I avoided `relative(rootDir, …)` because of the macOS `/tmp` realpath issue noted at `backlog.ts:1174`.
- Also in `f194381`: `core.test.ts:148-159` is rewritten to the new expectation, and the new file `src/test/task-edit-completed.test.ts` holds cases (a) to (n). Test (b) pins the exact message.
- Phase 2 green run: the same command, exit 0, 64 pass, 0 fail.
- The plan's regression set (mcp-tasks, mcp-task-complete, content-store, cli-board, cli-board-behaviour, server-tasks-spa-fallback, cleanup) gave 152 pass and 1 fail: `content-store.test.ts > refreshes completed identity state when the completed corpus changes` (watcher timeout, exit 1).
- Rerunning `content-store.test.ts` alone on the same code gave 67 pass, 0 fail, exit 0. That is two runs with different outcomes, so it's an intermittent failure. The test only calls `resolveTaskForMutation`, which this change doesn't touch.
- `bun run check:types` (`tsc --noEmit`) passed with exit 0.
- `bun run check` does not run: biome stops with "couldn't find an ignore file" (`vcs.useIgnoreFile` with no ignore file in `board/`). That predates this work. Instead I ran `bun --cwd=<board> run node_modules/@biomejs/biome/bin/biome check --vcs-enabled=false` on the five changed files: "Checked 5 files … No fixes applied", exit 0.
- Mutation check on the status comparison: changing `canonical.toLowerCase() === currentStatus.toLowerCase()` to `canonical === status` was killed by (b), (d), (h), (k) and (n) (exit 1), then reverted with `git restore`. It was the only mutation I tried.
- Phase 3, `8fd9765` "Run the completed-edit board tests in check-all": adds the new file to `BOARD_TESTS` in `claude/evals/lib/check-all.sh`.
- Phase 3, `7d857f6` "Record the completed-edit divergence in NOTICE.md and bump the board to 0.1.5": a new "Behaviour changed after import" section in `claude/coder-fleet/board/NOTICE.md`, and `board/package.json` 0.1.4 to 0.1.5. `plugin.json` and `marketplace.json` are untouched (still 0.27.0).
- `bash <wt>/claude/coder-fleet/board/build.sh <wt>/claude/coder-fleet/board/bin/board` printed "built … (0.1.5)", and `bin/board --version` prints `0.1.5`. A rerun of `bun install --frozen-lockfile` after the bump reported "no changes".
- check-all ran once at HEAD `7d857f6`, output in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf-26/check-all.txt`. Result: "Every deterministic check passes", with board at 82 pass and 0 fail across 12 files.
- Full suite after the change, run 1 at `7d857f6` (background, exit 1): 1470 pass, 5 fail, 3 errors, 1475 tests across 147 files. The extra failure was `dependency.test.ts > accepts an archived task as a dependency at create and edit time`: `archiveTask(...).success` was false, surrounded by the same leaked jsdom errors the baseline shows in that file.
- `dependency.test.ts` rerun alone at `7d857f6`: 25 pass, 0 fail, exit 0.
- Full suite after the change, run 2 at `7d857f6` (foreground, exit 1): 1471 pass, 4 fail, 3 errors, 1475 tests across 147 files. That's the baseline plus exactly the 14 new passes, with the same four pre-existing failures. The dependency failure is intermittent by the glossary's definition. `archiveTask` goes through `loadTaskForMutation`, which is unchanged.
- `git status --short` is empty at the end: no `claude/coder-fleet/board/tmp/` litter. The new tests use `mkdtemp` under the OS tmpdir. `.boards/` is untouched.
---

author: @lead
created: 2026-09-27 06:51
---
Phase 1-3 built on branch cf-26-27-completed-edit at 7d857f6 (not pushed). A card in completed/ now takes comments, criterion ticks and labels in place; a status change on it is refused with CompletedTaskStatusError. New tests: src/test/task-edit-completed.test.ts cases (a)-(n), 11 red before the fix and 64/64 green after; core.test.ts:148-159 rewritten. check-all green locally; board 0.1.4 -> 0.1.5, plugin version untouched. Criteria stay unticked until review, the refuter and the merge. Filed from the handoff: CF-38 (modal Complete on a completed card), CF-39 (biome lint broken), CF-40 (two intermittent board tests). Next: CF-27 on the same branch.
---
<!-- COMMENTS:END -->
