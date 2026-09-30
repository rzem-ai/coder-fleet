---
id: CF-75
title: Make the board's biome check runnable in a worktree
status: To Do
assignee: []
created_date: '2026-09-30 00:39'
labels:
  - board
dependencies: []
priority: Low
type: chore
ordinal: 106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during CF-73. claude/coder-fleet/board/biome.json sets vcs.useIgnoreFile: true, and `bunx biome check .` fails with "couldn't find an ignore file" when the board sits in an agent worktree, so `bun run check` is unusable there. With --vcs-enabled=false it reports 2 errors already on main: an import order in src/core/backlog.ts and a format issue in src/test/test-utils.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `bun run check` in claude/coder-fleet/board runs to completion from an agent worktree under .claude/worktrees/
- [ ] #2 `bun run check` reports no errors on the board source
<!-- AC:END -->
