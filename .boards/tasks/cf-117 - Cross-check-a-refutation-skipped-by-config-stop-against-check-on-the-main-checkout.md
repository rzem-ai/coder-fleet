---
id: CF-117
title: >-
  Cross-check a 'refutation skipped by config' stop against --check on the main
  checkout
status: To Do
assignee: []
created_date: '2026-10-04 10:25'
labels: []
dependencies:
  - CF-111
priority: Low
type: enhancement
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 round 2 reviewer, 2026-10-04. review-round learns the disabled list through an LLM-driven pin lane that transcribes the file, and that is the one disable path that rests on a model's reading. The lead, or the workflow's result guidance, could verify any `refutation skipped by config` stop with a deterministic `enforce-disabled-agents.sh --check` on the main checkout before accepting it. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A `refutation skipped by config` result is accepted only after a deterministic read of the main checkout's config agrees the refuter is disabled; a disagreement is reported and a refuter is spawned
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
