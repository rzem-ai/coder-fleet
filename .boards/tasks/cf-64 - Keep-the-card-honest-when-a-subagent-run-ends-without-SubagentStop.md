---
id: CF-64
title: Keep the card honest when a subagent run ends without SubagentStop
status: In Progress
assignee: []
created_date: '2026-09-28 23:57'
updated_date: '2026-09-29 00:04'
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
- [ ] #5 SubagentStop writes a per-agent stopped marker, and a new PostToolUse hook on the Agent tool comments on the bound card when a foreground spawn returns with no marker (naming the turn cap when the runtime says so), never moving a column; contract cases written red first, bash 3.2 included
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-29 00:03
---
E2b repeated outside the nested sandbox on 2026-09-29, Claude Code 2.1.283, in a scratch area from the CF-12.1 harness. Foreground runs, the parent told to wait: 3 of 3 runs cut off by the 3-turn cap produced no SubagentStop (fg2, fg3, fg4), against 2 of 2 captures for runs that finished on their own (E2a, fg1). The default E2b run was backgrounded by the runtime and is excluded as confounded. Outcome B: no hook fires at the cap, sandbox or not. New finding: PostToolUse fires in the parent when a foreground Agent call returns. Its payload carries tool_response.agentId, agentType, status "completed" and a content note "this agent stopped at its N-turn limit before finishing ... PARTIAL output ... Send the agent a message (SendMessage) to let it continue". So the fix is machinery, not only lead prose: SubagentStop writes a per-agent stopped marker, and a PostToolUse hook on the Agent tool comments on the bound card when the returned agent has no marker (turn cap, or cut off otherwise), moving no column. Background spawns report only at launch, so lead.md keeps the rule for those and limits.md records the gap. The spike self-test also had a bug (the main checkout root resolved to $HOME from the main checkout, creating ~/.claude/worktrees/some-session, since removed); fixed on cf-64-cutoff-honesty (1a064a3).
---
<!-- COMMENTS:END -->
