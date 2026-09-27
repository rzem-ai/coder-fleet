---
id: CF-26
title: Make board task edit reach completed cards or fail loudly
status: In Progress
assignee: []
created_date: '2026-09-27 03:15'
updated_date: '2026-09-27 06:31'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - claude/coder-fleet/board
  - docs/plans/CF-26.md
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
- [ ] #1 A comment, a criterion tick and a label on a card in .boards/completed/ succeed through the CLI, MCP task_edit and the web PUT; the card stays in completed/ with status Done and no status callback fires
- [ ] #2 A status change on a completed card is refused with a message saying it is completed: the CLI exits non-zero, MCP returns isError, the web returns 400
- [ ] #3 A missing id exits non-zero from the CLI and returns isError from MCP, pinned by tests
- [ ] #4 task-edit-completed.test.ts failed first as listed, now passes, and is in BOARD_TESTS; core.test.ts:148-159 is rewritten; full-suite counts match the baseline plus the new passes
- [ ] #5 board/package.json is at 0.1.5, bin/board --version prints it, and the kickoff installer note holds
- [ ] #6 NOTICE.md records the divergence; check-all passes locally; the PR notes CI cannot prove the board tests (CF-29)
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 06:31
---
Plan docs/plans/CF-26.md approved by the human 2026-09-27, every open question on the recommended answer. Card brought into line with the plan: criteria replaced by the plan's Done when (the plan wins). Phase 1 of 1 starting now: a coder on branch cf-26-27-completed-edit, CF-27 follows on the same branch.
---
<!-- COMMENTS:END -->
