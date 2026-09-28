---
id: EX-1.3
title: Expiry and revocation on refresh
status: To Do
assignee: []
created_date: '2026-09-01 10:03'
labels: []
dependencies:
  - EX-1.2
references:
  - docs/specs/EX-1-session-refresh.md
parent_task_id: EX-1
priority: Medium
ordinal: 1300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Refuse to refresh a session that has expired or been revoked, once the refresh token lifetime is decided.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An expired session cannot be refreshed
- [ ] #2 A revoked session cannot be refreshed
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-01 10:06
---
Not started. Waits on the refresh token lifetime, which the human has not decided.
---
<!-- COMMENTS:END -->
