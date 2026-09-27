---
id: CF-42
title: Make kickoff check board.env against the board config
status: To Do
assignee: []
created_date: '2026-09-27 06:56'
updated_date: '2026-09-27 07:14'
labels: []
dependencies:
  - CF-30
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/14'
  - claude/coder-fleet/commands/kickoff.md
  - docs/plans/CF-42.md
priority: Medium
type: bug
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#14 (read as data). kickoff compares .boards/config.yml to the fleet's status spelling but never reads ~/.config/coder-fleet/board.env. In Fathom a BOARD_COL_DOING override naming a status the config did not have made every SubagentStart move fail with `invalid status`, and no card moved for a week with nothing reporting it. Kickoff should read both and warn or refuse when they disagree; a failed hook move could also reach the card as a comment.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A failed status write puts one comment on the card per session per item and column, and never writes a column; the R18 cases failed first and now pass
- [ ] #2 board-env-check.sh runs at session start, names every BOARD_COL_* override the config does not list, is silent and makes no calls with no override, and prints nothing from board.env beyond those values; the R19 cases failed first and now pass
- [ ] #3 Kickoff reports a mismatch as a Board-step failure with the fix and never tries to read board.env
- [ ] #4 The hooks README, fleet-design.md and board-conventions describe both; check-all.sh passes, run once, and the plugin patch is bumped in the last commit
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-42.md approved by the human 2026-09-27, every open question on the recommended answer. Criteria replaced by the plan's Done when. Build waits for CF-30 to merge: both change hooks/lib/board.sh, the contract stub and the hooks README.
---
<!-- COMMENTS:END -->
