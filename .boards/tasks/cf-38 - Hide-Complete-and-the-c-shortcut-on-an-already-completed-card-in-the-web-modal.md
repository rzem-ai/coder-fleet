---
id: CF-38
title: Hide Complete and the c shortcut on an already-completed card in the web modal
status: To Do
assignee: []
created_date: '2026-09-27 06:51'
updated_date: '2026-10-07 04:08'
labels: []
dependencies:
  - CF-26
references:
  - docs/plans/CF-26.md
priority: Low
type: bug
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-26 coder. On a card already in .boards/completed/, the web detail modal still offers Complete and the `c` shortcut, and the POST returns 404 "Task not found" (TaskDetailsModal.tsx:512-515, :1113, :1139-1141 in claude/coder-fleet/board). This was CF-26 plan open question 4, deferred out of that PR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a card already in .boards/completed/, the web detail modal shows no Complete button and the `c` shortcut does nothing, so no POST that returns 404 'Task not found' can be sent
- [ ] #2 A board fork test renders the modal for a completed card and fails if Complete or the `c` binding is present, seen failing first, and is in BOARD_TESTS
- [ ] #3 bash claude/evals/lib/check-all.sh passes on the branch
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
created: 2026-10-07 04:08
---
2026-10-07, lead, on the human's request to check every To Do card has acceptance criteria: the provisional criterion is replaced with criteria written from this card's own description; nothing added. Triage the same day found the gap still open at TaskDetailsModal.tsx:1165 and :522, where the canDemote check at :1141 already looks at the card's source. Not ordered.
---
<!-- COMMENTS:END -->
