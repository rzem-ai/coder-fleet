---
id: CF-10
title: Make the fleet-steward smoke eval end in a handoff
status: To Do
assignee: []
created_date: '2026-09-27 01:24'
labels: []
dependencies: []
references:
  - claude/coder-fleet/agents/fleet-steward.md
  - claude/evals/fleet-steward/rubric.md
  - claude/evals/run.sh
priority: Medium
type: bug
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-8 coder. `claude/evals/run.sh fleet-steward`, run once on the CF-8 branch (2026-09-27, results in claude/evals/results/20260927T011428Z/, gitignored), scored 62% on the rubric (5/9, 5/8, 5/8, 1/1) with every deterministic check passing, but the verdict was FAIL: the handoff gate failed on all four prompts ("missing heading(s): ## Done, ## Not done, ## Unverified, ## Decisions needed"; "3 other level-2 heading(s), first at line 3: ## What the diff shows"), and every run hit Bash permission denials inside the eval. The steward body changed by one clause in CF-8, and there is no baseline, so it is unknown whether this is new. Find whether the steward body or the eval setup is at fault, fix it, and record a first baseline with --update-baseline once it passes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cause identified as body, eval setup or both, with the evidence
- [ ] #2 All four fleet-steward eval prompts end in a four-heading handoff and pass the handoff gate
- [ ] #3 baseline.json records a first score
<!-- AC:END -->
