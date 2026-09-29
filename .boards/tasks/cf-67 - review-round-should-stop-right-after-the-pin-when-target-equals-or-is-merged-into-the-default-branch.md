---
id: CF-67
title: >-
  review-round should stop right after the pin when target equals or is merged
  into the default branch
status: To Do
assignee: []
created_date: '2026-09-29 12:28'
labels: []
dependencies: []
references:
  - CF-3
priority: Low
type: enhancement
ordinal: 94000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-3 reviewer (2026-09-29). A `target` equal to the default branch, or already merged into it, spends one scout scope lane and then reports "nothing to review". That outcome is honest, but the lane is wasted. Decide whether to throw right after the pin lane with an error naming the empty range.
<!-- SECTION:DESCRIPTION:END -->
