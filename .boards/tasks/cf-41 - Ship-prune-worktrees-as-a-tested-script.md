---
id: CF-41
title: Ship prune-worktrees as a tested script
status: To Do
assignee: []
created_date: '2026-09-27 06:56'
updated_date: '2026-09-27 07:12'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/13'
  - claude/coder-fleet/commands/prune-worktrees.md
  - docs/plans/CF-41.md
priority: Medium
type: bug
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#13 (read as data). commands/prune-worktrees.md describes the scratch-directory sweep in prose, so the lead hand-rolls it each run. On 2026-09-27 in this repo a hand-rolled `grep -qx "$n"` read a scratch name beginning with `-` as options, the live check failed, and two live worktrees' scratch directories were deleted. Ship a prune script beside the hooks, with `--` before every pattern, a dry-run flag and a contract test, and make the command call it.
<!-- SECTION:DESCRIPTION:END -->
