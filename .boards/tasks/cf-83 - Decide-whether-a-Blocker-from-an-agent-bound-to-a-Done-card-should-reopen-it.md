---
id: CF-83
title: Decide whether a Blocker from an agent bound to a Done card should reopen it
status: To Do
assignee: []
created_date: '2026-09-30 04:15'
labels:
  - hooks
dependencies:
  - CF-48
priority: Low
type: bug
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-48 review, 2026-09-30. After CF-48, SubagentStart never moves a Done card. SubagentStop's Blocker branch (claude/coder-fleet/hooks/board-subagent-stop.sh:374-391) still moves a Done card to Blocked by human when the bound agent's handoff carries a Blocker line. With the last-item fallback gone, only an explicit focus, a Board-Item line or CODER_FLEET_BOARD_PAGE_ID can bind a Done card. A leftover CODER_FLEET_BOARD_PAGE_ID in a shell would still bind every spawn to a finished card and reopen it on any Blocker, the same kind of damage as the fathom FTH-56 case. The question for the human: should a Blocker on a Done card move it into the human queue, or only comment and leave it Done?
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The human's decision is recorded on this card
- [ ] #2 SubagentStop's Blocker branch follows that decision for a Done card, with a contract case in claude/evals/lib/board-hook-contract.sh
- [ ] #3 board-conventions and hooks/README.md describe it; bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
