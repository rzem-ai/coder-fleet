---
id: CF-196
title: >-
  Make the lead ask its open questions with AskUserQuestion, and add a command
  that asks every one on the board
status: Done
assignee: []
created_date: '2026-11-11 23:11'
updated_date: '2026-11-12 00:31'
labels: []
dependencies: []
priority: Medium
type: enhancement
ordinal: 331000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human in the session, 12 Nov 2026, after a drain ended with four parked questions listed in prose: "please add something into the `lead.md` file, and a command, that states that if there you are waiting on answers/decisions from me that you ask them using the Q&A tool."

The lead's Handoff section already sends a question to the human with AskUserQuestion, but nothing covers the questions already waiting: an unticked Actions for Human entry on a card, a card a drain parked, a decision a review left for the human. The lead reports those in prose and stops. `/coder-fleet:triage` asks open actions only on cards In Progress, Blocked and Blocked by human, so a parked card in Next is never asked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lead.md says that whenever the lead is waiting on the human's answers or decisions - a question of its own, an unticked Actions for Human entry, a card a drain parked - it asks them with AskUserQuestion in the session, with options and the recommended one first, and never leaves them only in prose
- [x] #2 A new command, /coder-fleet:ask, lists every unticked Actions for Human entry on the board, whatever the card's column short of Done, asks each with AskUserQuestion at most four to a prompt, and records each answer on its card as triage does, moving no column and starting no build
- [x] #3 The README's command paragraph and the design doc's commands tree name the new command
- [x] #4 The OpenCode port's lead carries the rule with its own `question` tool, or the divergence register says why not
- [x] #5 `bash claude/evals/lib/check-all.sh` passes
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
created: 2026-11-11 23:11
---
Sub-issue 1 of 1: started, 12 Nov 2026. Done still needs: criteria 1 to 5.

Lead notice: the lead gains a rule to ask every answer or decision it is waiting on with AskUserQuestion, and a new command, /coder-fleet:ask, asks every open Actions for Human entry on the board and records the answers. What the human will see: open questions arrive as a prompt to pick from, never as a list in prose, and one command clears the backlog after an unattended drain.

The lead builds this itself: under the size floor (no endpoint, no schema, no credential path). Lead defaults: the command is named `ask`; the rule sits in the lead body's Handoff section, beside the sentence that already sends a new question through AskUserQuestion; a drain still parks its questions on the card while it runs unattended, and the rule has the lead ask them when the human is next in the session; a decision a review left for the human with no action on the card is added with actionsAdd first, so the command finds it.

Done: nothing yet. Not done: the lead still reports waiting questions in prose.
---

author: lead
created: 2026-11-11 23:25
---
Sub-issue 1 of 1: merged to main (PR #158, squash-merged by the lead under the Shipping line, 12 Nov 2026). Done still needs: Definition of Done 4, the version bump and tag, which are the human's.

Review round 1 (e7c332e..1e2f236): approve, no must-fix. Gates run by the reviewer at 1e2f236: check-all.sh exit 0, scope-hook 916/0, board-hook 268/0, handoff-parity 32 agree. CI on 1e2f236: deterministic pass.

Ticked on evidence, each read by the reviewer: criterion 1 (lead.md's Handoff paragraph); 2 (commands/ask.md); 3 (claude/README.md and the design doc's commands tree, and a grep found no other list of commands); 4 (the port's lead carries the rule with its `question` tool; no command is ported because the port has no board, as with triage and drain); 5 (the reviewer's and CI's runs). Definition of Done: 1 the same runs; 2 the review approved, no break round for prose; 3 the checklist's result, no findings, is in PR #158; 5 not applicable: the port's lead carries the same rule, so there is no divergence to register; 6 not applicable: no spec.

Low, dropped under the build phase and recorded here: ask.md step 5 says a card in Blocked by human leaves it by a hook once every entry is ticked. That is wrong: ticking the last action moves nothing, and the card leaves on its next agent start or when the human moves it. Unverified: the lead cannot tell whether the human is present, so after an unattended drain's last line it could raise the prompt and wait there; no model run has shown the lead follows the rule.

Done: on main, the lead is told to ask what it is waiting on as a prompt, and /coder-fleet:ask exists. Not done: not released, so no install has either yet.
---

author: lead
created: 2026-11-11 23:39
---
Action 1 answered by the human in the session, 12 Nov 2026: "Fix all four (Recommended)". The four wording fixes go in one small pull request on a card of their own, filed next.
---

author: lead
created: 2026-11-12 00:13
---
Released in v0.52.0, 12 Nov 2026: bump 7479a72, tag v0.52.0 pushed, flush 95ddde7. Ticked: Definition of Done 4. Every criterion and Definition of Done item is now ticked. The false sentence in ask.md recorded in comment 2 was corrected by CF-197 in the same release.

Done: this card's change is in v0.52.0. Not done: it has not run in a live session yet.
---

author: @board
created: 2026-11-12 00:31
---
Actions for Human cleared: CF-196 moved from In Progress to Done.

- #1 (ticked) Reviews left four small wording faults in what merged today: one false sentence in the new /coder-fleet:ask command (it says a card leaves Blocked by human as soon as its last action is ticked, and it does not), and three gaps in the keep-local-main-level rule from CF-195 (a failed fetch, a checkout on another branch, a flush that declines to fast-forward). Should I fix all four in one small pull request before you release?
---
<!-- COMMENTS:END -->
