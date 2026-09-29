---
id: CF-71
title: Set project Definition of Done defaults so new cards carry one
status: To Do
assignee: []
created_date: '2026-09-29 13:59'
labels: []
dependencies: []
references:
  - docs/specs/CF-24.md
  - claude/coder-fleet/templates/board.config.yml
  - .boards/config.yml
priority: Low
type: enhancement
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Carried out of CF-24 when it was archived on 2026-09-29, at the human's word, as superseded by CF-58. The board fork supports project defaults through `definition_of_done:` in `.boards/config.yml` (board/src/file-system/operations.ts:2135). It applies them only when an item is created (board/src/core/backlog.ts:1337). Neither this repo's config nor `claude/coder-fleet/templates/board.config.yml` sets the key, so every card's Definition of Done is empty. Background and the candidate defaults are in docs/specs/CF-24.md (Q2 to Q6), which now carries a superseded status.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `claude/coder-fleet/templates/board.config.yml` and this repo's `.boards/config.yml` set `definition_of_done:` defaults that fit a fleet without plans
- [ ] #2 A card created after the change carries those defaults, shown by a board contract case written red first
- [ ] #3 `/init` writes the defaults for a new project, and the instruction-file or board contract covers it
- [ ] #4 bash claude/evals/lib/check-all.sh is green, and the version is bumped
<!-- AC:END -->
