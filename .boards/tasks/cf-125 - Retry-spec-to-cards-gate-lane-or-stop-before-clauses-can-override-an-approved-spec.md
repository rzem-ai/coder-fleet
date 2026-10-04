---
id: CF-125
title: >-
  Retry spec-to-card's gate lane, or stop, before clauses can override an
  approved spec
status: To Do
assignee: []
created_date: '2026-10-04 21:36'
labels: []
dependencies:
  - CF-53
priority: Low
type: bug
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-53 review-round reviewer, 2026-10-05. In spec-to-card (~line 220), a null gate-lane result defaults to `specApproved: false`. In a project with a requirements source, an `auto` run then goes to the clauses stage and can rewrite a card that carried an approved spec's criteria, breaking 'an approved spec still wins over the clauses'. The requirements lane gets one retry for this failure; the gate lane gets none. Decide: retry once, or stop when the gate lane fails and a source is present. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A failed gate-lane answer in a project with a requirements source never routes to the clauses stage: it is retried once and then stops, with workflow-logic cases for null and garbage answers
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
