---
id: CF-75
title: Make the board's biome check runnable in a worktree
status: To Do
assignee: []
created_date: '2026-09-30 00:39'
updated_date: '2026-09-30 14:03'
labels:
  - board
dependencies: []
priority: Low
type: chore
ordinal: 244000
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

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->
