---
id: CF-98
title: >-
  Make board-backfill.sh resolve column names and the criteria opt-out like the
  hooks do
status: To Do
assignee: []
created_date: '2026-09-30 09:32'
labels:
  - board
dependencies:
  - CF-24.2
  - CF-24.3
priority: Medium
type: bug
ordinal: 129000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-24.2 round-2 review, 2026-09-30. (1) board-backfill.sh reads BOARD_COL_DONE only from the environment, while the hooks also read $CODER_FLEET_CONFIG_DIR/board.env (hooks/lib/board.sh:63-72). A board whose Done column is renamed only in board.env is refused with a message that never names board.env. Worse, if the board has both a 'Done' status and a renamed final column, the guard passes and the real final column's items get edited. (2) Once CF-24.3 adds the require-criteria config key (Q16), the script's no-defaults path should skip provisional criteria on a board that has turned it off.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 board-backfill.sh resolves BOARD_COL_DONE from the environment, then board.env, exactly as hooks/lib/board.sh does, with a contract case for a column renamed only in board.env
- [ ] #2 With the CF-24.3 require-criteria key off, the script adds no provisional criteria, with a contract case
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
