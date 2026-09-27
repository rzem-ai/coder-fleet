---
id: CF-13
title: Name scripter in kickoff's preflight agent list
status: To Do
assignee: []
created_date: '2026-09-27 01:52'
labels: []
dependencies: []
references:
  - claude/coder-fleet/commands/kickoff.md
  - claude/evals/lib/roster-contract.sh
priority: Low
type: bug
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-12 spec-writer and seen in the 2026-09-27 kickoff. claude/coder-fleet/commands/kickoff.md:12 lists the agents preflight expects as coder-fleet: types and names ten, leaving out scripter, so a missing scripter passes preflight. CF-9 and CF-12 both edit kickoff.md; land this with or after them, and check whether a contract should pin the list against the roster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kickoff.md's preflight names every agent in the roster, scripter included
- [ ] #2 The roster contract or a new check fails if the list and the roster disagree, or the item says why not
<!-- AC:END -->
