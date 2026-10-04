---
id: CF-127
title: Give review-round's fix lane its own worktree cut from local HEAD
status: To Do
assignee: []
created_date: '2026-10-04 21:44'
labels: []
dependencies: []
references:
  - claude/coder-fleet/workflows/review-round.js
  - docs/limits.md
priority: High
type: bug
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human ordered this on 2026-10-05, choosing to fix review-round before closing CF-52 #3. The CF-52 #3 live run (review-round wf_1297e8b7-cb8 with fix: true on CF-53) showed that a workflow `agent({agentType: 'coder-fleet:coder'})` spawn gets no worktree isolation: the fix-lane coder started in the main checkout (`git rev-parse --git-dir` = `.git`), and only the coder's own scope guard stopped it writing to main. Workflow spawns don't receive the type's `isolation: worktree`, so review-round has to create the worktree itself. CF-52 #3 is re-run as the proof once this lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before review-round's fix lane spawns its coder, a git lane creates a linked worktree under .claude/worktrees/ on a new branch at the pinned head commit, and the coder's prompt tells it to work only there; the coder is never started with the main checkout as its only place to work
- [ ] #2 The fix lane verifies from git that the coder's commit is on that worktree's branch, as today's git-state check does, and a coder that reports the main checkout stops the run as now
- [ ] #3 workflow-logic.mjs covers: the worktree lane runs before the coder, the coder prompt names the worktree path, and a failed worktree creation stops the run without spawning a coder
- [ ] #4 docs/limits.md and hooks README item 18 state that workflow-spawned agents get no harness isolation and how review-round compensates
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
