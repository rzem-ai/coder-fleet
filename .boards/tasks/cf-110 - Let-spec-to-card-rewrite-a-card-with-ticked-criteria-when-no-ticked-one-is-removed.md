---
id: CF-110
title: >-
  Let spec-to-card rewrite a card with ticked criteria when no ticked one is
  removed
status: To Do
assignee: []
created_date: '2026-09-30 16:20'
labels:
  - workflows
dependencies: []
priority: Low
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-53 review round 2 (2026-10-01). spec-to-card's rewrite stops whenever any criterion on the card is ticked. Safe, but too strict: a card [R2 (ticked), Provisional] with target [R2, R7] stops, although `--remove-ac=2 --ac=R7` would keep the tick. Separately, the human's call: whether a criterion left from an earlier spec revision should be dropped (lead step 5 says a revised spec means rewriting the list) rather than kept as an extra. spec-to-card can't tell a stale spec criterion from a deliberate extra today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 spec-to-card keeps the longest prefix of the card that matches the target (with its ticks), removes the rest and appends the remainder, stopping only when a removed criterion is ticked, with workflow-logic cases seen failing first
- [ ] #2 The human's decision on stale criteria from an earlier spec revision is recorded here and, if they should go, built
- [ ] #3 bash claude/evals/lib/check-all.sh passes
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
