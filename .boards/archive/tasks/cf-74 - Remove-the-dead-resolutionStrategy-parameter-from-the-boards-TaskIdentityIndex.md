---
id: CF-74
title: >-
  Remove the dead resolutionStrategy parameter from the board's
  TaskIdentityIndex
status: To Do
assignee: []
created_date: '2026-09-30 00:39'
updated_date: '2026-09-30 14:03'
labels:
  - board
dependencies:
  - CF-73
priority: Low
type: chore
ordinal: 243000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up from the CF-73 review. With branchRecords always [] in the fork, identities group by normalised path and no identity can hold two task records, so the strategy passed to TaskIdentityIndex, selectTaskRecord and Core.buildTaskIdentityIndex has no observable effect and no Core-level test can pin it. CF-73 kept the parameter as the smaller change and passes the literal "most_progressed" at core/backlog.ts:929, :3822 and :3864 (paths under claude/coder-fleet/board/src).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No resolutionStrategy parameter remains on TaskIdentityIndex, selectTaskRecord or Core.buildTaskIdentityIndex
- [ ] #2 The board's test suite and typecheck pass, and bash claude/evals/lib/check-all.sh passes
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
