---
id: CF-146
title: >-
  Make task_edit and task_create return a short acknowledgement instead of the
  whole card
status: In Progress
assignee: []
created_date: '2026-10-06 04:24'
updated_date: '2026-10-06 07:21'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board/src/mcp/tools/tasks/handlers.ts
priority: High
type: enhancement
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human on 2026-10-06 after the lead's session review. Every comment the lead appends with task_edit returns the full card, 55 to 67 KB on a long card, into the lead's context. Thirty of those in a session consume most of the lead's working memory with echoes of what it already knows. The board MCP server is the fork under claude/coder-fleet/board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MCP task_edit returns the task id, the names of the fields it changed, and the numbers of any comments or actions it appended, in under 500 characters
- [ ] #2 MCP task_create returns the task id, the title and the file path
- [ ] #3 task_view is unchanged and still returns the full card
- [ ] #4 Board tests cover both tool results and were seen failing first; NOTICE.md records the divergence from upstream; check-all is green and the version is bumped
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-06 07:02
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-4. Runs in parallel with CF-147 (different files); version 0.35.3 assumed, the second PR to merge rebases.

Done: nothing yet; task_edit still returns the whole card.
Not done: the short acknowledgement.
---

author: @SubagentStop
created: 2026-10-06 07:21
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- `task_create` now returns two lines: `Created task TASK-1: Short acknowledgements` then `File: <absolute path of the task file>`.
- `task_edit` now returns, for example, four lines: `Updated task TASK-1.` then `Changed: title, labels, acceptanceCriteria, comments, actionsForHuman.` then `Appended comment #1.` then `Appended actions #1-#2.`
- An edit that changes no value says `Changed: nothing.`, and a demotion or promotion names both ids: `Updated task TASK-1 (now DRAFT-1).`
- Upstream's dependency cleanup line is kept, as `Removed references to TASK-1 from TASK-2.`; with more than five ids it gives a count instead.
- A unit test pins the reply under 500 characters with every field changed, 50 comments, 20 actions and 200 cleaned ids.
- `task_view` and the archive, complete and demote tools are unchanged and still return the full card.
- Commit `5e01e48` "Make MCP task_edit and task_create return a short acknowledgement (CF-146)": the new text is built in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a596576873473cd38/claude/coder-fleet/board/src/mcp/utils/task-response.ts`, and `handlers.ts` takes a copy of the card before the edit and compares it with the card after.
- Same commit: the two tool descriptions in `index.ts` now say what they return and point at `task_view`.
- Same commit: new test file `board/src/test/mcp-task-ack.test.ts` (9 tests), added to `BOARD_TESTS` in `claude/evals/lib/check-all.sh`.
- Same commit: `board/NOTICE.md` records the divergence from upstream.
- Commit `8b43eb6` "v0.35.3: task_edit and task_create return a short acknowledgement (CF-146)" sets 0.35.3 in `plugin.json` and `marketplace.json`.
- Existing tests that read the old card text are updated with the same intent: each now checks the short reply and reads the card back with `task_view`. That covers `mcp-tasks.test.ts` (15 tests), `mcp-drafts.test.ts`, `mcp-refs-docs.test.ts`, `mcp-final-summary.test.ts`, `mcp-actions-for-human.test.ts` and `mcp-focus.test.ts`.
- One test's purpose had to be reversed: "renders every task result through the one plain serializer" asserted the edit result was the full card. It is renamed and now asserts the short reply.
- Callers checked: the hooks (`hooks/lib/board.sh`) and the `spec-to-card` workflow write through the board CLI, which does not use the MCP handlers.
- Callers checked: `review-round`, `deep-research`, the commands and the OpenCode port do not call either tool, and `lead.md` and `fleet-steward.md` only need the id back from `task_create`, which is still there.
- Tests seen failing first: against the old handlers, 8 of the 9 new tests failed. The `task_view` test passed, as it should, since it guards behaviour that does not change.
- Each updated assertion failed against the new code before I changed it: 24 failures across the affected files, then 0 apart from the one that also fails on main.
- Ran every board test file that mentions the two tools (38 files), before the change: 418 pass, 1 fail.
- Ran the same files after the change: 427 pass, 1 fail. The failure in both runs is `mcp-server.test.ts` "createMcpServer wires stdio-ready instance", whose expected tool list predates `board_serve`, `board_url`, `board_stop` and `task_focus`. It is not in the check-all set.
- `tsc --noEmit`: exit 0.
- Ran `biome check --vcs-enabled=false` with `--write` on the changed files. I reverted one import reorder it made in `handlers.ts` that has nothing to do with this change.
- `bash claude/evals/lib/check-all.sh`, once: exit 0, "Every deterministic check passes", board 300 pass, 0 fail.
- Pushed as `cf-146-task-ack`; PR #65 is open against main. I wrote no board column.
---
<!-- COMMENTS:END -->
