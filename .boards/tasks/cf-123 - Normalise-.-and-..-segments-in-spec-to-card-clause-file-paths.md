---
id: CF-123
title: Normalise . and .. segments in spec-to-card clause file paths
status: To Do
assignee: []
created_date: '2026-10-04 13:37'
labels: []
dependencies:
  - CF-53
priority: Low
type: enhancement
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-53 fix-round-4 coder, 2026-10-05. `samePath` strips a leading `./` and collapses repeated `/`, but `reqs/./a.rq` or `reqs/../reqs/a.rq` still read as different files, so their clauses would interleave in a directory source. Worth doing only if the requirements lane is seen returning such paths. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Clause file paths with `.` or `..` segments normalise to the same file as their plain spelling before sorting, with a workflow-logic case
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
