---
id: EX-1
title: Session refresh
status: In Progress
assignee: []
created_date: '2026-08-30 09:12'
updated_date: '2026-09-01 10:05'
labels: []
dependencies: []
references:
  - docs/specs/EX-1-session-refresh.md
priority: High
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed by the human: "People get signed out mid-task after twelve hours, and the refresh route just extends the session in place, so a stolen refresh token keeps working for as long as someone keeps refreshing. Fix refresh properly." The spec is docs/specs/EX-1-session-refresh.md, approved by the human. Split into three sub-issues: EX-1.1 rotation on refresh, EX-1.2 reuse detection, EX-1.3 expiry and revocation on refresh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Refreshing a valid session issues a new refresh token and invalidates the old one
- [ ] #2 Presenting a refresh token that has already been used revokes the whole session
- [ ] #3 An expired session cannot be refreshed
- [ ] #4 A revoked session cannot be refreshed
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-01 10:02
---
The human approved the spec and said go on EX-1 on 2026-09-01, rotation first. Criteria filed from the spec; the sub-issues carry their share of them.
---

author: @lead
created: 2026-09-01 10:05
---
Decision, the human, 2026-09-01: rotate the refresh token on every refresh rather than sliding the expiry. Still open: how long a refresh token lives once rotation is in. EX-1.3 waits on that answer.
---
<!-- COMMENTS:END -->
