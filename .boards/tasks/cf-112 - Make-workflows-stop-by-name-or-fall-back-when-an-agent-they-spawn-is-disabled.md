---
id: CF-112
title: Make workflows stop by name or fall back when an agent they spawn is disabled
status: To Do
assignee: []
created_date: '2026-10-04 09:18'
labels: []
dependencies:
  - CF-111
priority: Low
type: enhancement
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 coder, 2026-10-04. CF-111 lets a project disable any non-core agent through `.claude/coder-fleet.json`, but only the refuter has a designed fallback. review-round uses `scout` for its scope pass, and spec-to-card and deep-research spawn other optional agents; disabling one of them today makes the workflow fail with a generic message (e.g. 'scope pass returned nothing') instead of saying the agent is disabled or falling back. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each workflow that spawns a non-core agent reads the disabled list and either falls back or stops with a message naming the disabled agent and `.claude/coder-fleet.json`
- [ ] #2 workflow-logic.mjs covers each workflow with each agent it spawns disabled
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
