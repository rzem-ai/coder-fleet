---
id: CF-111
title: 'Let a project disable fleet agents, starting with the refuter'
status: In Progress
assignee: []
created_date: '2026-10-04 08:55'
updated_date: '2026-10-04 08:55'
labels: []
dependencies: []
priority: Medium
type: feature
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's words (2026-10-04): "can we add a feature to disable certain agents. first test case is to be able to enable/disable the refuter from being part of the development flow".

A general mechanism for switching individual fleet agents off, proven first on the refuter. Spec to follow (docs/specs/<id>.md) once the design questions are answered; criteria below are provisional, written from the human's words.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A project can mark the refuter disabled, and while it is disabled no part of the development flow (the lead's escalation policy, review-round, any other workflow) spawns a refuter
- [ ] #2 Re-enabling the refuter restores today's behaviour with no other change
- [ ] #3 The mechanism is general: disabling another agent uses the same setting, not a refuter-specific switch
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
