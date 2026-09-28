---
id: CF-61
title: Decide the board fork's plan field now the fleet has no plans
status: To Do
assignee: []
created_date: '2026-09-28 13:00'
labels: []
dependencies: []
priority: Low
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-58 review, 2026-09-28: the board fork still has --plan, --append-plan and the implementationPlan field, listed in board-conventions. The fleet no longer writes plans. Remove them from the fork (a NOTICE.md divergence line), or leave them marked unused in board-conventions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 board-conventions and the fork agree on whether an item carries a plan field
<!-- AC:END -->
