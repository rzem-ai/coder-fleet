---
id: EX-1.2
title: Reuse detection
status: To Do
assignee: []
created_date: '2026-09-01 10:03'
labels: []
dependencies:
  - EX-1.1
references:
  - docs/specs/EX-1-session-refresh.md
  - src/auth/session.ts
parent_task_id: EX-1
priority: High
ordinal: 1200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Presenting a refresh token that was already consumed by a rotation revokes every session for that user.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Presenting a consumed refresh token revokes every session for that user
- [ ] #2 A revoked session fails validation
<!-- AC:END -->
