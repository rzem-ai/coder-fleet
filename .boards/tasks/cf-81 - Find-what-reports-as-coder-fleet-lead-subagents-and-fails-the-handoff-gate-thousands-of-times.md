---
id: CF-81
title: >-
  Find what reports as coder-fleet:lead subagents and fails the handoff gate
  thousands of times
status: To Do
assignee: []
created_date: '2026-09-30 03:58'
updated_date: '2026-10-06 13:22'
labels:
  - hooks
dependencies: []
priority: High
type: bug
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by the human 2026-09-30 (out of scope for CF-48/CF-80, filed after one look). ~/.local/state/coder-fleet/log/hooks.log has 3589 SubagentStop lines for `coder-fleet:lead` subagents and 3496 'handoff from coder-fleet:lead is malformed; exit 2 to make it re-emit' lines, the first at line 9 (2026-09-26T14:13:37Z, a2e13bd914dc4ab7d). The case the human saw: a51b554e099c0e5ff at 03:49:05Z on 30 Sep (lines 12475-12476), with many more around it (12462-12512). None of these ids has a SubagentStart line, and no transcript exists for a51b554e099c0e5ff. Nothing deliberately spawns a lead.

Facts from the scout: board-subagent-stop.sh:363-364 exits 2 on every malformed handoff, with no retry cap and no stop_hook_active check. The stop lines log neither session_id nor cwd (the hook reads them at 249-260), so a stop cannot be traced to a session or repo. This repo's .claude/settings.json:3 sets "agent": "coder-fleet:lead". Workflows spawn agentType-less lanes (spec-to-card.js ~379 and ~464, review-round.js ~437 and :559), and spec-to-card.js:375 assumes the matcher skips them.

Leading hypothesis, unconfirmed: a subagent spawned with no type in a session whose default agent is lead reports agent_type coder-fleet:lead. That makes the SubagentStop matcher gate it as a lead, reject its non-handoff output (a workflow lane's schema JSON, for example) as malformed, and force a re-emit. This costs tokens on every such lane in every project. Correlation is weak: 10 lead stops fell during this repo's first spec-to-card run (01:40-01:45Z), but 54 fell between 01:00 and 01:35Z, when the fathom session was also active.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The raw SubagentStop hook input for one such stop is captured, and the card names what spawned it and what agent_type it carried, quoted
- [ ] #2 Subagents that are not fleet agents doing handoff work (workflow lanes with no agentType, untyped general spawns) are not held to the handoff gate and never get exit 2, proven by a case in claude/evals/lib/board-hook-contract.sh or the handoff-check parity test
- [ ] #3 A stop that the hook does gate cannot re-emit without limit: a re-emit cap or a stop_hook_active check is in place, with a contract case
- [ ] #4 Every SubagentStop log line carries session_id and cwd
- [ ] #5 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-06 13:22
---
2026-10-06: the human chose to file this fault from today's log read and raise it to High (it already had this card, so it is not re-filed). New evidence: 1,403 lead malformed lines since 2026-10-05T12Z, from 1,394 distinct ids, and still no SubagentStart for any of them. Three fell at 13:19:41Z, 13:19:54Z and 13:20:13Z, during a lead turn in this repo's session b60f21ed that spawned no subagent and ran no workflow; one of them (adc478f720b7b04e2) was also counted as raising a Blocker with no card. Grepping ~/.claude/projects for those ids finds no subagent transcript. That weakens the untyped-workflow-lane hypothesis and points to the main session's own internal side calls (for example the away summary), which run under the session's agent type, coder-fleet:lead. AC #1 is still the way to confirm it.
---
<!-- COMMENTS:END -->
