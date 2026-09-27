---
id: CF-27
title: Drop the status default from the MCP task_edit schema
status: To Do
assignee: []
created_date: '2026-09-27 03:15'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - claude/coder-fleet/board/src/mcp
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
- [ ] #1 The task_edit input schema has no default for status
- [ ] #2 A board package test edits a card in each column (and a completed card, per the related item) without naming a status and asserts the status is unchanged, failing first if the default were applied
- [ ] #3 task_create's status default, if kept, is unaffected
<!-- AC:END -->
