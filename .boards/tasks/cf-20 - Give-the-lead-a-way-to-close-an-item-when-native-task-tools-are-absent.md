---
id: CF-20
title: Give the lead a way to close an item when native task tools are absent
status: To Do
assignee: []
created_date: '2026-09-27 02:36'
updated_date: '2026-09-28 06:15'
labels: []
dependencies: []
references:
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/hooks/board-task-completed.sh
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - docs/plans/CF-20.md
priority: High
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

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-27 23:46
---
Triage 2026-09-28: tracked as point 7 of GitHub issue #3 and raised to High. Five shipped items (CF-6, CF-8, CF-9, CF-23, CF-31) sit outside Done on this board as evidence; move them once this lands.
---

author: lead
created: 2026-09-28 06:15
---
Cause found 2026-09-28, with evidence in docs/plans/CF-20.md: Claude Code 2.1.283 turns off TaskCreate and TaskUpdate for every model outside a legacy list (Claude 3.x, Opus 4.0 to 4.7, Sonnet 4.0 to 4.6, Haiku 4.5) unless CLAUDE_CODE_ENABLE_TODO_TOOLS is set. The lead runs on Opus 5.5, so the only route to Done never fires. The session init tool lists confirm it for Opus 5.5 and Sonnet 5, set and unset, and setting the variable through project settings env works. The plan is drafted and awaiting approval.
---
<!-- COMMENTS:END -->
