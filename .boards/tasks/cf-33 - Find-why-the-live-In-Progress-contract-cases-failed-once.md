---
id: CF-33
title: Find why the live In Progress contract cases failed once
status: To Do
assignee: []
created_date: '2026-09-27 04:15'
labels: []
dependencies:
  - CF-9
references:
  - claude/evals/lib/board-hook-contract.sh
  - claude/coder-fleet/hooks/lib/board.sh
priority: Medium
type: bug
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Intermittent failure (glossary sense: two runs, two outcomes on one commit). On CF-9 head a4b39f0 (2026-09-27), `board-hook-contract.sh` run 1 exited 1 with `live-start-in-progress` and `live-start-commits` failing (72 passed, 2 failed); run 2 with `-v` exited 0, 74 passed. No log survives from the failing run. Hypothesis, unshown: the extra status-probe bun call plus the edit exceeded the 10 s `BOARD_CLI_TIMEOUT` while several agents loaded the machine. Also in scope: a library-level contract case that sources `lib/board.sh` and calls `board_in_progress_column` outside a subshell, which is the only way to kill the "drop `local` at lib/board.sh:405" mutant (SubagentStart calls the resolver in `$(...)`, so the leak is invisible there).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The failing mode is reproduced (e.g. under load or with a short BOARD_CLI_TIMEOUT) and its cause named from a -v log, or a bounded number of loaded reruns shows no recurrence and says so
- [ ] #2 The live cases keep their -v output on failure so the next occurrence leaves evidence
- [ ] #3 A library-level case kills the dropped-local mutant at lib/board.sh:405, seen failing first
<!-- AC:END -->
