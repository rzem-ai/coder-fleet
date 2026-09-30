---
id: CF-82
title: Drop the session last-item step from the Codex port's binding spec
status: To Do
assignee: []
created_date: '2026-09-30 04:12'
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
