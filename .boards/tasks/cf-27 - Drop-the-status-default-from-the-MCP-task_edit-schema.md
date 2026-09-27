---
id: CF-27
title: Drop the status default from the MCP task_edit schema
status: In Progress
assignee: []
created_date: '2026-09-27 03:15'
updated_date: '2026-09-27 06:52'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - claude/coder-fleet/board/src/mcp
  - docs/plans/CF-27.md
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
<!-- COMMENTS:END -->
