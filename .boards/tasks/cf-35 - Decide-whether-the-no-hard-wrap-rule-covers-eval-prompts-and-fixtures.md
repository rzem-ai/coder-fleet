---
id: CF-35
title: Decide whether the no-hard-wrap rule covers eval prompts and fixtures
status: To Do
assignee: []
created_date: '2026-09-27 04:34'
updated_date: '2026-09-30 14:02'
labels: []
dependencies: []
references:
  - AGENTS.md
  - claude/coder-fleet/skills/migration-checklist/SKILL.md
  - claude/evals
priority: Low
type: chore
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-31 coder (2026-09-27). AGENTS.md says never hard-wrap prose, but the migration checklist's wrap check flags about 40 hard-wrapped prose files under `claude/evals/**` (prompts and fixtures) and `claude/coder-fleet/board/`. Either unwrap them or exempt those trees explicitly (fixtures may need their exact bytes; the board fork is carried upstream code), and make the checklist's scan agree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md and the migration checklist say which trees the wrap rule covers
- [ ] #2 The wrap scan reports nothing in covered trees, and fixtures whose bytes matter are untouched
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
