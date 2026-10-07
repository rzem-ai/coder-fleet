---
id: CF-93
title: Carry the reviewer's gate runs into review-round's gates and gatesMissing
status: To Do
assignee: []
created_date: '2026-09-30 09:12'
updated_date: '2026-09-30 14:03'
labels:
  - workflow
dependencies:
  - CF-90
priority: Low
type: enhancement
ordinal: 253000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-90, 2026-09-30. After CF-90 the reviewer runs the declared gates and reports each as a Done bullet, but review-round's VERDICT_SCHEMA has no gates field, so those runs never reach the workflow result's gates/gatesMissing, and the tests and types-and-build lanes still run separately. Whether to fold the lanes into the reviewer is a separate decision (CF-90 description).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 review-round's VERDICT_SCHEMA has an optional gates field (command, exit, passed, failed), and the reviewer's gate runs appear in the result's gates, with a workflow-logic test
- [ ] #2 The human's decision on folding the tests and types-and-build lanes into the reviewer is recorded here
- [ ] #3 bash claude/evals/lib/check-all.sh passes
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
