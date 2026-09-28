---
id: EX-1.1
title: Rotation on refresh
status: To Do
assignee: []
created_date: '2026-09-01 10:03'
labels: []
dependencies: []
references:
  - docs/specs/EX-1-session-refresh.md
  - src/auth/session.ts
parent_task_id: EX-1
priority: High
ordinal: 1100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Issue a new refresh token on every successful refresh and persist the old one as consumed, in src/auth/session.ts. Reuse detection is EX-1.2 and is not part of this item.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A successful refresh returns a different refresh token
- [ ] #2 The old refresh token no longer validates after a refresh
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-01 10:05
---
Decision, the human, 2026-09-01: rotate on every refresh rather than sliding the expiry.
---
<!-- COMMENTS:END -->
