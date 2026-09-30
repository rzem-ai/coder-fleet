---
id: CF-51
title: Apply the Models post-mortem to the lead body
status: Blocked by human
assignee: []
created_date: '2026-09-28 01:21'
updated_date: '2026-09-30 02:39'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/20'
  - 'https://github.com/rzem-ai/coder-fleet/issues/21'
  - 'https://github.com/rzem-ai/coder-fleet/issues/22'
  - 'https://github.com/rzem-ai/coder-fleet/issues/23'
  - 'https://github.com/rzem-ai/coder-fleet/issues/24'
  - claude/coder-fleet/agents/lead.md
priority: High
ordinal: 78000
---

## Actions for Human
<!-- ACTIONS:BEGIN -->
- [x] #1 [not a question] What does CF-51 cover? Paste the card's title and body, or re-spawn me with the board tools enabled.
- [x] #2 Is the draft Problem line, "the lead lets a repeated, small, already-understood ask stall, and reports on it in terms the human cannot check", the problem CF-51 solves?
- [x] #3 [not a question] Is #22 (the size floor and the lead building small changes itself) still worth doing now that CF-58 removed the second approval and CF-25 targets stale worktrees? If not, criteria 4 to 9 move to non-goals.
- [x] #4 For a small repeated ask, which rule wins: #21 raising it to High, which step 4 makes trigger a refuter, or #22's "no refuter under the floor"?
- [x] #5 Should "under about a day of one agent" be dropped from the size floor, kept as guidance only, or replaced with something measurable?
- [x] #6 If #22 stays, what may the lead build itself, now that it no longer writes designs?
- [x] #7 Now that step 3 carries the notice sentence, is #23 just the reread?
- [ ] #8 [not a question] Does the size floor's "no refuter" also give way to step 4's other refuter triggers (auth, authorisation, secrets, data writes including board and state files, a suspected test that passes with the fix reverted), or only to High? My recommendation is yes, to all of them. This blocks criteria 7, 9 and 11.
- [ ] #9 [not a question] Where does the lead's build branch live, given the board binary commits into whatever branch the main checkout has checked out, so a lead branch there would carry board commits into its PR? My recommendation is a worktree the lead cuts itself. This blocks criterion 13.
- [ ] #10 [not a question] What is the release tag called, and should it be annotated? My recommendation is an annotated `v<version>` on the release commit, pushed by the human. This blocks criterion 27.
<!-- ACTIONS:END -->

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the Fathom Models pages post-mortem (fathom docs/runs/2026-09-28-lead-models-live.md), GitHub issues #20 to #24, tracked as one item by the human decision in triage on 2026-09-28: all five edit agents/lead.md (How you work 2 and 3, Scope, Invariants) and the body is 48 of the 60 lines roster-contract.sh allows, so they are written together as one coherent pass. #22 also carries the size floor moved there from #9, defined once and used for both the review tier and the lead-builds exception. CF-24 (#11) and CF-42 (#14) also add lines to lead.md; the plan budgets the lines across all three. Triage decision on #20: the fast path fires on an explicit order OR a repeated request, as the issue proposes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #20: a design or build list the human ordered, or an outcome the human has asked for more than once, is the approval; the lead states in one line what it will spawn and spawns it, and lead.md How you work 3 and the Invariants line agree
- [ ] #2 #22: the size floor is named in lead.md (no new endpoint, no schema change, no credential path, under about a day of one agent), gives one agent and one review with no refuter, and under it the lead may build a design it wrote and spawn only the reviewer
- [ ] #3 lead eval rubric covers each rule, roster-contract passes, migration-checklist run on lead.md, check-all green, version bumped and tagged
- [ ] #4 #21: when the human asks again for something that already has an item, the lead comments the date and the human's words on it and raises it to High; a repeated request goes ahead of any sweep and any phase of another item at the next spawn, never by stopping a running phase, and the lead names what it moved back in one line
- [ ] #5 #22 guard-rails: when the lead builds, it calls task_focus and leaves the phase comment as it starts (no SubagentStart fires for its own build); it builds on a branch in the checkout and lands it through a PR, never on main; the gates come from review-round's tests and types-and-build lanes (gates, gatesMissing), not from the lead that wrote the code
- [ ] #6 #23: a plan opens with the human's words for the item, quoted from the card; each plan phase and each phase brief carries one sentence saying what the human will see or be able to do when it lands (spec-to-plan.js asks for it in the plan shape); before any phase spawn the lead rereads those words, and a mismatch stops the spawn
- [ ] #7 #24: in lead.md (Handoff section and Invariants, not the handoff skill) every progress message to the human about a phase states Done and Not done in the human's terms, Done checked against the phase's landing sentence from #23; a phase is never described by the item's title; a correction leads with what is not done, and the reason, if given, comes after and never as the process's fault
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-28 03:25
---
From the #11 change, 2026-09-28: docs/agent-contract.md:58 allows at most six How you work steps, and lead.md has six. CF-51 folds its rules into the existing steps, as the #11 change did (steps 3 and 5), rather than adding steps. lead.md is at 48 of 60 lines.
---

