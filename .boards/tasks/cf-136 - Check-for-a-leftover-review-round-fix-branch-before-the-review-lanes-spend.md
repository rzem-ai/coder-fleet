---
id: CF-136
title: Check for a leftover review-round fix branch before the review lanes spend
status: To Do
assignee: []
created_date: '2026-10-05 10:23'
labels: []
dependencies: []
references:
  - CF-127
priority: Low
type: enhancement
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by the reviewer on CF-127 (PR #58). Fix branches are named review-round/<issue>-r<n>, and an existing branch is found only in the fix lane, after the mechanical, reviewer and refuter lanes have already spent. Stopping rather than forking is deliberate; the check should just come first. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With fix: true, the pin lane reports whether review-round/<issue>-r<round> already exists, and the run stops before any review lane when it does
- [ ] #2 workflow-logic.mjs covers it
- [ ] #3 check-all.sh is green
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
