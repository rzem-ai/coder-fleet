---
id: CF-182
title: Stop the lead ending every reply with its own handoff
status: Next
assignee: []
created_date: '2026-11-07 11:12'
updated_date: '2026-11-08 04:23'
labels:
  - lead
  - evals
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/pull/126'
priority: High
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 7 November 2026, from a Fathom session: "the \"Decisions needed\" section is being populated with poposals that are distracting from getting work done, and is wasting tokens. get rid of the \"End every reply to the human with your own handoff in the handoff format ...\" from the claude open opencode agents in `coder-fleet`". Reverses the every-reply choice recorded on CF-178. Asked where an unmatched Propose item: line goes once the lead has no Decisions needed of its own, Alex chose a comment on the card being worked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 claude/coder-fleet/agents/lead.md and opencode/coder-fleet/agent/lead.md no longer tell the lead to end its replies with its own four-heading handoff, and still tell it to reject a subagent result missing one of the four headings
- [x] #2 In claude/coder-fleet/agents/lead.md, a subagent Propose item: line that matches no card becomes a comment on the card being worked, never a line in the reply; the OpenCode lead, which has no board, gives it one line in the reply, recorded in the divergence register
- [x] #3 A question the lead needs the human to answer goes to them in the session (AskUserQuestion where the harness has it) and, in the Claude Code lead, as an actionsAdd question on the card, not as a Blocker: line in a handoff of its own
- [x] #4 claude/evals/run.sh no longer applies the four-heading gate to the lead, a lead check fails a run whose final message carries any of the four headings, and the lead rubric and prompt 04 no longer ask for the lead own handoff
- [x] #5 bash claude/evals/lib/check-all.sh passes on the branch
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
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

author: @lead
created: 2026-11-07 11:31
---
Reviewer proposals from round 1 (b0cf424..2fa4efb), parked here per the new rule, not filed:
1. Replace producer | grep -q under pipefail in roster-contract.sh, suite-coverage.sh, requirements-source-contract.sh and next-column-contract.sh, audit claude/evals/lib for the shape, and add a check that runs each script several times and fails on differing results. Two review runs plus mine show roster-contract and suite-coverage naming different items on one commit.
2. Where an unmatched Propose item: goes on a cardless ask. Taken as a default in the fix round (e5a8f62): one line in the reply when no card is being worked.

Fix round e5a8f62 closed both must fix findings (Invariant 1 in both leads, /drain step 5) and the lows (agent contract exception, fleet-design wording, LD04b, run.sh comment, new lead-checks-contract.sh). Narrow review of e5a8f62 running.
---

author: @lead
created: 2026-11-07 11:39
---
Sub-issue 1 of 1: ready to merge in PR #126. Done still needs: merge, the v0.48.0 tag pushed, then every criterion ticked on main.

Done: on the branch, the lead in both harnesses ends its replies in prose with none of the four headings, /drain no longer ends a pass with them, an unmatched proposal goes as a comment on the card being worked (one line in the reply when there is none, and in the OpenCode port), and the lead eval fails a reply that carries the headings (lead-checks-contract.sh, 6 cases). Review round 1 asked for changes; fix round e5a8f62; round 2 approved. CI (deterministic) passes on the PR. Not done: not merged, so no session sees the change yet; the PR is still a draft because this repo grants the lead no step past opening it; lead/baseline.json is not re-recorded (needs a paid run.sh lead run); check-all.sh fails locally on this Mac in five sections that also fail on origin/main (the pipefail race above), though CI passes.
---

author: @lead
created: 2026-11-07 11:57
---
Sub-issue 1 of 1: merged to main at 812afd6. Done still needs: the v0.48.0 GitHub Release from board-binaries.yml, and the Definition of Done ticks, which the board CLI cannot make (no DoD tick flag) and this session's board tools cannot reach.

Criteria ticked on main at 812afd6 (PR #126, tag v0.48.0 on e5a8f62):
1. lead.md in both harnesses: Handoff says the lead emits none of its own and still rejects a result missing the four headings; Invariant 1 says report it in your reply (round 2 review).
2. Claude lead step 5 sends an unmatched Propose item: to a comment on the card being worked, or one line in the reply with no card; OpenCode step 5 gives it one line, row in opencode/docs/divergence-register.md.
3. Claude lead Handoff: questions via AskUserQuestion and actionsAdd; OpenCode: the question tool.
4. run.sh gives the lead n/a in the handoff column; lead/checks.sh LD-nohandoff, pinned by claude/evals/lib/lead-checks-contract.sh (6 passed); rubric and prompt 04 updated.
5. CI deterministic job (check-all.sh) passed on PR head e5a8f62. Locally on Alex's Mac five sections fail on origin/main too (pipefail race, comment above).

Done for Alex: once the plugin updates to 0.48.0, the lead, /drain included, ends replies in prose with no Done / Not done / Unverified / Decisions needed block, and proposals land here as card comments. Not done: the installed plugin is still 0.47.0 until updated; lead/baseline.json not re-recorded.
---

created: 2026-11-08 04:23
---
Definition of Done ticked by the lead, 8 Nov 2026, on evidence:
1. check-all.sh: CI's deterministic job passed on PR #126 head e5a8f62 (comment #5).
2. Reviewer: round 2 approved (comment #4); no refuter round, because the project runs in the build phase (no .claude/coder-fleet.json) and the change touches no authentication or credential path.
3. migration-checklist: findings are on PR #126 in a review or comment that names it (gh pr view 126).
4. Version: v0.48.0 in plugin.json and marketplace.json, tag v0.48.0 on the release commit e5a8f62, GitHub Release v0.48.0 published with 6 board binary assets; the installed plugin is now 0.48.0.
5. Divergence register: opencode/docs/divergence-register.md line 118, the unmatched Propose item: row.
6. not applicable: CF-182 has no spec.

Done: everything on this card is shipped and in the plugin you run. Not done: the card still sits in Next; moving it to Done is the human's (or a completing task's), not the lead's.
---
<!-- COMMENTS:END -->
