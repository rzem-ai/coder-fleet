---
id: CF-54
title: Leave a fix unverified when the tests lane that settled it ran nothing
status: To Do
assignee: []
created_date: '2026-09-28 02:57'
updated_date: '2026-09-30 14:03'
labels: []
dependencies:
  - CF-45
priority: Low
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-45 review round 3, 2026-09-28. Pre-existing, so a follow-up rather than a Low of that change. In review-round.js (about :844-847 on cf-45-refuter-cap-tiering), with fix: true and refute: false, a fix is marked testResults.verified with verifiedBy "ran no named command" when the next round's tests lane returned ran: [], while the same result lists tests under gatesMissing and approved is false: one result says two things. Once CF-45 lands, apply its gateMissing(testsLane) before marking a fix verified, and leave the fix unverified with the reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a fix whose settling tests lane ran nothing stays unverified with that reason, and a case pins it
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
