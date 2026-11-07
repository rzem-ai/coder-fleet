---
id: CF-182
title: Stop the lead ending every reply with its own handoff
status: To Do
assignee: []
created_date: '2026-11-07 11:12'
updated_date: '2026-11-07 11:18'
labels:
  - lead
  - evals
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/pull/126'
priority: High
ordinal: 306000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 7 November 2026, from a Fathom session: "the \"Decisions needed\" section is being populated with poposals that are distracting from getting work done, and is wasting tokens. get rid of the \"End every reply to the human with your own handoff in the handoff format ...\" from the claude open opencode agents in `coder-fleet`". Reverses the every-reply choice recorded on CF-178. Asked where an unmatched Propose item: line goes once the lead has no Decisions needed of its own, Alex chose a comment on the card being worked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claude/coder-fleet/agents/lead.md and opencode/coder-fleet/agent/lead.md no longer tell the lead to end its replies with its own four-heading handoff, and still tell it to reject a subagent result missing one of the four headings
- [ ] #2 In claude/coder-fleet/agents/lead.md, a subagent Propose item: line that matches no card becomes a comment on the card being worked, never a line in the reply; the OpenCode lead, which has no board, gives it one line in the reply, recorded in the divergence register
- [ ] #3 A question the lead needs the human to answer goes to them in the session (AskUserQuestion where the harness has it) and, in the Claude Code lead, as an actionsAdd question on the card, not as a Blocker: line in a handoff of its own
- [ ] #4 claude/evals/run.sh no longer applies the four-heading gate to the lead, a lead check fails a run whose final message carries any of the four headings, and the lead rubric and prompt 04 no longer ask for the lead own handoff
- [ ] #5 bash claude/evals/lib/check-all.sh passes on the branch
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-11-07 11:12
---
Sub-issue 1 of 1: started. Done still needs: criteria 1 to 5.

Done: nothing yet. Not done: the lead in both harnesses still ends every reply with Done, Not done, Unverified and Decisions needed, and still lists unmatched proposals under its own Decisions needed. The lead builds this itself under the size floor (prose and an eval script; no endpoint, schema or credential path) in a worktree on branch cf-182-stop-lead-own-handoff, landing through a draft PR.
---

author: @lead
created: 2026-11-07 11:18
---
Spotted while building, not commissioned: check-all.sh fails in suite-coverage, roster-contract, roster-readme-fixture, requirements-source and next-column, on a clean origin/main (b0cf424) as well as on this branch, so CF-182 does not cause it. roster-contract named 9, 2 and 3 failing agents across three runs of the same commit; claude/evals/lib/roster-contract.sh:173 pipes awk into grep -qx under set -o pipefail, so an early grep exit SIGPIPEs awk and the check fails at random. Criterion 5 cannot pass until that is fixed; it needs its own card if Alex wants one.
---
<!-- COMMENTS:END -->
