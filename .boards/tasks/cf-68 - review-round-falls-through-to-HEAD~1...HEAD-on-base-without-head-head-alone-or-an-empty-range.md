---
id: CF-68
title: >-
  review-round falls through to HEAD~1...HEAD on base without head, head alone,
  or an empty range
status: To Do
assignee: []
created_date: '2026-09-29 12:28'
updated_date: '2026-09-30 14:03'
labels: []
dependencies: []
references:
  - CF-3
priority: Medium
type: bug
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-3 reviewer (2026-09-29). This is the same defect class as CF-3 and it predates it. `{ base }` without `head`, `{ head }` alone, and `range: ""` all quietly review `HEAD~1...HEAD`. CF-3 criterion 5 kept existing inputs working, so it left these alone. A half-specified range should be an error, and only a call with no range input at all should get the default.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `base` without `head`, or `head` without `base`, throws before any agent() call and names the missing key
- [ ] #2 `range: ""` (or a range that is only whitespace) throws before any agent() call
- [ ] #3 Calling with no range input at all still defaults to HEAD~1...HEAD
- [ ] #4 workflow-logic.mjs has a test for each case above
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
