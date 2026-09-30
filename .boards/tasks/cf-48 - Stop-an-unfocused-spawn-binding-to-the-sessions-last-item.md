---
id: CF-48
title: Stop an unfocused spawn binding to the session's last item
status: To Do
assignee: []
created_date: '2026-09-27 07:39'
updated_date: '2026-09-30 03:56'
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

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SubagentStart (claude/coder-fleet/hooks/board-subagent-start.sh) has no session last-item fallback: with no resume record, no Board-Item line, no focus and no CODER_FLEET_BOARD_PAGE_ID, a new agent binds nothing and moves nothing. Contract case in claude/evals/lib/board-hook-contract.sh: bind BD-1, clear the focus, start a new agent, assert it binds nothing and moves nothing
- [ ] #2 SubagentStart never moves the column of a Done item, whatever binds it. Contract case: bind an agent to a Done item and assert its column stays Done
- [ ] #3 sessions/<sid>/last-item: every reader is checked, TaskCompleted included. If none is left, the write in hooks/lib/board.sh (~line 189) is removed; if one is left, the handoff names it and the write stays
- [ ] #4 SubagentStop's log lines in hooks.log carry the agent id and the item it comments on (or say it bound none); a contract case asserts both appear
- [ ] #5 skills/board-conventions/SKILL.md (lines 53 and 59), agents/lead.md step 6 and hooks/README.md describe the new binding exactly; the phrase 'clearing the focus is not enough' and its equivalents appear nowhere
- [ ] #6 Gates: board-hook-contract.sh passes; the board package tests pass, with no failures beyond the pre-existing set tracked in CF-76; bash claude/evals/lib/check-all.sh passes; migration-checklist run over lead.md, with its result in the handoff
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead (fathom session)
created: 2026-09-30 03:51
---
30 Sep 2026, observed three times in the fathom repo (session fbe8b655): after task_focus clear, two scouts with no Board-Item bound to the session's last item (hooks.log 12017 'picked up FTH-004.1.2 (from the session's last item)'; 12459 'picked up FTH-56 (from the session's last item)') and their SubagentStop comments landed on those cards. Worse than this card says: the SubagentStart move also reopens a Done card - FTH-56, merged and closed at 03:33 UTC, was moved to In Progress by the 03:47 scout's start and had to be closed again through a [board:FTH-56] task. So the fallback can undo a finished item's column, not only misfile a comment. Alex (30 Sep) asked for this to be recorded here and the workflow-lane case filed separately.
---

created: 2026-09-30 03:56
---
The human ordered this on 2026-09-30, with these decisions: drop the last-item step from SubagentStart, so an unfocused checkout binds nothing, as board-conventions line 59 already promises. Keep last-item only if something else still reads it: check TaskCompleted, and remove the write in board.sh:189 if nothing does. Separately, SubagentStart must never move a Done item's column, whatever binds it. The fallback chain to keep, in order: resume record (~line 56), Board-Item line (104-115), focus file (119), CODER_FLEET_BOARD_PAGE_ID (125-127). The session last-item step (122) goes. `task_focus clear` (board/src/core/focus.ts:33-35) deletes only the focus file. Also, for both CF-48 and CF-80: SubagentStop logs the agent id and the item it comments on; docs are updated in board-conventions, lead.md step 6 and hooks/README.md. The work is split one sub-issue per card, with CF-48 first and CF-80 after it (CF-80 depends on CF-48, and both edit board-subagent-start.sh and the same docs). Released together as a patch version once both merge. Sub-issue 1 of 2 starting now.
---
<!-- COMMENTS:END -->
