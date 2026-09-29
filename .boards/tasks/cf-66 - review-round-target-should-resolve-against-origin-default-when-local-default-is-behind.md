---
id: CF-66
title: >-
  review-round target should resolve against origin/<default> when local default
  is behind
status: To Do
assignee: []
created_date: '2026-09-29 12:28'
labels: []
dependencies: []
references:
  - CF-3
priority: Low
type: enhancement
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-3 reviewer (2026-09-29). With CF-3, `target: <branch>` resolves to `<local default>...<branch>`. If local `main` is behind `origin/main`, the merge-base is older, so the diff picks up upstream commits that the branch merged in. Decide whether `target` should resolve against `origin/<default>`, and how to behave when there is no remote.
<!-- SECTION:DESCRIPTION:END -->
