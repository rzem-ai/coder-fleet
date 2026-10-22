---
id: CF-121
title: Tell spec-to-card's clauses lane when the requirements source is a directory
status: To Do
assignee: []
created_date: '2026-10-04 13:28'
labels: []
dependencies:
  - CF-53
priority: Low
type: enhancement
ordinal: 269000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-53 fix-round-3 coder, 2026-10-04. Since ba53272, a directory requirements source stops the run when any clause has no file. The clauses lane's prompt isn't told the source is a directory, so a scout that leaves out file names stops fathom's `.rq` folders more often than it needs to. The template, kickoff Start and lead step 2 also don't say a directory source needs file names. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the requirements lane reports a directory, the clauses lane's prompt asks for every clause's file, with a workflow-logic case pinning the prompt text, and the template's Where work lives paragraph says so
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
