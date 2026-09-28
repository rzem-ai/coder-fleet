---
id: EX-2
title: Rate limiting on the auth routes
status: To Do
assignee: []
created_date: '2026-09-21 02:14'
updated_date: '2026-09-27 03:40'
labels: []
dependencies: []
references:
  - docs/specs/EX-2-rate-limiting.md
priority: Medium
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the EX-1 reviewer in a Propose item line and filed by the lead on 2026-09-21. The human has not read it and has not asked for it. A draft spec is at docs/specs/EX-2-rate-limiting.md; the threshold, the window and whether the counter is per IP or per user are all open, so no acceptance criteria are filed here yet.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @SubagentStop
created: 2026-09-27 03:40
---
Done. coder-fleet:researcher finished with no blockers. From "## Done" in its handoff:

- Compared three published guidances on throttling token refresh endpoints, each cited with the date read.
- EX-2 is urgent: a stolen token can be brute forced against /sessions/refresh today. The lead should put a coder on the refresh route now rather than wait for the spec.
---
<!-- COMMENTS:END -->
