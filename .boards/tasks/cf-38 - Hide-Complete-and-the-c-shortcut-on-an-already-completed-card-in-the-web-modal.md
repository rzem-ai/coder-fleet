---
id: CF-38
title: Hide Complete and the c shortcut on an already-completed card in the web modal
status: To Do
assignee: []
created_date: '2026-09-27 06:51'
labels: []
dependencies:
  - CF-26
references:
  - docs/plans/CF-26.md
priority: Low
type: bug
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-26 coder. On a card already in .boards/completed/, the web detail modal still offers Complete and the `c` shortcut, and the POST returns 404 "Task not found" (TaskDetailsModal.tsx:512-515, :1113, :1139-1141 in claude/coder-fleet/board). This was CF-26 plan open question 4, deferred out of that PR.
<!-- SECTION:DESCRIPTION:END -->
