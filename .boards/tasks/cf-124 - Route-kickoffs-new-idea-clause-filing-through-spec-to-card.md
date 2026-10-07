---
id: CF-124
title: Route kickoff's new-idea clause filing through spec-to-card
status: To Do
assignee: []
created_date: '2026-10-04 14:12'
labels: []
dependencies:
  - CF-53
priority: Low
type: enhancement
ordinal: 272000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-53 review-round reviewer, 2026-10-05. In a project with a requirements source, kickoff's new-idea route (kickoff.md:72) and lead step 5 (lead.md:33) have the lead file clause criteria by hand. Only an item already on the board goes through spec-to-card. The hand route skips everything spec-to-card's four fix rounds added: code-unit file order, path normalisation, de-duplication, the directory stop and the read-back check. Proposal: file the card with a 'Provisional:' criterion and run spec-to-card on it, so there's one implementation. This changes the intake route, so it needs the human's decision. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With a requirements source, kickoff's new-idea route and lead step 5 file clause criteria only through spec-to-card, and requirements-source-contract or workflow-logic pins that neither tells the lead to file clauses by hand
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
