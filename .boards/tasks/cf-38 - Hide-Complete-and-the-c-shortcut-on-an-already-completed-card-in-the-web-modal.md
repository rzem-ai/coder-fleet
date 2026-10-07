---
id: CF-38
title: Hide Complete and the c shortcut on an already-completed card in the web modal
status: To Do
assignee: []
created_date: '2026-09-27 06:51'
updated_date: '2026-09-30 14:02'
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
- [ ] #1 Provisional: the spec settles what done means here, and its criteria replace this one
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
