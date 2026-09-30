---
id: CF-99
title: >-
  Replace the coder worktree guard's */worktrees/* path match with a git-dir
  test
status: To Do
assignee: []
created_date: '2026-09-30 09:53'
updated_date: '2026-09-30 14:03'
labels:
  - hooks
  - security
dependencies:
  - CF-90
priority: Medium
type: bug
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-90 fix round 1, 2026-09-30, and older than CF-90. The coder's worktree guard in enforce-agent-scope.sh decides whether it's in a linked worktree by matching `*/worktrees/*` in the path, so a main checkout whose path contains /worktrees/ passes and the coder could commit there. CF-90's reviewer gate rule uses a sounder test (gate_dir_state: git-dir versus common-dir).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The coder guard decides linked-worktree by git-dir versus common-dir, as gate_dir_state does, with a contract case for a main checkout whose path contains /worktrees/ (denied)
- [ ] #2 Existing coder guard cases pass; bash claude/evals/lib/check-all.sh passes
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
