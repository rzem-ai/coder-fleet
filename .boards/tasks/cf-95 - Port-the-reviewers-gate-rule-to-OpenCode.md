---
id: CF-95
title: Port the reviewer's gate rule to OpenCode
status: To Do
assignee: []
created_date: '2026-09-30 09:12'
labels: []
dependencies:
  - CF-90
priority: Low
type: task
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-90, 2026-09-30. opencode/coder-fleet/lib/scope.ts and the OpenCode reviewer still say "Never run tests, builds or installs". Once CF-90 lands, carry the gate rule (the gates block read from the main checkout, linked-worktree cwd only, exact match plus the test gate's single-file and single-name forms, and the fixed deny classes), or record a divergence-register row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The OpenCode reviewer follows the same gate rule with invariant tests under opencode/test/, or opencode/docs/divergence-register.md has a row saying why not
- [ ] #2 The OpenCode invariant tests pass
<!-- AC:END -->
