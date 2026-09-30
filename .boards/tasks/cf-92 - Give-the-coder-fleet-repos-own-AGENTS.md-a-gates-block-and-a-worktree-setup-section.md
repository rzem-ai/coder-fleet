---
id: CF-92
title: >-
  Give the coder-fleet repo's own AGENTS.md a gates block and a worktree setup
  section
status: To Do
assignee: []
created_date: '2026-09-30 09:12'
updated_date: '2026-09-30 14:03'
labels: []
dependencies:
  - CF-52
  - CF-90
priority: Medium
type: docs
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-52 and CF-90, 2026-09-30. CF-52 adds a Worktree setup section to templates/AGENTS.md that coders follow before building; CF-90 adds a ```gates``` block that the reviewer may run. This repo's own AGENTS.md has neither, so coders here don't know that the board tests need `bun install --frozen-lockfile` in claude/coder-fleet/board, and reviewers here have no gates to run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md has a Worktree setup section saying how a fresh worktree gets its dependencies (bun install --frozen-lockfile in claude/coder-fleet/board for the board tests)
- [ ] #2 AGENTS.md has a gates block naming the deterministic suite and the contract suites a reviewer may run, and the CF-90 hook allows each from a linked worktree
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
