---
id: CF-87
title: Port scout's read-only gh rule to OpenCode
status: To Do
assignee: []
created_date: '2026-09-30 05:56'
updated_date: '2026-09-30 14:03'
labels: []
dependencies:
  - CF-84
priority: Low
type: task
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-84, 2026-09-30. Once the Claude Code rule lands, carry scout's gh rule into opencode/coder-fleet/lib/scope.ts and opencode/coder-fleet/agent/scout.md: pair allowlist, only -R/--repo before the pair, GET-only api, no pager/browser/editor variables. Or record a row in opencode/docs/divergence-register.md with the reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The OpenCode scout allows the same gh pairs and denies the same forms, with invariant tests under opencode/test/, or a divergence-register row says why not
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
