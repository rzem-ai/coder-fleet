---
id: CF-64
title: Keep the card honest when a subagent run ends without SubagentStop
status: To Do
assignee: []
created_date: '2026-09-28 23:57'
labels: []
dependencies:
  - CF-12.1
priority: High
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human 2026-09-29, from the CF-12.1 findings (docs/findings/CF-12.1-claude-code-behaviours.md): a run cut off by maxTurns mid-task never ended with a handoff (4 of 4), and SubagentStop did not fire (0 of 4, against 4 of 4 for runs that finished normally). That was measured inside a nested sandbox; background dispatch and sandbox-plus-cap remain open explanations. When SubagentStop does not fire there is no handoff gate, no card comment and no move to Blocked, so the card sits in In Progress saying nothing. No fleet agent sets maxTurns today, but CF-12's editors will (maxTurns 15), and any run that is cut off (a crash, an exhausted budget) may hit the same gap. lead.md already treats a missing handoff as a failed run (Invariants), but tells nobody on the board. The response depends on the E2b repeat outside the sandbox (the findings give the command): B, the hook never fires, means lead detection plus a limits entry; A1, it fires and the gate's exit 2 gets a handoff, means record it; A2, it fires but the agent cannot answer past the cap, means a SubagentStop branch that comments "stopped at its turn cap".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 E2b is repeated outside the nested sandbox, and whether SubagentStop fires at the cap is recorded in the findings with the command and the evidence
- [ ] #2 lead.md: when a spawn returns without a four-heading handoff, the lead comments on the card that the run ended without one and what it will do next, never leaving the card silent; still six steps, under 60 lines
- [ ] #3 the outcome's own fix lands: a docs/limits.md entry (B or A1), or a board-subagent-stop.sh branch for a turn-cap transcript with a contract case written red first (A2)
- [ ] #4 check-all green, migration-checklist run over lead.md, version bumped and tagged
<!-- AC:END -->
