---
id: CF-35
title: Decide whether the no-hard-wrap rule covers eval prompts and fixtures
status: To Do
assignee: []
created_date: '2026-09-27 04:34'
labels: []
dependencies: []
references:
  - AGENTS.md
  - claude/coder-fleet/skills/migration-checklist/SKILL.md
  - claude/evals
priority: Low
type: chore
ordinal: 62000
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
