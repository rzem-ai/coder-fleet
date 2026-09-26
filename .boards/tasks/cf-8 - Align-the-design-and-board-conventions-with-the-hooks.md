---
id: CF-8
title: Align the design and board-conventions with the hooks
status: To Do
assignee: []
created_date: '2026-09-26 14:28'
updated_date: '2026-09-26 14:35'
labels: []
dependencies: []
references:
  - docs/fleet-design.md
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/README.md
  - claude/coder-fleet/agents/fleet-steward.md
  - docs/plans/CF-8.md
priority: Medium
type: docs
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Four places where docs/fleet-design.md and the board-conventions skill disagree with the hooks or with each other, found by reading the design on 2026-09-27 and confirmed by a scout pass. Decisions taken with the human in the same session:

1. Blocked via SubagentStop is dead code. `claude/coder-fleet/hooks/board-subagent-stop.sh:280` reads `.status // .completion_reason`, neither of which the shipped SubagentStop schema carries, so the Blocked write at lines 327-341 is unreachable (hooks/README.md:113 says so). The board-conventions skill still describes it as live. Decision: delete the dormant status branch from the hook, and correct the skill, hooks/README.md and design section 7 so only TaskCompleted writes Blocked.
2. Design section 3 is a hand-kept third copy of the glossary table that no check covers; it has already drifted (no Run article row, Project and Eval rows differ). Decision: replace the table with a pointer to the glossary skill.
3. Design section 7's "To do" row says "an agent proposing work" moves it; the skill and lead.md say the lead files proposals and fleet-steward files its own sweep. Decision: make the design match.
4. The steward's "Coder Fleet" project instruction (fleet-steward.md:28, design section 11 line 251) is CF-6; it is folded into this item's plan. Decision: drop the instruction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 board-subagent-stop.sh no longer reads a status field or writes Blocked; the contract tests that referenced that path are updated and bash claude/evals/lib/check-all.sh passes
- [ ] #2 board-conventions skill, hooks/README.md and design section 7 all say Blocked is written by TaskCompleted on failing tests only
- [ ] #3 Design section 3 points at the glossary skill instead of carrying the table, and section 8's no-third-copy claim is true
- [ ] #4 Design section 7's To do row matches board-conventions and lead.md
- [ ] #5 fleet-steward.md and design section 11 no longer name a Coder Fleet project; CF-6 closes with this item
- [ ] #6 migration-checklist run over fleet-steward.md, and a version bump in plugin.json and marketplace.json
<!-- AC:END -->
