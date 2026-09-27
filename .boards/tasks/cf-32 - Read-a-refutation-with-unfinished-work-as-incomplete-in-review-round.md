---
id: CF-32
title: Read a refutation with unfinished work as incomplete in review-round
status: To Do
assignee: []
created_date: '2026-09-27 03:22'
labels: []
dependencies:
  - CF-31
references:
  - claude/coder-fleet/workflows/review-round.js
  - docs/limits.md
  - docs/plans/CF-23.md
priority: Medium
type: bug
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CF-23 plan open question 6, filed at the human's approval (2026-09-27). `review-round.js:851-861` stops the refute stage as `refuted` only on Blocker: lines, so a refuter stopped by CF-23's 25-minute cap, with its unreached mutations under Not done, returns `stopped: "clean"`. This widens the gap already in `docs/limits.md:47`. Treat a refutation whose Not done is non-empty as incomplete (a distinct stopped value, reported to the lead), not clean. Coordinate with CF-31, which changes how that stage reads survivors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A refuter handoff with a non-empty Not done yields a stopped value other than clean, proven by a workflow-logic test that fails first
- [ ] #2 docs/limits.md:47 is updated or removed accordingly
<!-- AC:END -->
