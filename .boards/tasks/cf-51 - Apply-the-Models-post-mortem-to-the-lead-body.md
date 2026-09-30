---
id: CF-51
title: Apply the Models post-mortem to the lead body
status: In Progress
assignee: []
created_date: '2026-09-28 01:21'
updated_date: '2026-09-30 03:28'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/20'
  - 'https://github.com/rzem-ai/coder-fleet/issues/21'
  - 'https://github.com/rzem-ai/coder-fleet/issues/22'
  - 'https://github.com/rzem-ai/coder-fleet/issues/23'
  - 'https://github.com/rzem-ai/coder-fleet/issues/24'
  - claude/coder-fleet/agents/lead.md
  - docs/specs/CF-51.md
priority: High
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the Fathom Models pages post-mortem (fathom docs/runs/2026-09-28-lead-models-live.md), GitHub issues #20 to #24, tracked as one item by the human decision in triage on 2026-09-28: all five edit agents/lead.md (How you work 2 and 3, Scope, Invariants) and the body is 48 of the 60 lines roster-contract.sh allows, so they are written together as one coherent pass. #22 also carries the size floor moved there from #9, defined once and used for both the review tier and the lead-builds exception. CF-24 (#11) and CF-42 (#14) also add lines to lead.md; the plan budgets the lines across all three. Triage decision on #20: the fast path fires on an explicit order OR a repeated request, as the issue proposes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 **[human #7]** How you work step 3 **[supplied placement]**: on every ask from the human for an outcome, the lead searches the board for an item that already covers it, across sessions and not only within the current one.
- [ ] #2 **[human #7, card]** How you work step 3 **[supplied placement]**: a match is the lead's judgement, and on a match the lead comments on that item the date and the human's words, quoted.
- [ ] #3 **[card]** How you work step 3 **[supplied placement]**: the lead raises a matched item to High (a field edit through `task_edit`, never a column).
- [ ] #4 **[human #8, card]** How you work step 3 **[supplied placement]**: a repeated ask goes "ahead of any sweep and the next spawn on any other item or sub-issue, never by stopping a running spawn", and the lead names in one line what it moved back. The word "phase" does not appear in the rule.
- [ ] #5 **[human #5]** How you work step 4 **[supplied placement]**: lead.md defines the size floor once, and the test is exactly three exclusions: no new endpoint, no schema change, no credential path.
- [ ] #6 **[human #5]** Same place: "under about a day of one agent" appears only as guidance and is not a condition of the test.
- [ ] #7 **[card, amended by human #6 and human round-2 Q1]** How you work step 4: a change under the floor gets one agent and one review, and no refuter unless step 4 calls for one. Every one of step 4's refuter triggers applies under the floor, High included (and so a repeat raised to High under criterion 3), with no separate High exception.
- [ ] #8 **[human #6]** How you work step 4: the clause "when the item is High" in step 4's refuter trigger is unchanged in the diff.
- [ ] #9 **[human #6, human round-2 Q1; supplied wording]** Whole body: every sentence that states the floor's refuter rule states it as "no refuter unless step 4 calls for one" or words that defer to all of step 4's triggers. No sentence says or implies that a change under the floor never gets a refuter, and none names High as the floor's only exception.
- [ ] #10 **[human #4]** Scope: the Scope section names, as an exception to "You do not implement ... in the main session", that the lead may build itself a change under the size floor that it can state completely in its step-3 notice. The rest of that Scope line stands.
- [ ] #11 **[card, amended - supplied; human round-2 Q1]** Scope or How you work step 4 **[supplied placement]**: when the lead builds under criterion 10, it spawns the reviewer and no other builder, plus a refuter only when step 4 calls for one.
- [ ] #12 **[card]** How you work step 3 **[supplied placement]**: when the lead builds, it calls `task_focus` and leaves the start comment step 5 requires before it starts, because no `SubagentStart` fires for its own build.
- [ ] #13 **[card, amended by human round-2 Q2]** How you work step 3 **[supplied placement]**: when the lead builds, it builds in a worktree it cuts itself, never on a branch in the main checkout and never on main, lands the work through a PR, and removes that worktree after the merge, so the board's auto-commits in the main checkout never ride in its PR.
- [ ] #14 **[card]** How you work step 4: when the lead builds, the gates come from `review-round`'s tests and types-and-build lanes (`gates`, `gatesMissing`), not from the lead that wrote the code.
- [ ] #15 **[human #2, card]** How you work step 3: before each spawn on an item, the lead rereads the human's words from the card, and a mismatch with its step-3 notice stops the spawn.
- [ ] #16 **[supplied, following human #2]** How you work step 3: no new text restates the notice sentence already at `lead.md:31`.
- [ ] #17 **[human #9, card]** Handoff section or Invariants, and How you work step 5: every progress message to the human - both step 5's card comments and messages in the session - states Done and Not done in the human's terms, with Done checked against the step-3 notice sentence.
- [ ] #18 **[card]** Same place: a unit of progress is never described by the item's title alone.
- [ ] #19 **[card]** Same place: a correction leads with what is not done, gives the reason after it if at all, and never blames the process.
- [ ] #20 **[human #12, card]** `git diff` of the change touches no file under `claude/coder-fleet/skills/handoff/`.
- [ ] #21 **[human #11]** How you work: lead.md still has exactly six steps.
- [ ] #22 **[human #11]** `claude/evals/lib/roster-contract.sh` passes on lead.md.
- [ ] #23 **[human #10]** `claude/evals/lead/rubric.md` has at least one new rubric line for each of #21, #22, #23's reread and #24, exercised by the existing five prompts under `claude/evals/lead/prompts/`; no prompt is added.
- [ ] #24 **[card]** The `migration-checklist` skill has been run over lead.md, and its result is in the coder's handoff.
- [ ] #25 **[human #10, card]** `bash claude/evals/lib/check-all.sh` exits 0 on the branch.
- [ ] #26 **[card]** The version is bumped in `claude/coder-fleet/.claude-plugin/plugin.json` and mirrored in `.claude-plugin/marketplace.json` (both 0.28.1 today), on a commit whose subject starts with the new version.
- [ ] #27 **[human #12, human round-2 Q3]** The release commit carries an annotated tag `v<version>`, matching the version prefix of the commit subject, and the human pushes it with the branch. **[supplied]** Checked by `git cat-file -t v<version>` printing `tag` and `git rev-list -n 1 v<version>` naming the release commit.
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

