---
id: CF-116
title: >-
  Reconcile review-round's config-in-range refuter with the hard deny on a
  disabled refuter
status: To Do
assignee: []
created_date: '2026-10-04 10:24'
labels: []
dependencies:
  - CF-111
priority: Low
type: enhancement
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 round 2 reviewer, 2026-10-04. When the main checkout's live config disables the refuter and a review-round range changes `.claude/coder-fleet.json`, review-round calls for a refuter while `enforce-disabled-agents.sh` and lead.md step 4 refuse one with no knowledge of the range. If the hook sees workflow `agent()` spawns, the guard's refuter is denied with 'do not retry'. The lead-driven path has no range guard either. Decide which wins and make the two agree. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the refuter is disabled and a reviewed range changes `.claude/coder-fleet.json`, the hook, lead.md step 4 and review-round give one consistent outcome, documented in the hooks README and covered by a test
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
