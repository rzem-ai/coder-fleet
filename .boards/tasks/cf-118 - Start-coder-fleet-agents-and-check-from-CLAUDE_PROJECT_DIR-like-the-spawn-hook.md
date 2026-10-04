---
id: CF-118
title: >-
  Start /coder-fleet:agents and --check from CLAUDE_PROJECT_DIR, like the spawn
  hook
status: To Do
assignee: []
created_date: '2026-10-04 10:52'
labels: []
dependencies:
  - CF-111
priority: Low
type: enhancement
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 fix-round-2 coder, 2026-10-04. The spawn hook now resolves the main checkout starting from `CLAUDE_PROJECT_DIR`, so a session cd'd into a forged worktree can't move it. `scripts/fleet-agents.sh` and `--check` with no argument still start from their working directory, so `/coder-fleet:agents` run from such a session would edit the forged repository's file. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `fleet-agents.sh` and `enforce-disabled-agents.sh --check` with no argument resolve from `CLAUDE_PROJECT_DIR` when it is set and is a directory, matching the hook, with a contract case using a forged worktree
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
