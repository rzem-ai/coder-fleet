---
id: CF-102
title: Isolate eval workspaces from the coder-fleet board
status: To Do
assignee: []
created_date: '2026-09-30 10:00'
labels:
  - evals
dependencies: []
priority: Medium
type: bug
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-24.1 review, 2026-09-30. Smoke evals run in a workspace under claude/evals/results/<stamp>/, inside the coder-fleet repo, and the board is found through `git rev-parse --git-common-dir` (board-root.ts:31), so a task_create during an eval (for example the fleet-steward eval that OQ11 says to run on CF-24.1's PR) would probably file real items on this repo's board. Inferred from code, not observed. The fleet-steward FS-criteria task-file check also never runs for the same reason (the sample-app fixture has no .boards/).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An eval run's board writes land in a board inside the eval workspace (its own git repo or an explicit board root), never the coder-fleet board, proven by a runner-level deterministic case
- [ ] #2 FS-criteria's task-file check sees items the steward files during a run
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
