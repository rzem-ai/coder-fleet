---
id: CF-9
title: Rename the Doing column to In Progress
status: To Do
assignee: []
created_date: '2026-09-27 01:23'
updated_date: '2026-09-27 01:34'
labels: []
dependencies:
  - CF-8
references:
  - docs/plans/CF-8.md
  - claude/coder-fleet/templates/board.config.yml
  - .boards/config.yml
  - claude/coder-fleet/skills/glossary/SKILL.md
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - docs/plans/CF-9.md
priority: High
type: enhancement
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The fleet's second column is "Doing", but models reach for "In Progress" by default (it is also Backlog.md's upstream default), and the mismatch keeps breaking boards across projects. Observed 2026-09-27: SubagentStart logged `board task edit failed (exit 1): invalid status "In Progress"` for CF-8 here and for BD-41 in another project, from a user-scope BOARD_COL_DOING override. The human decided to adopt "In Progress" as the fleet's name rather than keep correcting toward "Doing".

Decisions taken with the human:
1. Stack after CF-8: lands on top of CF-8's merge, released as v0.26.0.
2. Hooks accept either: the canonical name becomes "In Progress", but the hooks read each board's `.boards/config.yml` statuses and write whichever of "In Progress" or "Doing" it lists, so old boards keep working and the board.env override is unnecessary.
3. Other projects migrate through /kickoff and /init, which detect "Doing" and offer the rename (config plus live items) one project at a time with the human's yes. Nothing outside this repository changes in this item.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The fleet's canonical second column is "In Progress" everywhere it is named: board config template, this repo's .boards/config.yml (live items migrated), glossary skill and regenerated rule, board-conventions, design section 7, hooks README, commands
- [ ] #2 SubagentStart resolves the column from the board's config statuses and writes In Progress or Doing, whichever the config lists; contract tests cover both spellings and a config listing neither
- [ ] #3 /kickoff and /init detect a board still on Doing and offer the rename, changing nothing without the human's yes
- [ ] #4 bash claude/evals/lib/check-all.sh passes; OpenCode port divergence recorded if the port names the column; v0.26.0 bump
<!-- AC:END -->
