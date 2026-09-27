---
id: CF-30
title: Keep a resumed subagent bound to the item it started on
status: To Do
assignee: []
created_date: '2026-09-27 03:18'
updated_date: '2026-09-27 07:14'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-subagent-start.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - 'https://github.com/rzem-ai/coder-fleet/issues/10'
  - docs/plans/CF-30.md
priority: Medium
type: bug
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by spec-writer (CF-24/CF-25 drafting). A SendMessage resume re-fires SubagentStart, which rebinds the agent to whatever `.boards/.focus` says at resume time, not the item it was spawned on. On 2026-09-27 a resumed CF-12 spec-writer bound to CF-8 and posted its blocker there (CF-8 comment #8). Today only a lead practice in memory covers it (focus the agent's own item before resuming). Fix in the hook: on SubagentStart for an agent id that already has a binding record, keep the first binding and log the focus mismatch. Note CF-23's clock uses the same keep-the-first rule for its own record.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A second SubagentStart for the same agent id keeps the first item and logs when the focus differs; the record is never rewritten
- [ ] #2 resume-blocker-comments-first failed on the old hook and passes: bind to A, focus B, re-fire start, and the Blocker stop comments on A and moves A
- [ ] #3 resume-moves-blocked-human and live-resume-from-blocked-human pass, proving a resume moves a Blocked-by-human card back to In Progress; a resume on a Done card leaves it there
- [ ] #4 board-conventions, lead.md, the hooks README, limits.md and fleet-design.md state the resume rule, and migration-checklist ran over lead.md
- [ ] #5 check-all.sh passes, run once, and the plugin patch is bumped in the last commit
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 06:59
---
GitHub #10 folded in (2026-09-27). A resume re-fires SubagentStart and board-subagent-start.sh writes the in-progress column on every start, so on main a resume should already move a Blocked-by-human card back. Hypothesis for the plan to prove with a contract case: Fathom's stuck card was CF-42's board.env status mismatch failing every move, not a missing resume event. Plan adds that case alongside the keep-first-binding fix.
---

author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-30.md approved by the human 2026-09-27, every open question on the recommended answer. Criteria replaced by the plan's Done when (the plan wins). Phase 1 of 3 starting: one coder, on its own branch from origin/main. CF-42 follows after this merges (same files).
---
<!-- COMMENTS:END -->
