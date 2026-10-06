---
id: CF-143
title: >-
  Carry the Next rules into the design doc and guard the glossary against
  contradicting text
status: Next
assignee: []
created_date: '2026-10-06 03:35'
updated_date: '2026-10-06 13:43'
labels: []
dependencies:
  - CF-140
priority: Low
type: docs
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-140 fix-round coder (2026-10-06). (a) docs/fleet-design.md does not state the human's decision that a repeat ask wins over Next (CF-140 comment #6), so the design doc lags lead.md step 3. (b) next-column-contract.sh's negative check (a move verb next to Next must be negated or have the human as its subject) covers lead.md and board-conventions, but not the glossary skill, its generated rules or fleet-design.md, which are guarded only by checks that look for phrases being present.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/fleet-design.md states that a repeat ask for a card outside Next goes ahead of the Next column
- [ ] #2 The negative move-into-Next check runs over the glossary skill, both generated glossary rules and docs/fleet-design.md, and fails when the refuter's m4 line is added to any of them
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
