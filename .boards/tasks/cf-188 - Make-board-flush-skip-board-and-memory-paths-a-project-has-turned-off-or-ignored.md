---
id: CF-188
title: >-
  Make board flush skip board and memory paths a project has turned off or
  ignored
status: To Do
assignee: []
created_date: '2026-11-10 04:28'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board/src/flush.ts
  - claude/coder-fleet/commands/init.md
  - CF-187
priority: Medium
type: bug
ordinal: 318000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 2026-11-10, from CF-187's review: `flushState` (claude/coder-fleet/board/src/flush.ts around 340-413) has no `auto_commit` or ignore guard, and `buildTree` writes index entries without consulting `.gitignore`, so a project that chose Ignore at /init after its board had already moved still gets its earlier coder-fleet/state commits pushed onto the default branch at the next flush.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the default branch's `.gitignore` ignores `.boards/` or `.claude/agent-memory/`, `board flush` lands no file under that path on the default branch, and says so in its output
- [ ] #2 When `auto_commit` is not `true` in the live board's config, `board flush` lands no `.boards/` change and says so
- [ ] #3 A test with a real linked state worktree pins both cases, and fails with the guard reverted
- [ ] #4 `bash claude/evals/lib/check-all.sh` passes
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
