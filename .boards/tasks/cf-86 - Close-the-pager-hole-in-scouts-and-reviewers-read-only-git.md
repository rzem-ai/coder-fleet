---
id: CF-86
title: Close the pager hole in scout's and reviewer's read-only git
status: To Do
assignee: []
created_date: '2026-09-30 05:55'
labels:
  - hooks
dependencies: []
priority: Medium
type: bug
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the CF-84 coder, 2026-09-30. CF-84 denies any command that runs gh while setting GH_PAGER, PAGER, GH_BROWSER, BROWSER, GH_EDITOR, EDITOR or VISUAL, because each names a program gh would run. The read-only git rules for scout and reviewer in claude/coder-fleet/hooks/enforce-agent-scope.sh likely have the same hole: `GIT_PAGER=<program> git log`, or PAGER when a pager is already exported, would make an allowed git log run an arbitrary program. Untested.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A contract case in claude/evals/lib/scope-hook-contract.sh shows whether scout's and reviewer's allowed git commands can run a program through GIT_PAGER, PAGER, GIT_EXTERNAL_DIFF, core.pager via -c, or similar
- [ ] #2 Every such route is denied for scout and reviewer, with a contract case for each
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
