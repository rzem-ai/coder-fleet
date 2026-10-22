---
id: CF-169
title: Keep board writes out of agent worktree branches
status: To Do
assignee: []
created_date: '2026-10-22 08:55'
labels:
  - board
  - hooks
dependencies: []
priority: Medium
ordinal: 293000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, after asking whether the plugin held the work back on Fathom FTH-285: "create cards for all those issues in coder-fleet please".

Seen on Fathom, 22 Oct 2026: the board's hooks wrote card comments and updated_date inside the agent worktrees, so each coder branch (FTH-285.1, FTH-285.4) carried edits to .boards/tasks/fth-285.1 and fth-285.4. Merging main into the FTH-285.4 branch before PR #226 conflicted in both card files, and the lead resolved them by taking main's copy. Separately, the binary's auto_commit writes to whatever branch the main checkout has out, so every lead pull --rebase of main had to work around local board commits and agent memory edits, and the auto-mode classifier refused two of the clean-up steps.

The board belongs to the main checkout. A worktree branch should never carry a .boards change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board write made while an agent runs in a linked worktree lands in the main checkout's .boards, never in the worktree's branch, and a test pins it with a real linked worktree
- [ ] #2 A merged agent branch carries no .boards changes; a check in the merge path, or review-round's scope lane, reports any it finds
- [ ] #3 docs/board-config.md says where board writes go when agents run in worktrees, and how a lead keeps main's board commits from colliding with a pull --rebase
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->
