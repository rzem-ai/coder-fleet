---
id: CF-55
title: >-
  Hold agent bodies to the six-step limit and rubric IDs to uniqueness in the
  suite
status: To Do
assignee: []
created_date: '2026-09-28 03:25'
labels: []
dependencies: []
priority: Low
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 by the migration checklist on the lead upkeep change for GitHub #11: a seventh How you work step (docs/agent-contract.md:58 allows six) and a duplicated rubric ID (LD04e) both passed check-all.sh, which checks body length and the four H2 sections but not the step count or rubric ID uniqueness. CF-51 adds several rules to lead.md and will hit the same limit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 roster-contract.sh fails a body whose How you work has more than six numbered steps
- [ ] #2 a check fails any evals rubric with a repeated [ID]
<!-- AC:END -->
