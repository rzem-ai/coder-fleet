---
id: CF-178
title: Make the lead eval pass its handoff gate and record a baseline
status: To Do
assignee: []
created_date: '2026-11-04 23:16'
updated_date: '2026-11-04 23:41'
labels:
  - lead
  - evals
dependencies: []
ordinal: 302000
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
- [ ] #1 Every lead eval prompt passes the handoff gate: either the lead ends each one with the four-heading handoff, or the gate and the lead's Handoff section agree on which prompts owe one, and the card records which way it went and why
- [ ] #2 The eval sandbox lets the lead reach the board tools its rubric grades (task_list, task_edit, task_create), or the rubric items that need them are rewritten to grade what the lead can do without a board, so no item fails only because the board is unreachable
- [ ] #3 A run of claude/evals/run.sh lead that passes every gate is recorded as the baseline with --update-baseline, never by hand, and the run's rubric score is on the card
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
author: lead
created: 2026-11-04 23:41
---
Lead eval fixed in PR #116 (branch cf-178-lead-eval-handoff, v0.45.0). AC 1: the lead now ends every reply with its handoff, a quick answer and a not-started run included. The human chose this over narrowing the gate (asked 5 November 2026: every reply), because no hook reads the lead's own handoff and the scoped rule let even prompt 03, a delegated unit, drift into its own headings. The body also says the four are the only level-2 headings in the reply and that no Blocker asks leave for what is already ordered or decided; the first run without that sentence failed 01 and 03 on exactly those. AC 2: the rubric now says the workspace has no board on purpose, so a board write passes when the lead gives what it would write, and LD04b, LD04d and LD04f follow lead.md step 5. AC 3: run.sh lead --update-baseline recorded 81% with every gate passing (run 20261104T233349Z); the run before it scored 77%, also gate-clean. check-all passes. Not done: no fleet reviewer has run on #116, and v0.45.0 is tagged after merge. PR #115 (CF-177) needs run.sh lead rerun on top of this once it lands.
---
<!-- COMMENTS:END -->
