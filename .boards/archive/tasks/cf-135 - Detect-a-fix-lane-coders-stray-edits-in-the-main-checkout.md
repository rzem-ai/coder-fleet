---
id: CF-135
title: Detect a fix-lane coder's stray edits in the main checkout
status: To Do
assignee: []
created_date: '2026-10-05 10:23'
updated_date: '2026-10-06 00:00'
labels: []
dependencies: []
references:
  - CF-127
  - claude/coder-fleet/workflows/review-round.js
priority: Medium
type: bug
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by the reviewer on CF-127 (PR #58). The fix-lane coder still starts with the main checkout as its cwd. enforce_coder governs only writing git commands, and nothing governs coder Edit/Write, so an edit made through a relative path dirties the main checkout. The verify lane (review-round.js around line 1528) never compares the main checkout's dirty state with the pin, so the edit goes undetected. The design needs a decision on where the check belongs. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fix run that leaves the main checkout's tracked files changed relative to the pin stops the review-round run and names the changed paths
- [ ] #2 workflow-logic.mjs covers it, with a test seen failing first
- [ ] #3 check-all.sh is green
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
