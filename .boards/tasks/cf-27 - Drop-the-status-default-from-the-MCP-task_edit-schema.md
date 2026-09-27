---
id: CF-27
title: Drop the status default from the MCP task_edit schema
status: In Progress
assignee: []
created_date: '2026-09-27 03:15'
updated_date: '2026-09-27 07:04'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - claude/coder-fleet/board/src/mcp
  - docs/plans/CF-27.md
  - 'https://github.com/rzem-ai/coder-fleet/issues/12'
priority: Medium
type: bug
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#3, point 6 (taint: external; restated). The board MCP server's task_edit schema declares `status` with `"default": "To Do"` (visible in the tool schema the lead loads). If the server applied it to an edit that omits status, every comment or criterion tick would silently move a column, which board-conventions forbids. Partial evidence it is not applied: on 2026-09-27 the lead called task_edit on CF-8 about six times without a status while the card was in Blocked by human, and it stayed there. Unverified for a card in Done or .boards/completed/. Remove the default from the edit schema (task_create may keep its own), and add a test that an edit naming no status leaves every status unchanged, including Done.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 task_edit's listed input schema has no default on status, and task_create's is still To Do
- [ ] #2 mcp-task-edit-status.test.ts edits a card in each of the five columns and a completed card without naming a status; every status stays the same through the real server and through a default-filling client; the client part and the flipped mcp-tasks.test.ts:773 failed first
- [ ] #3 The test file is in BOARD_TESTS, check-all passes locally, and the full-suite counts match the baseline plus the new passes
- [ ] #4 The board version is bumped (shared 0.1.5 with CF-26), and the PR notes CI cannot prove the board tests (CF-29)
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 06:31
---
Plan docs/plans/CF-27.md approved by the human 2026-09-27, every open question on the recommended answer. Card criteria replaced by the plan's Done when. Runs after CF-26 on the same branch.
---

