---
id: CF-56
title: Bring check-all.sh back under two minutes
status: To Do
assignee: []
created_date: '2026-09-28 04:43'
labels: []
dependencies: []
priority: Medium
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured 2026-09-28: bash claude/evals/lib/check-all.sh takes 200 seconds on main (v0.27.9) on marvin, against the two-minute budget AGENTS.md sets so one run fits a shell timeout. CF-25 adds about 13 seconds to the board section. Find where the time goes (per sub-suite timing), then split or speed up, or change the budget and AGENTS.md together.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each sub-suite prints its own duration in check-all output
- [ ] #2 one run of check-all finishes under the stated budget on main, or AGENTS.md states a new budget with the reason
<!-- AC:END -->