author: lead
created: 2026-09-28 12:35
---
Scope change 2026-09-28 from CF-58 (drop plans, by the human): GitHub #20 is absorbed whole. With no plans there is no plan gate to bypass: the human's order is the only approval, and the lead gives a one-line notice then builds. The plan half of #23 goes too: the "what the human will see or be able to do" sentence now lives in that notice and on the card, not under plan phases. What stays in CF-51: #21 (repeat asks recorded on the card, moved up at the next spawn), #22 (the size floor and the lead building its own design, with the three guard-rails), #23's notice sentence and the reread of the human's words from the card, and #24 (Done and Not done in the human's terms). All of it folds into lead.md's existing six steps, after CF-58.
---

created: 2026-09-30 01:40
---
2026-09-30, from a GitHub issue alignment pass: the GitHub issues match the board (#21 to #24 open, this card To Do; #20 closed and absorbed by CF-58). But these criteria predate the 2026-09-28 scope change above. AC #1 is #20's rule, which CF-58 made the only path, and AC #6 describes plan phases and spec-to-plan.js, which no longer exist. The human's decision in session: re-spec CF-51 through spec-writer against the current lead body, rather than patch the two criteria. The scope to keep is the one in the scope-change comment: #21, #22 with its guard-rails, #23's notice sentence and the reread of the human's words, and #24.
---

author: @SubagentStop
created: 2026-09-30 01:41
---
Done. coder-fleet:researcher finished with no blockers. From "## Done" in its handoff:

- Question: what does the memory corpus already record as decided about CF-51? Result: nothing. No decision, note or document mentions CF-51.
- Searched 4 ways: "CF-51" on corpus all; "CF-51 decision" on thoughts by similarity; "coder-fleet CF-51" on documents (returned "No matching memories found."); "project:coder-fleet CF-51 board item" on thoughts, last 30 days.
- The miss looks real. Similarity ran 0.43 to 0.72, the level of general coder-fleet, Fathom and Blaise content, and no result contained the string "CF-51".
- Neighbouring coder-fleet memories exist for CF-9 (2026-09-27), CF-12 (decided 2026-09-29, id eb856d21-0c5c-4040-8236-1241ce7f8208), CF-24 (2026-09-29, id 83cdd938-d513-48bf-8291-b258ccb14fb9), CF-25 (2026-09-27, id 876cba5b-6032-470a-9f98-4f6e04eaef61), CF-26, CF-30 and CF-45 (all 2026-09-27). All are taint: internal, agent angus, and none mention CF-51.
- Board context: git log shows CF-51 moved to In Progress (commits 693f207 and 1c37d60). I did not read the card.
- Nothing captured to memory, as instructed.
---

author: @SubagentStop
created: 2026-09-30 01:41
---
Blocked by human. coder-fleet:researcher raised 1 blocker(s). From "## Decisions needed" in its handoff:

- What does CF-51 cover? Paste the card's title and body, or re-spawn me with the board tools enabled.
---

author: @SubagentStop
created: 2026-09-30 01:41
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- Card `/Users/alex/Dev/Work/extensions/coder-fleet/.boards/tasks/cf-51 - Apply-the-Models-post-mortem-to-the-lead-body.md`: status In Progress. The description says "the body is 48 of the 60 lines roster-contract.sh allows".
- Card comment 2026-09-30 01:40: "re-spec CF-51 through spec-writer against the current lead body, rather than patch the two criteria". AC #1 and AC #6 predate the scope change.
- Card comment 2026-09-28 12:35, the scope to keep: "#21 (repeat asks recorded on the card, moved up at the next spawn), #22 (the size floor and the lead building its own design, with the three guard-rails), #23's notice sentence and the reread of the human's words, and #24".
- Card comment 2026-09-28 03:25: "docs/agent-contract.md:58 allows at most six How you work steps, and lead.md has six".
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/agents/lead.md` is the entry point. Line 21 is `## Scope`, line 27 `## How you work` (steps 1-6 at lines 29-34), line 36 `## Invariants`, line 46 `## Handoff`.
- `lead.md:31` (step 3): "The human's order is the approval ... state in one line what you will build and what the human will see or be able to do when it lands". It also holds the `task_focus <id>` call.
- `lead.md:32` (step 4): "`review-round`'s tests and types-and-build lanes run the gates, with `refute: false` passed when `fix: true` is".
- `lead.md:40`: "Never spawn a `coder` or `scripter` on work the human has not ordered."
- `lead.md:25`: "You do not implement, review, design or research in the main session".
- `lead.md` has no size floor, no repeat-request rule and no Done/Not done progress-message rule.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/evals/lib/roster-contract.sh:74-76`: `[ "$lines" -lt 60 ]` and `check "$agent-length" "the body is under 60 lines"`.
- `/Users/alex/Dev/Work/extensions/coder-fleet/docs/agent-contract.md`, section 2: "Six steps or fewer, one line each where possible."
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/workflows/review-round.js:1403`: `const gatesMissing = lastGates.filter(gateMissing).map((g) => g.lane)`. Also `:1540` `gatesMissing,` and the comment at `:107`.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/evals/lead/rubric.md` is the lead rubric: 59 lines, IDs up to `LD05f` at line 52.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/evals/lead/prompts/` holds five prompts, `01-route-the-work.md` to `05-auth-diff-escalation.md`.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/evals/lead/checks.sh` has `LD-nocode`. `baseline.json` in the same directory is the baseline score.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/.claude-plugin/plugin.json:5` and `/Users/alex/Dev/Work/extensions/coder-fleet/.claude-plugin/marketplace.json:17` both read `"version": "0.28.1"`.
- The suite command, from `/Users/alex/Dev/Work/extensions/coder-fleet/AGENTS.md`, is `bash claude/evals/lib/check-all.sh`.
- `.boards/tasks/cf-58 - Drop-plans-...md:19`: "CF-51 and CF-53 shrink accordingly".
- `.boards/tasks/cf-55 - Hold-agent-bodies-to-the-six-step-limit-...md:18`: "CF-51 adds several rules to lead.md and will hit the same limit".
---

author: @SubagentStop
created: 2026-09-30 01:44
---
Blocked by human. coder-fleet:spec-writer raised 6 blocker(s). From "## Decisions needed" in its handoff:

- Is the draft Problem line, "the lead lets a repeated, small, already-understood ask stall, and reports on it in terms the human cannot check", the problem CF-51 solves?
- Is #22 (the size floor and the lead building small changes itself) still worth doing now that CF-58 removed the second approval and CF-25 targets stale worktrees? If not, criteria 4 to 9 move to non-goals.
- For a small repeated ask, which rule wins: #21 raising it to High, which step 4 makes trigger a refuter, or #22's "no refuter under the floor"?
- Should "under about a day of one agent" be dropped from the size floor, kept as guidance only, or replaced with something measurable?
- If #22 stays, what may the lead build itself, now that it no longer writes designs?
- Now that step 3 carries the notice sentence, is #23 just the reread?
---

created: 2026-09-30 02:36
---
Spec interview, 2026-09-30. The human's answers to the 12 open questions in docs/specs/CF-51.md:
1. Problem: yes, as worded: 'the lead lets a repeated, small, already-understood ask stall, and reports on it in terms the human cannot check'.
2. Scope: agreed. #21, #22, #23 reduced to the reread of the human's words from the card before each spawn (the notice sentence already exists at lead.md:31), and #24. #20 fully out.
3. #22: KEEP (against the lead's recommendation to drop it).
4. What the lead may build: a change under the size floor that the lead can state completely in its step-3 notice, added as a named exception in the Scope section.
5. Size floor: the three hard exclusions (no new endpoint, no schema change, no credential path) are the test. 'Under about a day of one agent' stays as untested guidance.
6. Collision: HIGH WINS. A repeated ask raised to High still gets a refuter under step 4, even under the floor. Step 4's High trigger is not reworded.
7. Repeat detection: the lead searches the board on every ask for an outcome, across sessions. A match is the lead's judgement, recorded as a comment quoting the human's words and the date.
8. Wording: 'ahead of any sweep and the next spawn on any other item or sub-issue, never by stopping a running spawn'.
9. #24 covers both card comments (step 5) and in-session chat.
10. Proof: the deterministic suite is enough. Rubric lines per rule on the existing five lead prompts; no manual model run.
11. Length: roster-contract only, and no new How you work step.
12. Non-goals: the handoff skill, CF-55's step-limit enforcement, and the OpenCode/Codex ports (port update filed as its own item). The release DOES carry a git tag.
---

created: 2026-09-30 02:37
---
Actions for Human ticked 2026-09-30, all answered in session (full answers in comment #8). #1 is void: the researcher lacked the board tools, and scout read the card instead (comment #6). #2: problem line yes, as worded. #3: keep #22. #4: High wins; a repeated ask still gets a refuter. #5: the three exclusions are the test, and 'about a day' is guidance. #6: a change under the floor that the lead can state completely in its step-3 notice, as a named Scope exception. #7: yes, #23 is the reread only.
---
<!-- COMMENTS:END -->
