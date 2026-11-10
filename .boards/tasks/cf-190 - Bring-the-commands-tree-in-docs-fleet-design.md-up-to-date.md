---
id: CF-190
title: Bring the commands tree in docs/fleet-design.md up to date
status: To Do
assignee: []
created_date: '2026-11-10 04:28'
labels: []
dependencies: []
priority: Low
type: docs
ordinal: 320000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 2026-11-10, from the CF-185 scripter: the commands tree in docs/fleet-design.md (around lines 211-213) lists init, kickoff, board, work and prune-worktrees, and is missing drain, flush, sweep, agents, triage and springclean.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The commands tree in docs/fleet-design.md lists every file under claude/coder-fleet/commands/, and the comment beside it matches
- [ ] #2 `bash claude/evals/lib/check-all.sh` passes
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
