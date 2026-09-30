---
id: CF-105
title: >-
  Remove or guard FileSystem.promoteDraft, which writes a task without the
  acceptance-criteria check
status: To Do
assignee: []
created_date: '2026-09-30 10:15'
labels:
  - board
dependencies: []
references:
  - claude/coder-fleet/board/src/file-system/operations.ts
  - CF-24.3
priority: Low
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-24.3's review round 2 (2026-09-30). `FileSystem.promoteDraft` in claude/coder-fleet/board/src/file-system/operations.ts:1178 turns a draft into a task file with no require_acceptance_criteria check. It has no production caller today, so it isn't live, but it's a latent bypass for whoever wires it up next. The fork policy is to trim by deletion; filesystem.test.ts uses it, so deleting it means moving those promote cases onto Core.promoteDraft, which carries the check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No production or test code path can write a task file from a draft without going through the require_acceptance_criteria check: FileSystem.promoteDraft is deleted, or it makes the check itself
- [ ] #2 The filesystem.test.ts promote cases still pass, moved onto Core.promoteDraft if the method is deleted
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
