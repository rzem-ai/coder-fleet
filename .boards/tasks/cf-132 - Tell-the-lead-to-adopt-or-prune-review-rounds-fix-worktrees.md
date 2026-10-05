---
id: CF-132
title: Tell the lead to adopt or prune review-round's fix worktrees
status: In Progress
assignee: []
created_date: '2026-10-05 09:50'
updated_date: '2026-10-05 13:05'
labels: []
dependencies: []
references:
  - CF-127
priority: Low
type: enhancement
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the coder on CF-127. Since v0.32.0 review-round returns `fixWorktrees` and stops with `fix worktree not created` when a `review-round/<issue>-r<n>` branch is left over. lead.md says neither what to do with those worktrees after a round nor how to clear a leftover branch before rerunning. This is an agent-body change, so it needs the migration checklist. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md says to adopt or prune each worktree in review-round's `fixWorktrees` after the round, through /coder-fleet:prune-worktrees
- [ ] #2 lead.md says a `fix worktree not created` stop means a leftover branch the lead adopts or prunes before rerunning
- [ ] #3 The migration-checklist findings are in the PR
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
