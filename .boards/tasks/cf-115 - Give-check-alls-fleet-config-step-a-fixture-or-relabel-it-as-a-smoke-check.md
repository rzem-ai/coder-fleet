---
id: CF-115
title: 'Give check-all''s fleet-config step a fixture, or relabel it as a smoke check'
status: To Do
assignee: []
created_date: '2026-10-04 10:06'
labels: []
dependencies:
  - CF-111
priority: Low
type: chore
ordinal: 264000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 fix-round coder, 2026-10-04. check-all's `fleet-config` step runs `enforce-disabled-agents.sh --check` against the main checkout's live `.claude/coder-fleet.json`. In CI there is no such file, so the step can only pass. Locally it checks the human's real file, so it can fail locally while CI stays green. Either feed it a fixture or relabel it so nobody reads it as coverage. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-all's fleet-config step either runs against a committed fixture that exercises an invalid file, or is labelled in its output as a smoke check of the live file, and CI and local runs give the same result on the same commit
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
