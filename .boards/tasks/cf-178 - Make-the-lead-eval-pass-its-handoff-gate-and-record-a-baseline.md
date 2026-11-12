---
id: CF-178
title: Make the lead eval pass its handoff gate and record a baseline
status: Done
assignee: []
created_date: '2026-11-04 23:16'
updated_date: '2026-11-11 23:24'
labels:
  - lead
  - evals
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 5 November 2026, answering whether the lead eval's missing-handoff failure gets its own card: "File a card".

Found while building CF-177 (PR #115). `claude/evals/run.sh lead` fails on the branch: prompts 01-route-the-work, 02-where-is-it and 03-not-ordered end without the four-heading handoff (`FAIL H1 missing heading(s): ## Done, ## Not done, ## Unverified, ## Decisions needed`), while 04 and 05 pass that gate. Every agent gate passes. The rubric scores 68% (36/53) against a baseline that has never been recorded. A gates-only run of the same three prompts on origin/main at 2958f18 fails the same gate the same way, so the failure predates CF-177.

Two causes are visible in the transcripts. The lead answers a question or a routing ask in prose, and its Handoff section asks for the handoff only "at the end of a delegated unit of work", so the body and the eval disagree on whether these prompts owe one. And the board is out of reach in the eval sandbox: the `task_list` permission was declined and the fixture has no `.boards/`, so rubric items that need a board read or a card comment (LD01h, LD04b, LD04f) cannot pass as written.

Results of the CF-177 run: `claude/evals/results/20261104T230408Z/lead/` in the cf-177-shipping-orders worktree, ignored by git.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every lead eval prompt passes the handoff gate: either the lead ends each one with the four-heading handoff, or the gate and the lead's Handoff section agree on which prompts owe one, and the card records which way it went and why
- [x] #2 The eval sandbox lets the lead reach the board tools its rubric grades (task_list, task_edit, task_create), or the rubric items that need them are rewritten to grade what the lead can do without a board, so no item fails only because the board is unreachable
- [x] #3 A run of claude/evals/run.sh lead that passes every gate is recorded as the baseline with --update-baseline, never by hand, and the run's rubric score is on the card
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
author: lead
created: 2026-11-04 23:41
---
Lead eval fixed in PR #116 (branch cf-178-lead-eval-handoff, v0.45.0). AC 1: the lead now ends every reply with its handoff, a quick answer and a not-started run included. The human chose this over narrowing the gate (asked 5 November 2026: every reply), because no hook reads the lead's own handoff and the scoped rule let even prompt 03, a delegated unit, drift into its own headings. The body also says the four are the only level-2 headings in the reply and that no Blocker asks leave for what is already ordered or decided; the first run without that sentence failed 01 and 03 on exactly those. AC 2: the rubric now says the workspace has no board on purpose, so a board write passes when the lead gives what it would write, and LD04b, LD04d and LD04f follow lead.md step 5. AC 3: run.sh lead --update-baseline recorded 81% with every gate passing (run 20261104T233349Z); the run before it scored 77%, also gate-clean. check-all passes. Not done: no fleet reviewer has run on #116, and v0.45.0 is tagged after merge. PR #115 (CF-177) needs run.sh lead rerun on top of this once it lands.
---

author: lead
created: 2026-11-11 22:11
---
Drain, 12 Nov 2026: parked on action 1, nothing built. PR #116 merged on 4 Nov 2026 and released as v0.45.0, so the card's build is done; what is open is a paid eval run, which this repo's AGENTS.md does not grant the lead.

Done: the lead eval passed every gate at 81% on v0.45.0. Not done: no baseline exists for the lead as it stands after CF-182 and CF-193.5.
---

author: lead
created: 2026-11-11 23:16
---
Action 1 answered by the human in the session, 12 Nov 2026: "close it". No new baseline run and no new card was ordered.

Sub-issue 1 of 1: merged to main at 6621ac8 (PR #116, 4 Nov 2026), released as v0.45.0. Done still needs: nothing.

Ticked as delivered at the time, on comment 1's evidence and the human's word: criterion 1 (every lead eval prompt passed the handoff gate in run 20261104T233349Z, the lead then ending every reply with its handoff, a choice CF-182 later reversed); 2 (the rubric was rewritten to grade what the lead can do without a board); 3 (run.sh lead --update-baseline recorded 81% with every gate passing). Definition of Done: 1 check-all passed (comment 1) and CI passed on the merge; 2 not met as written: no fleet review of PR #116 is recorded, accepted by the human's answer; 3 not recorded, accepted the same way; 4 v0.45.0, tagged; 5 not applicable: no ported artefact changed; 6 not applicable: no spec.

Done: the lead eval passed its gates at 81% on v0.45.0. Not done: no baseline exists for the lead as rewritten by CF-182 and CF-193.5; that is unordered and on no card.
---

author: @board
created: 2026-11-11 23:24
---
Actions for Human cleared: CF-178 moved from Next to Done.

- #1 (ticked) This card's work merged in PR #116 (v0.45.0, 4 Nov 2026) with an 81% baseline recorded. Since then CF-182 reversed criterion 1's choice (the lead now ends in prose and emits no handoff) and CF-193.5 rewrote the lead's body, so that baseline measures a lead that no longer exists. A fresh baseline is a paid eval run. Should I run `claude/evals/run.sh lead` on the current lead and record a new baseline (paid), or close this card as delivered and leave the new baseline to a card of its own?
---
<!-- COMMENTS:END -->
