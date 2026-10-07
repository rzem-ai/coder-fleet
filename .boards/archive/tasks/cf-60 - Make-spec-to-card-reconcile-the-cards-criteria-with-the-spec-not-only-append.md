---
id: CF-60
title: 'Make spec-to-card reconcile the card''s criteria with the spec, not only append'
status: To Do
assignee: []
created_date: '2026-09-28 13:00'
updated_date: '2026-10-07 03:54'
labels: []
dependencies: []
priority: Low
ordinal: 239000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-58 review, 2026-09-28: spec-to-card files only the criteria the card lacks. CF-24's spec (Q4b, Q17) wants the card's criteria to mirror the spec one for one, with the same numbering, including replacing provisional criteria and rewriting them after a spec revision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a spec revision leaves the card's criteria matching the spec one for one, in order, proven by workflow-logic cases
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-07 03:54
---
Archived 2026-10-07 on the human's word after a sweep of To Do against main: merged into CF-79 as its criterion 4. spec-to-card.js:92-98 already replaces rather than appends (workflow-logic.mjs:647), so what is left of this card is the one-for-one proof, which CF-79 now carries.
---
<!-- COMMENTS:END -->
