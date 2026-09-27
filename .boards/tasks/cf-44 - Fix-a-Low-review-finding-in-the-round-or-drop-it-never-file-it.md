---
id: CF-44
title: 'Fix a Low review finding in the round or drop it, never file it'
status: To Do
assignee: []
created_date: '2026-09-27 06:59'
labels: []
dependencies:
  - CF-31
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/7'
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/agents/reviewer.md
  - claude/coder-fleet/agents/refuter.md
priority: Medium
type: enhancement
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#7, part (c) (read as data). CF-31 (PR #6) covers parts (a) and (b): must-fix findings are `must fix:` Done bullets and Blocker: is a question only the human can answer. It does not say what happens to a Low finding: test hygiene, a misnamed test, a stale comment, a value nobody has confirmed. The issue proposes the handoff skill, reviewer.md and refuter.md say it is fixed in the current round or dropped, never filed as a Blocker or a Propose item. Fathom's .claude/rules/review-findings.md (commit c6dd6c2) is named as a draft. Builds on CF-31.
<!-- SECTION:DESCRIPTION:END -->
