---
id: CF-44
title: 'Fix a Low review finding in the round or drop it, never file it'
status: In Progress
assignee: []
created_date: '2026-09-27 06:59'
updated_date: '2026-09-27 09:27'
labels: []
dependencies:
  - CF-31
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/7'
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/agents/reviewer.md
  - claude/coder-fleet/agents/refuter.md
  - docs/plans/CF-44.md
priority: Medium
type: enhancement
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#7, part (c) (read as data). CF-31 (PR #6) covers parts (a) and (b): must-fix findings are `must fix:` Done bullets and Blocker: is a question only the human can answer. It does not say what happens to a Low finding: test hygiene, a misnamed test, a stale comment, a value nobody has confirmed. The issue proposes the handoff skill, reviewer.md and refuter.md say it is fixed in the current round or dropped, never filed as a Blocker or a Propose item. Fathom's .claude/rules/review-findings.md (commit c6dd6c2) is named as a draft. Builds on CF-31.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The handoff skill defines Low and its low: bullet; its example matches the fixture, and handoff-parity.sh failed first
- [ ] #2 reviewer.md, refuter.md, lead.md and board-conventions state the rule, and no body says to file a Low finding; line counts are unchanged
- [ ] #3 review-round hands Low findings to a fix round that is running anyway and drops them otherwise; Low never widens gateFix and never starts a round; the six new workflow-logic.mjs cases failed first and now pass
- [ ] #4 The reviewer and refuter rubrics grade the rule; the migration-checklist table is in the PR; check-all passes, run once
- [ ] #5 The patch bump is the last commit; after merge: tagged and pushed, and CF-34 has its comment
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-44.md approved by the human 2026-09-27, every open question on the recommended answer. Criteria replaced by the plan's Done when. Build waits for PR #6 (CF-31) to merge; branch cut from origin/main then.
---
<!-- COMMENTS:END -->
