---
id: CF-42
title: Make kickoff check board.env against the board config
status: To Do
assignee: []
created_date: '2026-09-27 06:56'
updated_date: '2026-09-27 07:12'
labels: []
dependencies: []
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
