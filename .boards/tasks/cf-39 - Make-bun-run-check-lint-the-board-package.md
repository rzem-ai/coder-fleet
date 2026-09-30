---
id: CF-39
title: Make bun run check lint the board package
status: To Do
assignee: []
created_date: '2026-09-27 06:51'
updated_date: '2026-09-30 14:02'
labels: []
dependencies: []
priority: Low
type: chore
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-26 coder. `bun run check` in claude/coder-fleet/board stops before linting: biome.json sets vcs.useIgnoreFile: true and board/ has no ignore file, so biome errors with "couldn't find an ignore file". The package has no working lint command; CF-26 linted its five files with --vcs-enabled=false as a workaround.
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
