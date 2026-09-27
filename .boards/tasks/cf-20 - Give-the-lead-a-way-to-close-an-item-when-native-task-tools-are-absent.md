---
id: CF-20
title: Give the lead a way to close an item when native task tools are absent
status: To Do
assignee: []
created_date: '2026-09-27 02:36'
labels: []
dependencies: []
references:
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/hooks/board-task-completed.sh
priority: Medium
type: bug
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-09-27 closing CF-8 and CF-6 after PR #2 merged: the lead's session had no TaskCreate or TaskUpdate tools, so it could not complete a task whose subject carries [board:<id>], which is the only route the fleet allows to Done (TaskCompleted hook). The board MCP server's task_complete would move the card, but that is the lead writing a column, which the lead's invariants forbid. The item stays in its column until the human moves it by hand. Find out why the native task tools were absent (setting, harness version, agent definition's tools), and either make them reliably present for the lead or define a sanctioned fallback, recorded in board-conventions and lead.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of the missing task tools is identified with evidence
- [ ] #2 The lead can close a merged item without writing a column itself, or board-conventions names the human as the fallback and kickoff's preflight checks for the task tools
<!-- AC:END -->
