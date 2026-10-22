---
id: CF-119
title: Confine a coder's Write and Edit to its own worktree
status: To Do
assignee: []
created_date: '2026-10-04 10:52'
labels: []
dependencies: []
priority: Medium
type: enhancement
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 fix-round-2 coder, 2026-10-04, and confirmed by the round 2 reviewer: `enforce_coder` in `enforce-agent-scope.sh` returns early for any tool that isn't Bash, so a coder's Write or Edit can reach the main checkout, including `.claude/coder-fleet.json`, which now decides whether the refuter runs. Recorded in docs/limits.md by CF-111. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A coder or scripter Write, Edit, MultiEdit or NotebookEdit outside its own worktree (and the session scratchpad) is denied by the scope hook, with scope-hook-contract.sh cases for the main checkout and `.claude/coder-fleet.json`
- [ ] #2 The docs/limits.md entry on main-checkout writers is removed or narrowed the same day
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
