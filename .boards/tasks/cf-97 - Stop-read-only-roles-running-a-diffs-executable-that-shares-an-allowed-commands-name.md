---
id: CF-97
title: >-
  Stop read-only roles running a diff's executable that shares an allowed
  command's name
status: To Do
assignee: []
created_date: '2026-09-30 09:23'
labels:
  - hooks
  - security
dependencies: []
priority: Medium
type: bug
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-90 review, 2026-09-30, and older than CF-90. claude/coder-fleet/hooks/enforce-agent-scope.sh matches a read-only role's allowed commands (reviewer, scout) by basename, so `./scripts/cat`, an executable a diff under review adds, runs as if it were `cat`. That contradicts the reviewer's "nothing else that executes code" invariant from CF-90, and scout's read-only rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For reviewer and scout, an allowed read command given with a path (./x/cat, ../cat, /tmp/cat, sub/grep) is denied unless it resolves to the system binary, with a contract case per form
- [ ] #2 Plain `cat`, `grep` and the rest are still allowed; the existing scope contract passes
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
