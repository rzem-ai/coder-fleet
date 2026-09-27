---
id: CF-50
title: Show a stale worktree lock's pid and start time in the prune report
status: To Do
assignee: []
created_date: '2026-09-27 08:01'
labels: []
dependencies:
  - CF-41
priority: Low
type: enhancement
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-41 coder, 2026-09-27. After CF-41, prune-worktrees never unlocks or removes a locked worktree (the harness locks one only while its agent runs, reason `claude agent <id> (pid N start <date>)`). A lock left by a crashed agent therefore keeps its worktree forever, and the report only says `kept <path> locked`. Report the lock reason's pid and start time, and whether that pid is alive, so the human can judge and unlock by hand. The script itself still never unlocks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A kept locked line carries the lock's pid and start time, and whether the pid is alive
- [ ] #2 The script still never runs git worktree unlock, pinned by the existing static check
<!-- AC:END -->
