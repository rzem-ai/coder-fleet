---
id: CF-18
title: Add a contract case for a transcript ending in a thinking block
status: To Do
assignee: []
created_date: '2026-09-27 02:26'
updated_date: '2026-09-27 02:28'
labels: []
dependencies: []
references:
  - claude/evals/lib/board-hook-contract.sh
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/README.md
priority: Low
type: chore
ordinal: 45000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-8 fix-round-3 coder. hooks/README.md item 16 (after CF-8) says a typed stop whose transcript's last assistant block is `thinking` passes unchecked, like a trailing tool call, but no contract case feeds a trailing thinking block; the claim is read from the jq `else empty` branch in board-subagent-stop.sh (~:221-227), not run. Add a case beside `stop-transcript-trailing-tool-passes` in claude/evals/lib/board-hook-contract.sh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A contract case feeds a transcript whose last assistant block is thinking and asserts the documented outcome
- [ ] #2 Mutating the classification so thinking is treated as text makes the case fail
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 02:28
---
Folded into CF-19 at the human's request, 2026-09-27, with CF-14, CF-15 and CF-16. Work happens there; this item closes with outcome/superseded when CF-19 lands.
---
<!-- COMMENTS:END -->
