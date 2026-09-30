---
id: CF-85
title: Warn when a workflow run's earliest lane has no start record
status: To Do
assignee: []
created_date: '2026-09-30 05:55'
labels:
  - hooks
dependencies:
  - CF-80
priority: Low
type: enhancement
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-80 review, 2026-09-30. At SubagentStop, CF-80 resolves a workflow run's item from the earliest-started lane that has a start record. If that lane's start hook failed (no jq, a timeout), state_earliest_started in claude/coder-fleet/hooks/lib/board.sh skips it without a word and takes the next-earliest lane. That lane may have started after a refocus, so the run lands on the new card and no log line says the earliest lane was missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a workflow run has more lanes with transcripts than lanes with start records, SubagentStop logs a warning naming the run and the lanes with no start record, with a contract case in claude/evals/lib/board-hook-contract.sh
- [ ] #2 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
