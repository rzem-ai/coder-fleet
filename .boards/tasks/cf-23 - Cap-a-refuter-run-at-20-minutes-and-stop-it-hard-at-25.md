---
id: CF-23
title: Cap a refuter run at 20 minutes and stop it hard at 25
status: To Do
assignee: []
created_date: '2026-09-27 03:02'
updated_date: '2026-09-27 03:07'
labels: []
dependencies: []
references:
  - claude/coder-fleet/agents/refuter.md
  - claude/coder-fleet/skills/looping/SKILL.md
  - claude/coder-fleet/hooks/enforce-agent-scope.sh
  - claude/coder-fleet/hooks/hooks.json
  - docs/limits.md
priority: High
type: feature
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's rule, 2026-09-27: "a refuter MUST NOT run for more than 20 minutes. please add the required changes to tell it to keep to 20 minutes, and a hard hook to kill it after 25". Context: the CF-8 round-1 refuter ran 24 minutes; the looping skill and recent briefs gave refuters up to an hour of suite time.

Two parts:
1. Tell it: the refuter body and the looping skill (preloaded into refuter and coder) state a 20-minute wall-clock budget for a refuter run, with how to prioritise and that a handoff before the deadline beats a complete one after it.
2. Stop it: a hook that ends a refuter run after 25 minutes. Claude Code hooks cannot kill a running subagent process, so the likely mechanism is: SubagentStart records the refuter's start time per agent id; the PreToolUse scope hook (enforce-agent-scope.sh) denies every tool call from that agent id once 25 minutes have passed, with a message telling it to write its handoff; the agent can then only end. Limit to state plainly: a Bash command already running at 25 minutes finishes first, so the true ceiling is 25 minutes plus one in-flight command. The plan confirms the mechanism against the hooks as they are and names anything better.

The running CF-9 and CF-12.2 refuters were told the 20-minute rule by message on 2026-09-27.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The refuter body and the looping skill state the 20-minute budget; migration-checklist findings for the body and the skill in the PR
- [ ] #2 A hook denies every tool call from a refuter run more than 25 minutes after its SubagentStart, with a message telling it to write its handoff, proven by a contract case that fails first
- [ ] #3 The hook does not affect any other agent type, and a refuter under 25 minutes is unaffected
- [ ] #4 docs/limits.md records that an in-flight command can run past 25 minutes, and the design and hooks README describe the cap
- [ ] #5 check-all.sh passes; version bump
- [ ] #6 The refuter body tells it to work in a scratch subdirectory unique to its run, because the session scratchpad is shared between agents running at the same time
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 03:07
---
Added AC: observed 2026-09-27, the CF-9 and CF-12.2 refuters ran at once in the same session scratchpad and one's mut.sh and patch.log overwrote the other's mid-batch. The refuter body is changing in this item anyway, so the run-unique scratch subdirectory rule goes in with the time budget.
---
<!-- COMMENTS:END -->
