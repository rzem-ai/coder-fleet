---
id: CF-26
title: Make board task edit reach completed cards or fail loudly
status: In Progress
assignee: []
created_date: '2026-09-27 03:15'
updated_date: '2026-09-27 05:43'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - claude/coder-fleet/board
priority: Medium
type: bug
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#3, point 5 (taint: external; restated here as the requirement). In the Fathom repo on 2026-09-27, `board.sh task edit FTH-001.12 --check-ac 1 ...` printed `Task not found: FTH-001.12` once the card had moved to `.boards/completed/`, and nothing changed; the lead only noticed on re-reading the file, because the exit status was lost through a pipe to `tail`. Decide whether `task edit` (CLI and MCP task_edit) should reach a completed card - ticking criteria and commenting after completion are normal, as the lead did on CF-8 and CF-6 after merge - or say plainly that completed cards are read-only; either way, "not found" must exit non-zero. The board is the carried fork under claude/coder-fleet/board (AGENTS.md: ported by hand, LICENSE and NOTICE intact); its tests live there.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 task edit on a card in .boards/completed/ either succeeds (criteria tick, comment) or fails with a message that says the card is completed and read-only
- [ ] #2 Any not-found or refused edit exits non-zero from the CLI and returns an error from MCP task_edit, proven by a board package test that fails first
- [ ] #3 The binary's version is bumped per the board package's convention and the installer note in kickoff still holds
<!-- AC:END -->
