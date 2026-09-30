---
id: CF-95
title: Port the reviewer's gate rule to OpenCode
status: To Do
assignee: []
created_date: '2026-09-30 09:12'
updated_date: '2026-09-30 14:03'
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

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->
