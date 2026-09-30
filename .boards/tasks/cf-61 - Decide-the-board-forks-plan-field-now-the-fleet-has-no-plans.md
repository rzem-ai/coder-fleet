---
id: CF-61
title: Decide the board fork's plan field now the fleet has no plans
status: To Do
assignee: []
created_date: '2026-09-28 13:00'
updated_date: '2026-09-30 14:03'
labels: []
dependencies: []
priority: Low
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-58 review, 2026-09-28: the board fork still has --plan, --append-plan and the implementationPlan field, listed in board-conventions. The fleet no longer writes plans. Remove them from the fork (a NOTICE.md divergence line), or leave them marked unused in board-conventions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 board-conventions and the fork agree on whether an item carries a plan field
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
