---
id: CF-109
title: Define provisional criteria by one fixed prefix
status: To Do
assignee: []
created_date: '2026-09-30 15:24'
labels:
  - agents
dependencies: []
priority: Low
ordinal: 260000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-53 (2026-10-01): spec-to-card drops a provisional criterion when it files the spec's criteria or the requirement clauses, and it recognises one by text starting 'Provisional' (PROVISIONAL_RE). That matches board-backfill.sh's wording, but nothing tells the lead to word a provisional criterion that way, so one worded otherwise survives as an extra criterion after the real ones.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md step 5 and board-conventions say a provisional criterion starts with the fixed prefix 'Provisional:'
- [ ] #2 spec-to-card.js, board-backfill.sh and the docs use that one prefix, pinned by a contract check
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
