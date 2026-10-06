---
id: CF-141
title: Check the lead can read the Next column top card first
status: Done
assignee: []
created_date: '2026-10-06 02:08'
updated_date: '2026-10-06 09:02'
labels: []
dependencies:
  - CF-140
priority: Medium
type: task
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-140 coder (2026-10-06). CF-140 tells the lead to take Next cards top of the column first, by ordinal. Nobody has checked that task_list --status Next (MCP or CLI) returns cards in ordinal order, so the rule may not work in practice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test shows task_list filtered to Next returns cards in ascending ordinal order, or the lead body names the call that does
- [x] #2 The lead's Next rule in lead.md names how it reads the order
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-06 02:10
---
The human ordered this on 2026-10-06: "go on CF-141 too". Sequencing: a scout answers now whether task_list filtered to a status returns cards by ordinal. The coder starts after CF-140's PR #60 merges, because both change the Next rule in lead.md step 3.
---

author: lead
created: 2026-10-06 02:10
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-2.

Done: nothing yet.
Not done: we don't know yet whether the lead sees Next cards in your drag order; the test and the lead.md line wait for CF-140 to merge.
---

author: @SubagentStop
created: 2026-10-06 02:11
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- MCP `task_list` sorts each status bucket by ordinal, then priority, then id. In `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/board/src/mcp/tools/tasks/handlers.ts:334` the line is `const sortedBucket = sortByOrdinalAndPriority(bucket, priorities);`.
- MCP `task_list` applies `limit` after the sort, at `handlers.ts:335` with `.slice(0, remaining)`, so `limit` keeps the top of the ordinal order.
- MCP `task_list` prints one section per status, in `config.statuses` order. Each section starts with `` `${status || "No Status"}:` ``, then one `formatTaskSummaryLine(task)` per card in sorted order. The drafts branch uses the same sort at `handlers.ts:240`.
- The sort is `sortByOrdinalAndPriority` in `board/src/utils/task-sorting.ts`. Cards with an ordinal come first: "`// Tasks with ordinal come before tasks without`". When both have one it is ascending: `return a.ordinal - b.ordinal;`.
- In the same function, ties go to priority, high first: "`// Same ordinal (or both undefined) - sort by priority`". Remaining ties go to id, compared numerically so task-2 comes before task-10: "`// Same priority - sort by task ID`". Ordinal is first and priority only breaks ties.
- The CLI `task list --status X --plain` is at `board/src/cli.ts:225-249` and has no sort of its own. It calls `c.queryTasks({... filters: { status: statuses ...}})`, then `loadTaskListItems(c, tasks)`. It prints `for (const t of items) console.log(`${t.id}  ${t.status}  ${t.title}`);` at line 247, with no ordinal or priority in the output.
- `queryTasks` in `board/src/core/backlog.ts:783-834` only filters and slices. With no search query it returns `applyFiltersAndLimit(store.getTasks())` at line 831.
- `getTasks` in `board/src/core/content-store.ts:506` starts from `this.cachedTasks`, which is built with `sortByTaskId(Array.from(this.tasks.values()))` at lines 630 and 1560. `--limit N` slices that id-ordered list (`backlog.ts:806-807`), so it does not take the top by ordinal.
- `cli.ts` has no `ordinal` option and no mention of `ordinal`. Inferred, not observed: the CLI prints in numeric id order.
- The web board orders a column with `sortTasksForStatus` at `board/src/web/lib/lanes.ts:205`. Cards with an ordinal come first (lines 209-215), then ascending ordinal: `return a.ordinal - b.ordinal;` (line 219).
- In `sortTasksForStatus`, ties and cards without an ordinal go by `createdDate`, oldest first. If the status name contains "done" or "complete", they go by `updatedDate || createdDate`, newest first. It does not use priority or id. It is called at `lanes.ts:263` and `lanes.ts:383`.
- Compared with the MCP sort, the web and MCP orders agree on ordinal ascending with ordinal-less cards last. They differ only on ties: MCP uses priority then id, the web uses created date.
- The test "creates, edits, lists, and views tasks with ordinal" starts at `board/src/test/mcp-tasks.test.ts:1094`. It makes A (ordinal 20, low), B (ordinal 10, high) and C (no ordinal, medium), then asserts B appears before A, and A before C, in the `task_list` text.
- The test "applies task_list limit after ordinal-aware sorting" is at about `mcp-tasks.test.ts:1150`. It makes TASK-1 with ordinal 2000 and TASK-2 with ordinal 1000, lists with `limit: 1`, and asserts the output contains "`TASK-2 - Limited ordinal first by order`" and not "`TASK-1 - Limited ordinal later id`".
- I found no test that pins the CLI `task list` order by ordinal. In `cli-board-behaviour.test.ts` and `cli-board.test.ts`, the only "order" matches are at lines 12 and 90 of `cli-board-behaviour.test.ts`, and neither is about list ordering.
---

author: lead
created: 2026-10-06 02:11
---
Scout finding, 2026-10-06 (read from the source, not run). The MCP task_list sorts each status by ascending ordinal; ties go to priority, then id; limit applies after the sort (handlers.ts:334-335, utils/task-sorting.ts). Two existing tests pin this: mcp-tasks.test.ts:1094 and ~1150. The CLI `task list --status X --plain` (cli.ts:225-249) does not sort; it prints in id order, and --limit cuts that id-ordered list. The web board also sorts by ordinal but breaks ties by created date. So the lead sees Next top card first through the MCP task_list, but not through the board.sh fallback used when the MCP tools are missing. The coder's brief, once PR #60 merges: name task_list in lead.md's Next rule, add an MCP test listing a Next status, and decide the CLI fallback (sort by ordinal there, or say in lead.md it is not ordered).
---

author: lead
created: 2026-10-06 07:01
---
2026-10-06: CF-140 is merged (v0.34.0). This card's two criteria are lead.md and test changes in the serial lead.md track, so they ride in CF-144's coder brief (after CF-147, the skill rename) rather than a spawn of their own: name task_list in the lead's Next rule, pin the within-status ordinal order with an MCP test that lists a Next status, and say in lead.md that the board.sh CLI fallback lists by id, not ordinal. No coder has started on this card itself.
---

author: lead
created: 2026-10-06 07:22
---
Sub-issue 1 of 1: merged to main as a rider in CF-144's PR #64 (v0.36.0). Done still needs: the close.

Ticks. #1: test 'lists a Next status in ascending ordinal order, not by id or priority' in board/src/test/mcp-tasks.test.ts; it failed with the ordinal comparison in task-sorting.ts disabled and passes on the real sort (39/0 in the file). It is not in check-all's BOARD_TESTS subset, so it is proven by the coder's direct run; adding the file to the gate is held as a proposal against CF-56's budget. #2: lead.md's Next rule names the MCP task_list as the order and says the board.sh fallback lists by id. DoD #1 check-all exit 0 and CI green on PR #64. #2 lead's read, no refuter (prose plus one test), under the human's rule. #3 the migration-checklist table in PR #64. #4 v0.36.0. #5 the CF-144 Deferred row covers lead.md. #6 not applicable.

Done: the lead reads Next top card first through task_list, and the order is pinned by a test.
Not done: the close.
---
<!-- COMMENTS:END -->
