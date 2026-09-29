---
id: CF-72
title: Fix the agent-contract line that forbids every board write by an agent
status: To Do
assignee: []
created_date: '2026-09-29 13:59'
updated_date: '2026-09-29 14:14'
labels: []
dependencies: []
references:
  - docs/agent-contract.md
  - docs/specs/CF-24.md
  - claude/coder-fleet/agents/lead.md
priority: Low
type: docs
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Carried out of CF-24 when it was archived on 2026-09-29, at the human's word, as superseded by CF-58. `docs/agent-contract.md:80` forbids every board write by an agent. The lead does file items, comment, tick criteria and manage Actions for Human through `task_edit`, as `lead.md` step 5 requires, and fleet-steward files its own items. The contract should say what is actually forbidden, which is setting a column, and name which fields the lead and fleet-steward may write. See docs/specs/CF-24.md, "The agent-contract line".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `docs/agent-contract.md` forbids agents setting a board column, and names the board writes the lead and fleet-steward make (filing items, comments, criteria ticks, Actions for Human) as allowed
- [ ] #2 No sentence in `docs/agent-contract.md`, `docs/fleet-design.md` or the board-conventions skill still says an agent makes no board write at all
- [ ] #3 bash claude/evals/lib/check-all.sh is green
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-29 14:14
---
Duplicate. Folded into CF-24 criterion #1, carried by sub-issue CF-24.1, when the human approved the revised CF-24 spec on 2026-09-30. Spec-writer's check found that no sentence says an agent makes no board write, so this card's #2 already holds. What remains is adding DoD ticks and the replacement of provisional criteria to agent-contract.md:80. Archived.
---
<!-- COMMENTS:END -->
