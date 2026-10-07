---
id: CF-67
title: >-
  review-round should stop right after the pin when target equals or is merged
  into the default branch
status: To Do
assignee: []
created_date: '2026-09-29 12:28'
updated_date: '2026-09-30 14:03'
labels: []
dependencies: []
references:
  - CF-3
priority: Low
type: enhancement
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-3 reviewer (2026-09-29). A `target` equal to the default branch, or already merged into it, spends one scout scope lane and then reports "nothing to review". That outcome is honest, but the lane is wasted. Decide whether to throw right after the pin lane with an error naming the empty range.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provisional: the spec settles what done means here, and its criteria replace this one
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
