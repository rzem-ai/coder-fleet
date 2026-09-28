---
id: CF-48
title: Stop an unfocused spawn binding to the session's last item
status: To Do
assignee: []
created_date: '2026-09-27 07:39'
labels: []
dependencies:
  - CF-30
references:
  - claude/coder-fleet/hooks/board-subagent-start.sh
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/agents/lead.md
priority: Medium
type: bug
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-30 reviewer, 2026-09-27 (pre-existing since the import, c094a3d). board-subagent-start.sh:86-88 binds a first start to sessions/<sid>/last-item whenever the focus is empty. So once a session has bound anything, clearing the focus does not stop a scout or any unrelated spawn binding to that item: its SubagentStop comments land on it and a Blocker moves it. This contradicts board-conventions ("an unfocused checkout moves nothing"), lead.md step 6 ("clear the focus before work that is not the item's") and the lead's own practice. With CF-30 the binding is also kept across the spawn's resumes, and CF-30's unbound record (its design decision 3) is only reached in a session that has never bound anything.

Decide: drop the last-item fallback for SubagentStart (TaskCompleted no longer reads it, per the reviewer), or keep it and say plainly in board-conventions and lead.md that clearing the focus is not enough. A contract case either way: bind BD-1, clear the focus, start a new agent, and assert what happens.
<!-- SECTION:DESCRIPTION:END -->
