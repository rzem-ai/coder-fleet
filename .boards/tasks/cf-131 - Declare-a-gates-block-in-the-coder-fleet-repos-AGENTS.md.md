---
id: CF-131
title: Declare a gates block in the coder-fleet repo's AGENTS.md
status: To Do
assignee: []
created_date: '2026-10-05 04:22'
labels: []
dependencies: []
priority: Low
type: chore
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the reviewer on CF-128. AGENTS.md declares no `gates` block, so the reviewer's scope hook refuses `bash claude/evals/lib/check-all.sh`, and every review of this repo approves without a gate run of its own. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md declares a gates block that includes `bash claude/evals/lib/check-all.sh`
- [ ] #2 A reviewer spawned on a branch of this repo can run check-all.sh without the scope hook refusing it
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