author: @SubagentStop
created: 2026-09-30 02:39
---
Blocked by human. coder-fleet:spec-writer raised 3 blocker(s). From "## Decisions needed" in its handoff:

- Does the size floor's "no refuter" also give way to step 4's other refuter triggers (auth, authorisation, secrets, data writes including board and state files, a suspected test that passes with the fix reverted), or only to High? My recommendation is yes, to all of them. This blocks criteria 7, 9 and 11.
- Where does the lead's build branch live, given the board binary commits into whatever branch the main checkout has checked out, so a lead branch there would carry board commits into its PR? My recommendation is a worktree the lead cuts itself. This blocks criterion 13.
- What is the release tag called, and should it be annotated? My recommendation is an annotated `v<version>` on the release commit, pushed by the human. This blocks criterion 27.
---

created: 2026-09-30 03:05
---
Spec interview round 2, 2026-09-30. The human's answers to the revised spec's open questions 1 to 4:
Q1 / action #8: ALL of step 4's refuter triggers override the floor, not only High. Write it as 'no refuter unless step 4 calls for one', which also covers High, so no separate High exception is needed (criteria 7, 9, 11).
Q2 / action #9: the lead cuts its own worktree for a build and removes it after the merge, so the board's auto-commits in the main checkout never ride in its PR (criterion 13).
Q3 / action #10: an annotated tag `v<version>` on the release commit, matching the commit subject's prefix, pushed by the human with the branch (criterion 27).
Q4: intended. Under High wins, a small repeated ask always gets a refuter, and the no-refuter path covers only first-time, non-High asks under the floor. State this plainly in the spec.
Open questions 5 and 6 (no new Invariant; the drafter's section placements) were not asked and stay open for the human's edit.
---

author: @board
created: 2026-09-30 03:05
---
Actions for Human cleared: CF-51 moved from Blocked by human to In Progress.

- #1 (ticked) [not a question] What does CF-51 cover? Paste the card's title and body, or re-spawn me with the board tools enabled.
- #2 (ticked) Is the draft Problem line, "the lead lets a repeated, small, already-understood ask stall, and reports on it in terms the human cannot check", the problem CF-51 solves?
- #3 (ticked) [not a question] Is #22 (the size floor and the lead building small changes itself) still worth doing now that CF-58 removed the second approval and CF-25 targets stale worktrees? If not, criteria 4 to 9 move to non-goals.
- #4 (ticked) For a small repeated ask, which rule wins: #21 raising it to High, which step 4 makes trigger a refuter, or #22's "no refuter under the floor"?
- #5 (ticked) Should "under about a day of one agent" be dropped from the size floor, kept as guidance only, or replaced with something measurable?
- #6 (ticked) If #22 stays, what may the lead build itself, now that it no longer writes designs?
- #7 (ticked) Now that step 3 carries the notice sentence, is #23 just the reread?
- #8 (ticked) [not a question] Does the size floor's "no refuter" also give way to step 4's other refuter triggers (auth, authorisation, secrets, data writes including board and state files, a suspected test that passes with the fix reverted), or only to High? My recommendation is yes, to all of them. This blocks criteria 7, 9 and 11.
- #9 (ticked) [not a question] Where does the lead's build branch live, given the board binary commits into whatever branch the main checkout has checked out, so a lead branch there would carry board commits into its PR? My recommendation is a worktree the lead cuts itself. This blocks criterion 13.
- #10 (ticked) [not a question] What is the release tag called, and should it be annotated? My recommendation is an annotated `v<version>` on the release commit, pushed by the human. This blocks criterion 27.
---

author: @SubagentStop
created: 2026-09-30 03:06
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Spec: /Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-51.md, updated from card comment #11. Final count: 27 acceptance criteria, unchanged.
- Q1: the floor rule now reads "no refuter unless step 4 calls for one". Criteria 7, 9 and 11 now need no separate High exception, and each is marked [human round-2 Q1]. Criterion 8 ("when the item is High" stays unchanged) is untouched.
- Q2: criterion 13 now says the lead builds in a worktree it cuts itself, never on a branch in the main checkout and never on main. It lands the work through a PR and removes the worktree after the merge. Marked [human round-2 Q2].
- Q3: criterion 27 now asks for an annotated tag `v<version>` on the release commit, matching the version prefix of the commit subject, pushed by the human with the branch. Marked [human round-2 Q3].
- Q4: a new Non-goals line says plainly that a repeated ask always gets a refuter. The no-refuter path covers only a first-time, non-High ask under the floor that none of step 4's other triggers catches. Marked [human round-2 Q4].
- Open questions: 1 to 4 are removed, with a note that round 2 answered them and where each answer went. Questions 5 and 6 stay open and keep their numbers, so they still match comment #11.
---

created: 2026-09-30 03:28
---
The human approved docs/specs/CF-51.md on 2026-09-30 (committed 83503ed). The card's criteria are replaced by the spec's 27, word for word, numbered as in the spec. The seven pre-CF-58 criteria are gone: the approved spec supersedes them. The spec-to-card run added only criteria 1 to 23 and appended them to the stale seven, so the lead set the full list by hand; the dropped four (24 to 27: migration checklist, check-all, version bump, annotated tag) are restored. Open questions 5 (no new Invariant, recommended) and 6 (the drafter's step placements) were approved as written. The item has not been ordered to build yet.
---
<!-- COMMENTS:END -->
