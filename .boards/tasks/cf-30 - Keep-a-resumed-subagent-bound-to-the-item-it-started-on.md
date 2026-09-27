---
id: CF-30
title: Keep a resumed subagent bound to the item it started on
status: To Do
assignee: []
created_date: '2026-09-27 03:18'
updated_date: '2026-09-27 06:58'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-subagent-start.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - 'https://github.com/rzem-ai/coder-fleet/issues/10'
priority: Medium
type: bug
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by spec-writer (CF-24/CF-25 drafting). A SendMessage resume re-fires SubagentStart, which rebinds the agent to whatever `.boards/.focus` says at resume time, not the item it was spawned on. On 2026-09-27 a resumed CF-12 spec-writer bound to CF-8 and posted its blocker there (CF-8 comment #8). Today only a lead practice in memory covers it (focus the agent's own item before resuming). Fix in the hook: on SubagentStart for an agent id that already has a binding record, keep the first binding and log the focus mismatch. Note CF-23's clock uses the same keep-the-first rule for its own record.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A second SubagentStart for the same agent id keeps the original item binding and logs when the focus differs
- [ ] #2 A contract case fails first on the current hook: bind to A, change focus to B, re-fire start, then a Blocker: stop comments on A
- [ ] #3 board-conventions and lead.md drop the focus-before-resume workaround, or say it is no longer needed
<!-- AC:END -->