author: @SubagentStop
created: 2026-09-27 06:58
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- Q1 (Issue #7, CF-31 branch): `claude/coder-fleet/skills/handoff/SKILL.md` — `Blocker:` defined as `a question only the human can answer... Write it as that question, ending in "?"` and `A finding is never a blocker however serious it is... it goes in your report and under Done`; `agents/reviewer.md` Handoff section — `A defect that must be fixed before merge stays in your ranked findings and also gets a Done bullet, "- must fix: <file>:<line> - <what breaks>"`; `agents/refuter.md` Handoff section — `Each surviving mutation that changes behaviour... gets its own Done bullet, "- survived: <the exact edit> - <the behaviour no test noticed>"`. (a) and (b) of the proposal are covered by these quotes. (c), the Low-finding rule (test hygiene, misnamed test, stale comment, unconfirmed value fixed-or-dropped-never-filed), is not present in any of the three files — grepped `-i "low|hygiene|misnamed|stale comment|unconfirmed"` in all three with no genuine hits.
- Q2 (Issue #8): `docs/specs/CF-25.md` Q7 — `The hook moves the item as it does today, and marks an action whose ask is not phrased as a question`; Q15 — `The flag is the fixed prefix "[not a question] " on any action whose text does not end in "?"`; criterion 2 — `An action whose text does not end in "?"... is stored with the prefix... For SubagentStop, the item moves to Blocked by human in both cases.` Main's `claude/coder-fleet/hooks/board-subagent-stop.sh:361-367` — `if [ -n "$blockers" ]; then ... board_write "$HOOK" "$page_id" "$BOARD_COL_BLOCKED_HUMAN" "$comment"` shows no question-mark check exists yet; the spec proposes the mechanism, the hook on main doesn't implement it. Partly covered.
- Q3 (Issue #9): `agents/lead.md` step 4 — `A refuter round is 20 minutes and a hook stops it at 25, so never brief one with a longer budget`, matching `hooks/agent-clock.sh`'s `clock_caps refuter) printf '1200 1500'`. No mutant-count cap of 8 appears anywhere in `lead.md`, `refuter.md`, or `agent-clock.sh`. Tiering: `lead.md` step 4 — `A diff touching authentication, authorisation, secrets or credentials gets a deeper review... Spawn refuter against the change` ties refuter to that path set but doesn't restrict it to only those paths or to items marked High. Time cap covered; mutant cap not covered; tiering partly covered.
- Q4 (Issue #10): `.boards/tasks/cf-30 - Keep-a-resumed-subagent-bound-to-the-item-it-started-on.md` — `A SendMessage resume re-fires SubagentStart, which rebinds the agent to whatever ".boards/.focus" says at resume time, not the item it was spawned on... Fix in the hook: on SubagentStart for an agent id that already has a binding record, keep the first binding and log the focus mismatch`, status `To Do`, unimplemented. `hooks/board-subagent-start.sh` unconditionally does `board_write "$HOOK" "$page_id" "$col"` on every SubagentStart, with no keep-first-binding guard on main. `hooks/agent-clock.sh` comment confirms a resume re-fires SubagentStart (`"SendMessage re-fires SubagentStart for the same agent id (hooks.log shows one spec-writer id started six times)"`). CF-30 is the open fix; not yet built.
- Q5 (Issue #11): `docs/specs/CF-24.md` criterion 3 — `lead.md step 3 says what the lead does at plan approval: append the plan's "Done when" items to the card's Definition of Done after the defaults... bring the card into line with the plan, making each plan phase not covered by a criterion either a criterion or a sub-issue`; criterion 4 — `lead.md says the lead posts exactly one comment at each phase start and each merge`; criterion 1/Q1 — `Only the lead ticks, and only once a criterion is proven on main, naming the test that proves it`. All three sentences are covered by the spec but absent from main's `agents/lead.md` (read in full — no "Done when", no phase-comment rule, no tick-on-proof rule).
- Q6 (Issue #13): `claude/coder-fleet/commands/prune-worktrees.md` step 6 — `Sweep the scratch directories... delete the entry only if its name matches none of them... "rm -rf" is fine there - it is per-session temp space, never work.` No script implements this exists yet (only `.boards/tasks/cf-41 - Ship-prune-worktrees-as-a-tested-script.md` proposes building one). Contract tests live under `claude/evals/lib/`; smallest is `final-message.sh` (66 lines), quoted in full during research.
- Q7 (Issue #14): `commands/kickoff.md` — `Its "statuses" are the five the fleet uses... Any other word is a failure, and the fix is the config rather than a "BOARD_COL_*" override in "~/.config/coder-fleet/board.env" - the override leaves every other reader seeing the odd name.` `board.env`/`BOARD_COL_*` referenced in `enforce-agent-scope.sh:834,880` (deny messages) and used as sourced variables (`$BOARD_COL_DONE`, `$BOARD_COL_BLOCKED`, etc.) in `board-task-completed.sh`/`board-subagent-stop.sh`. `commands/board.md` — `A "board <cmd> failed (exit N): ..." line in "~/.local/state/coder-fleet/log/hooks.log"` is the documented symptom of a failed move; the failure is logged, not written to the card.
- Q8 (Issue #15): `board/src/mcp/tools/serve/index.ts` quoted in full (49 lines) — `board_serve` calls `server.startWebUi()`, `board_url` calls `server.webUiStatus()`, both defined on the imported `McpServer` from `"../../server.ts"`. `commands/board.md` quoted in full — step 1: `Call the "board_serve" tool... It starts the UI if it is not already running and returns {running, url, host, port}`. Test file confirmed: `board/src/test/mcp-serve.test.ts`.
---

author: @SubagentStop
created: 2026-09-27 07:03
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- `78d8f10` "Add the approved CF-27 plan": `docs/plans/CF-27.md`, byte-identical to the main checkout's copy (checked with `cmp`).
- Phase 1: changed the edit-default assertion in `src/test/mcp-tasks.test.ts` (formerly `:773`) to `expect(editStatusSchema?.default).toBeUndefined()` and left the create assertion as it was. Added `src/test/mcp-task-edit-status.test.ts` with the `fillSchemaDefaults` helper and cases (a), (b) and (c): one card in each of the five columns, plus a sixth Done card completed through `task_complete`.
- First red run: `bun test --timeout=10000 src/test/mcp-task-edit-status.test.ts src/test/mcp-tasks.test.ts`, exit 1, 38 pass, 3 fail. Failing: "exposes status enums and defaults from configuration", (a), and (c) with TASK-2 to TASK-5 (In Progress, Blocked, Blocked by human, Done) all moved to To Do.
- Deviation from the plan: in that first run the completed card did not fail (c). With CF-26 in place, the filled-in "To Do" is refused, so its status holds, but the comment the client meant to add is lost. I changed (c) to also require that each edit is not refused.
- Second red run, same command: exit 1, 38 pass, 3 fail. The same three tests fail, and (c) now also names TASK-6 (completed) as `refused: true`. (b) passed on all six cards, as the plan predicts after CF-26. For every red case, the change that makes it fail is the schema's `default: "To Do"` on `task_edit.status`.
- Phase 2, `8297a1e` "Drop the status default from the MCP task_edit schema": `generateStatusFieldSchema(config, { includeDefault = true } = {})` in `src/mcp/utils/schema-generators.ts`. `generateTaskEditSchema` passes `{ includeDefault: false }`, and the edit description ends with "Omit to leave the status unchanged." `task_create` is unchanged.
- Green run, same command: exit 0, 41 pass, 0 fail. After a formatter-only change to the test file it was rerun: exit 0, 41 pass, 0 fail.
- The plan's MCP regression set (mcp-server, mcp-drafts, mcp-task-type-filtering, mcp-task-project-filtering) gave exit 1, 21 pass, 1 fail. The failure is "McpServer bootstrap > createMcpServer wires stdio-ready instance", with the same diff as the Phase 0 baseline: the tool list has extra `board_serve`, `board_url` and `task_focus`. It has nothing to do with the status schema.
- `bun run check:types` passed with exit 0.
- Biome, using the CF-26 workaround rather than `bun run check` (CF-39): `bun --cwd=<board> run node_modules/@biomejs/biome/bin/biome check --vcs-enabled=false` on `schema-generators.ts`, `mcp-task-edit-status.test.ts` and `mcp-tasks.test.ts`. The first run flagged the formatting of one function signature; after fixing it: "Checked 3 files … No fixes applied", exit 0.
- Phase 3, `f112d28` "Record the task_edit status divergence and run its tests in check-all": one new bullet in the "Behaviour changed after import" section of `claude/coder-fleet/board/NOTICE.md`, and `src/test/mcp-task-edit-status.test.ts` added to `BOARD_TESTS` in `claude/evals/lib/check-all.sh`. The board stays at 0.1.5, and `plugin.json` and `marketplace.json` are untouched (0.27.0).
- `build.sh` printed "built … bin/board (0.1.5)", and `bin/board --version` prints `0.1.5`.
- check-all ran once at HEAD `f112d28`, output in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf-26/check-all-cf27.txt`. Result: "Every deterministic check passes", with board at 85 pass and 0 fail across 13 files.
- Full suite once at `f112d28` (background, exit 1): 1474 pass, 4 fail, 3 errors, 1478 tests across 148 files. The Phase 0 baseline was 1457 pass, 4 fail, 3 errors across 146 files, so this is the baseline plus 14 passes from CF-26 and 3 from CF-27, with the same two named failures (`mcp-server.test.ts` bootstrap, `packaging-bin.test.ts`) and the same three unhandled errors. content-store and dependency passed this time, so there was nothing to rerun.
- `git status --short` is empty: no `claude/coder-fleet/board/tmp/` litter, and `.boards/` untouched. Nothing pushed.
---

author: @lead
created: 2026-09-27 07:04
---
Phases 1-3 built on cf-26-27-completed-edit at f112d28 (not pushed): task_edit lists no status default, task_create still defaults to To Do. mcp-task-edit-status.test.ts (a)/(b)/(c) with fillSchemaDefaults; red first on the flipped mcp-tasks assertion, (a), and (c) for In Progress, Blocked, Blocked by human, Done and the completed card; green 41/41. check-all green (board 85/0 across 13 files); full suite = baseline + 17. Next: one reviewer over CF-26 and CF-27 together, then a refuter, then one PR. Not filed: task_create following default_status - the approved plan's answer to open question 1 was to leave it unless the human asks.
---

author: @lead
created: 2026-09-27 07:04
---
Comment #2 does not belong to CF-27: it is a scout's coverage map for GitHub issues #7-#15, spawned while CF-27 was focused (the lead's mistake - the focus should have been cleared for work that is not the item's). Its content is recorded on CF-30, CF-44 and CF-45 and in the issue comments.
---
<!-- COMMENTS:END -->
