---
id: CF-82
title: Drop the session last-item step from the Codex port's binding spec
status: To Do
assignee: []
created_date: '2026-09-30 04:12'
updated_date: '2026-09-30 14:03'
labels: []
dependencies:
  - CF-48
priority: Low
type: docs
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-48 (2026-09-30): SubagentStart no longer falls back to sessions/<sid>/last-item, and last-item is no longer written. codex/docs/specs/GPTA-1.md:171 still says the Codex port's binding reads 'the session's last item' after the focus.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 codex/docs/specs/GPTA-1.md describes the binding chain as resume record, Board-Item, focus, CODER_FLEET_BOARD_PAGE_ID, with no session last-item step
- [ ] #2 bash claude/evals/lib/check-all.sh passes
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
