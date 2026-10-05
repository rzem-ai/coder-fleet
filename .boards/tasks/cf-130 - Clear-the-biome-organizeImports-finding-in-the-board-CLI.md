---
id: CF-130
title: Clear the biome organizeImports finding in the board CLI
status: To Do
assignee: []
created_date: '2026-10-05 03:56'
labels: []
dependencies: []
priority: Low
type: chore
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the coder on CF-128: `claude/coder-fleet/board/src/cli.ts` has a pre-existing biome organizeImports finding. Related to CF-39 (make bun run check lint the board package). Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `biome check src/cli.ts` in the board package reports no organizeImports finding
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
