---
id: CF-51
title: Apply the Models post-mortem to the lead body
status: Done
assignee: []
created_date: '2026-09-28 01:21'
updated_date: '2026-10-06 06:37'
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
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the Fathom Models pages post-mortem (fathom docs/runs/2026-09-28-lead-models-live.md), GitHub issues #20 to #24, tracked as one item by the human decision in triage on 2026-09-28: all five edit agents/lead.md (How you work 2 and 3, Scope, Invariants) and the body is 48 of the 60 lines roster-contract.sh allows, so they are written together as one coherent pass. #22 also carries the size floor moved there from #9, defined once and used for both the review tier and the lead-builds exception. CF-24 (#11) and CF-42 (#14) also add lines to lead.md; the plan budgets the lines across all three. Triage decision on #20: the fast path fires on an explicit order OR a repeated request, as the issue proposes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 **[human #7]** How you work step 3 **[supplied placement]**: on every ask from the human for an outcome, the lead searches the board for an item that already covers it, across sessions and not only within the current one.
- [x] #2 **[human #7, card]** How you work step 3 **[supplied placement]**: a match is the lead's judgement, and on a match the lead comments on that item the date and the human's words, quoted.
- [x] #3 **[card]** How you work step 3 **[supplied placement]**: the lead raises a matched item to High (a field edit through `task_edit`, never a column).
- [x] #4 **[human #8, card]** How you work step 3 **[supplied placement]**: a repeated ask goes "ahead of any sweep and the next spawn on any other item or sub-issue, never by stopping a running spawn", and the lead names in one line what it moved back. The word "phase" does not appear in the rule.
- [x] #5 **[human #5]** How you work step 4 **[supplied placement]**: lead.md defines the size floor once, and the test is exactly three exclusions: no new endpoint, no schema change, no credential path.
- [x] #6 **[human #5]** Same place: "under about a day of one agent" appears only as guidance and is not a condition of the test.
- [x] #7 **[card, amended by human #6 and human round-2 Q1]** How you work step 4: a change under the floor gets one agent and one review, and no refuter unless step 4 calls for one. Every one of step 4's refuter triggers applies under the floor, High included (and so a repeat raised to High under criterion 3), with no separate High exception.
- [x] #8 **[human #6]** How you work step 4: the clause "when the item is High" in step 4's refuter trigger is unchanged in the diff.
- [x] #9 **[human #6, human round-2 Q1; supplied wording]** Whole body: every sentence that states the floor's refuter rule states it as "no refuter unless step 4 calls for one" or words that defer to all of step 4's triggers. No sentence says or implies that a change under the floor never gets a refuter, and none names High as the floor's only exception.
- [x] #10 **[human #4]** Scope: the Scope section names, as an exception to "You do not implement ... in the main session", that the lead may build itself a change under the size floor that it can state completely in its step-3 notice. The rest of that Scope line stands.
- [x] #11 **[card, amended - supplied; human round-2 Q1]** Scope or How you work step 4 **[supplied placement]**: when the lead builds under criterion 10, it spawns the reviewer and no other builder, plus a refuter only when step 4 calls for one.
- [x] #12 **[card]** How you work step 3 **[supplied placement]**: when the lead builds, it calls `task_focus` and leaves the start comment step 5 requires before it starts, because no `SubagentStart` fires for its own build.
- [x] #13 **[card, amended by human round-2 Q2]** How you work step 3 **[supplied placement]**: when the lead builds, it builds in a worktree it cuts itself, never on a branch in the main checkout and never on main, lands the work through a PR, and removes that worktree after the merge, so the board's auto-commits in the main checkout never ride in its PR.
- [x] #14 **[card]** How you work step 4: when the lead builds, the gates come from `review-round`'s tests and types-and-build lanes (`gates`, `gatesMissing`), not from the lead that wrote the code.
- [x] #15 **[human #2, card]** How you work step 3: before each spawn on an item, the lead rereads the human's words from the card, and a mismatch with its step-3 notice stops the spawn.
- [x] #16 **[supplied, following human #2]** How you work step 3: no new text restates the notice sentence already at `lead.md:31`.
- [x] #17 **[human #9, card]** Handoff section or Invariants, and How you work step 5: every progress message to the human - both step 5's card comments and messages in the session - states Done and Not done in the human's terms, with Done checked against the step-3 notice sentence.
- [x] #18 **[card]** Same place: a unit of progress is never described by the item's title alone.
- [x] #19 **[card]** Same place: a correction leads with what is not done, gives the reason after it if at all, and never blames the process.
- [x] #20 **[human #12, card]** `git diff` of the change touches no file under `claude/coder-fleet/skills/handoff/`.
- [x] #21 **[human #11]** How you work: lead.md still has exactly six steps.
- [x] #22 **[human #11]** `claude/evals/lib/roster-contract.sh` passes on lead.md.
- [x] #23 **[human #10]** `claude/evals/lead/rubric.md` has at least one new rubric line for each of #21, #22, #23's reread and #24, exercised by the existing five prompts under `claude/evals/lead/prompts/`; no prompt is added.
- [x] #24 **[card]** The `migration-checklist` skill has been run over lead.md, and its result is in the coder's handoff.
- [x] #25 **[human #10, card]** `bash claude/evals/lib/check-all.sh` exits 0 on the branch.
- [x] #26 **[card]** The version is bumped in `claude/coder-fleet/.claude-plugin/plugin.json` and mirrored in `.claude-plugin/marketplace.json` (both 0.28.1 today), on a commit whose subject starts with the new version.
- [x] #27 **[human #12, human round-2 Q3]** The release commit carries an annotated tag `v<version>`, matching the version prefix of the commit subject, and the human pushes it with the branch. **[supplied]** Checked by `git cat-file -t v<version>` printing `tag` and `git rev-list -n 1 v<version>` naming the release commit.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

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

created: 2026-09-30 08:32
---
The human ordered this built on 2026-09-30 ("fix the github issues", covering #21-#24). It builds from the approved docs/specs/CF-51.md and the 27 criteria above. lead.md is shared with CF-24.1, CF-53, CF-52 (#4) and CF-90 (#5); CF-51 goes first in that serial track, and the others follow after it merges. Sub-issue 1 of 1 starting.
---

author: @SubagentStop
created: 2026-09-30 08:41
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a205573558ead80ee`, branch `worktree-agent-a205573558ead80ee`. Before any write I checked that `rev-parse` pointed at the linked worktree and that the tree was clean.
- Commit `692a2b1` CF-51: lead takes repeat asks first, may build under the size floor, rereads the card before each spawn.
- Commit `b917ab4` CF-51: lead reports progress as Done and Not done in the human's terms.
- Commit `584406f` CF-51: lead rubric lines for repeat asks, the size floor, the reread and progress in the human's terms.
- #1 lead.md:31, step 3: "On every ask from the human for an outcome, search the board ... across sessions and not only this one."
- #2 lead.md:31: "A match is your judgement; on one, comment on that item the date and the human's words, quoted".
- #3 lead.md:31: "raise it to High with `task_edit` (a field, never a column)".
- #4 lead.md:31: "take it ahead of any sweep and the next spawn on any other item or sub-issue, never by stopping a running spawn, naming in one line what you moved back". The word "phase" is not in the rule.
- #5 lead.md:32, step 4: "The size floor, defined here and nowhere else: ... no new endpoint, changes no schema and touches no credential path, and those three are the whole test".
- #6 lead.md:32: "\"under about a day of one agent\" is guidance, never a condition".
- #7 lead.md:32: "one agent and one review, and no refuter unless this step calls for one, since every refuter trigger above applies under the floor as it does over it".
- #8 lead.md:32: the "when the item is High" clause is unchanged in the diff (grep count 1).
- #9 lead.md:32: both floor sentences defer to step 4 ("unless this step calls for one" and "only when this step calls for one"). No sentence names High as the only exception.
- #10 lead.md:25, Scope: "The one exception: you may build yourself a change under step 4's size floor that you can state completely in your step-3 notice." The rest of that Scope line is unchanged.
- #11 lead.md:32: "When you build one yourself, spawn `reviewer` and no other builder, plus a `refuter` only when this step calls for one".
- #12 lead.md:31: "call `task_focus` and leave step 5's start comment before you start, because no `SubagentStart` fires for your own build".
- #13 lead.md:31: "build in a worktree you cut yourself, never on a branch in the main checkout and never on main, land it through a PR, and remove that worktree after the merge".
- #14 lead.md:32: "take its gates from `review-round`'s tests and types-and-build lanes (`gates`, `gatesMissing`), never from your own run, because you wrote the code".
- #15 lead.md:31: "Before each spawn on an item, reread the human's words on the card, and if they no longer match your one-line notice, stop the spawn until they do."
- #16 lead.md:31: the new text points to "your one-line notice" and does not restate the notice sentence.
- #17 lead.md:45 (new Invariant line): "Every progress message to the human - step 5's card comments and every message in the session - states Done and Not done in the human's terms ... with Done checked against your step-3 notice." Step 5 (lead.md:33) now points to it.
- #18 lead.md:45: "Never describe a unit of progress by the item's title alone."
- #19 lead.md:45: "A correction leads with what is not done, gives the reason after it if at all, and never blames the process."
- #20 `git diff main -- claude/coder-fleet/skills/handoff/` prints 0 lines.
- #21 `grep -c '^[0-9]\. '` on lead.md prints 6.
- #22 `bash claude/evals/lib/roster-contract.sh`: exit 0, "155 passed, 0 failed". lead.md is 49 lines against the limit of 60.
- #23 New rubric lines in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a205573558ead80ee/claude/evals/lead/rubric.md`, with no prompt added: LD01h for repeat asks (#21); LD01j, LD05g and LD05h for the size floor (#22); LD01i for the reread (#23); LD04g and LD04h for progress in the human's terms (#24).
- #24 Migration checklist over lead.md: no failures. The frontmatter parses, the keys are `color, description, effort, model, name, skills`, and `skills` is a list. There is no double-check or thinking scaffolding. The body is 49 lines with four H2 sections in order. The new edits are a priority field and comments through `task_edit`, never a column. No em or en dashes, emoji or hard wraps. The only US spelling is the `color` frontmatter key, which the harness requires.
- #24 continued: checks 4 and 8 (tools) do not apply, because tools are left out on purpose for the session agent. Checks 12, 13 and 20 have nothing to check: no SDK code, token ceilings or contract fields changed. Check 11 (effort sweep) was not run.
- #25 `./claude/evals/lib/check-all.sh` ran once in the background with its output captured: exit 0, "Every deterministic check passes."
---

created: 2026-09-30 08:42
---
Sub-issue 1 of 1, built and not on main. Worktree agent-a205573558ead80ee, commits 692a2b1, b917ab4 and 584406f. The coder reports criteria 1-25 met at named lead.md and rubric lines (comment above), with roster-contract 155/0 and check-all green. lead.md is 49/60 lines with six steps. Criteria 26 and 27 are deferred to the joint release. A known issue to fix in round 1: step 4's older "run the gates yourself when a lane is under gatesMissing" contradicts criterion 14 for a change the lead built itself. Review round 1 and refuter round 1 are running. Done still needs: both rounds clean, merge, then release.
---

author: @SubagentStop
created: 2026-09-30 08:46
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. Reviewed the three commits on the branch (`git diff main...HEAD`) against `docs/specs/CF-51.md`, the 27 criteria on CF-51 and comments #8 and #11. Criteria 26 and 27 were skipped as deferred.
- Criteria 1 to 25 meet the letter at the lines the coder cites. Writing rules are clean (scanned the added lines). Six steps, 49 lines, no file under `skills/handoff/` touched.
- Read `review-round.js` (fix, refute and `gatesMissing` handling), the lead eval prompts, the EX-1 card fixture and the three handoff fixtures. Searched the memory server for CF-51 decisions: nothing contradicts the findings, and Q4 is recorded there.
- must fix: claude/coder-fleet/agents/lead.md:31 - the repeat rule matches any existing item, so every first order on a filed card goes High, jumps the queue and gets a refuter
- must fix: claude/coder-fleet/agents/lead.md:32 - "run the gates yourself when a lane is under gatesMissing" contradicts "never from your own run" for the lead's own build, and review-round.js:1410 repeats the self-run instruction; no fallback is named
- must fix: claude/coder-fleet/agents/lead.md:32 - "no other builder" is broken silently if the lead runs review-round with fix: true, which commissions coder; who fixes findings on a lead build is unstated
- must fix: claude/coder-fleet/agents/lead.md:32 - "one agent and one review" under the floor overrides the deeper review and second round for a non-credential auth diff, and lets the lead build auth code that step 2 routes to coder
- low: claude/coder-fleet/agents/lead.md:31 - "stop the spawn until they do" gives no way out (restate the notice or ask the human)
- low: claude/coder-fleet/agents/lead.md:31 - the lead's own build assumes a card for task_focus and the start comment, but cardless asks are allowed
- low: claude/evals/lead/rubric.md:22 - LD01h makes the repeat half conditional, though the EX-1 fixture is a genuine repeat, so the line cannot fail on that half
- low: claude/evals/lead/rubric.md:47 - LD04g's example "EX-1.1 done" is an id, not a title, and collides with LD04f's required wording
- low: claude/evals/lead/rubric.md:5 - the intro and ALLb (rubric.md:64) still say the lead never implements, ignoring the size-floor exception
---

author: @SubagentStop
created: 2026-09-30 08:55
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: roster-contract exit 0, 155 passed, under 1s; `check-all.sh` exit 0, all green, 327s.
- m2 (criterion 22), 11 extra Invariants lines making lead.md 60 lines: killed. roster-contract exit 1, `FAIL lead-length the body is under 60 lines`, 154 passed, 1 failed.
- survived: in step 4, `a user's files), when the item is High, or when` changed to `a user's files), or when` - deleting the High trigger for a refuter (criterion 8), which also cancels criterion 7's High case for a repeat ask; roster-contract, workflow-logic and handoff-parity all exit 0.
- survived: step 4's `A change under the floor gets one agent and one review, and no refuter unless this step calls for one, since every refuter trigger above applies under the floor as it does over it.` replaced with `A change under the floor gets one agent and one review, and no refuter.` - the sentence criterion 9 forbids; all three checks exit 0.
- survived: step 3's `never on a branch in the main checkout and never on main,` changed to `never on a branch in the main checkout,` - the lead's own build is no longer barred from main (criterion 13); all three checks exit 0.
- survived: `7. Report progress. After each merge, tell the human what now works and what still does not.` added after step 6 - a seventh step (criterion 21); all three checks exit 0.
- survived: `A handoff is read by the lead before anything else.` appended to `claude/coder-fleet/skills/handoff/SKILL.md` - criterion 20 has no check; handoff-parity only compares the "A finding is not a blocker" example with its fixture. All three checks exit 0.
- survived: the `- [LD05h]` line deleted from `claude/evals/lead/rubric.md` - no check ties the rubric to criterion 23; all three checks exit 0.
- Criteria that rest only on a human reading the diff: 1-19, 20 and 23. Criterion 22 is guarded by roster-contract and 21 by nothing. Within step 4, workflow-logic only guards the `at most eight mutants` phrase, which belongs to CF-45, not CF-51.
- Convergence: this was the first round, so there is no earlier round to compare against.
---

created: 2026-09-30 09:06
---
Round 1, 2026-09-30. Review: request changes, four must-fixes. (1) The repeat rule never requires a prior ask, so any first order on a filed card would go High. (2) Step 4's gatesMissing self-run contradicts criterion 14 on the lead's own build, and review-round.js:1410 repeats the self-run instruction. (3) 'No other builder' collides with review-round fix: true, which commissions a coder. (4) 'One review' under the floor overrides the deeper review an auth diff gets. Refuter: 1 of 7 mutants killed (lead.md length); criteria 8, 9, 13, 20, 21 and 23 are guarded by no deterministic check. The human's decision in session: may the lead build an auth or authorisation change under the floor? YES, keep the three exclusions; review depth and the refuter defer to step 4's auth escalation. Fix round 1 applies the four must-fixes, the review lows, and phrase guards for criteria 8, 9 and 13. Criterion 21's step count stays with CF-55 (a non-goal); criteria 20 and 23 remain human-read by the spec's design. Filed: CF-91 (a tighter floor limit, to decide later).
---

author: @SubagentStop
created: 2026-09-30 09:14
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Same worktree, `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a205573558ead80ee`, left clean.
- Commit `596833f` CF-51: guard the lead's High trigger, floor deferral and never on main in check-all.
- Commit `2d6d8f0` CF-51: only a repeat is a match; the lead's own build is reviewed by review-round without fix, gated by a refuter when a lane is missing, and one review defers to the auth tier.
- Commit `9333c98` CF-51: lead rubric requires the EX-1 repeat, fails a title or id alone, and scopes no-implement to outside the size floor.
- New file `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a205573558ead80ee/claude/evals/lib/lead-rules-contract.sh`, run by `check-all.sh` as `lead-rules-contract`. It checks three things:
- It checks that step 4 still contains "when the item is High" (criterion 8).
- It checks that no sentence mentioning the floor gives "no refuter" (or "never gets a refuter", or "without a refuter") without "unless this step calls for one" (criterion 9).
- It checks that every sentence about the worktree the lead cuts for its own build keeps "never on main" (criterion 13).
- There is no step counter.
- The guard also has a built-in self-test. It removes each guarded phrase from a temporary copy of the body and requires that same guard to fail, so a guard that stops catching anything fails the suite.
- I watched each guard fail on the refuter's mutants in `scratchpad/refuter-1790757727/`, using `LEAD_MD_OVERRIDE=<mutant>/claude/coder-fleet/agents/lead.md bash claude/evals/lib/lead-rules-contract.sh`:
- m3 (High trigger removed): exit 1, "high-trigger: step 4 no longer says \"when the item is High\"".
- m4 ("A change under the floor gets one agent and one review, and no refuter."): exit 1, "floor-defers: ...".
- m5 ("never on main" removed): exit 1, "own-build-main: ...".
- The refuter's base copy: exit 0.
- Must fix 1, lead.md:31: "A match is your judgement, and only a repeat is one: an ask for an outcome the human already ordered or asked for and has not had delivered yet, because the first order on a filed item is the order, not a repeat."
- Must fix 2, lead.md:32: the older self-run now reads "on a change someone else built run the gates yourself when a lane is under `gatesMissing` or ran only a subset".
- Must fix 2, continued: for the lead's own build, "where the workflow says to run a missing gate yourself, or a lane ran only a subset, spawn a `refuter` instead, whose baseline runs the full gates". `review-round.js` is not touched. Its `GATES_NOTE` around line 1410 is the instruction this answers.
- Must fix 3, lead.md:32: "When you build one yourself, spawn no other builder: run `review-round` without `fix: true`, take its `reviewer` as the one review and fix the findings yourself in your own worktree, and spawn a `refuter` only when this step calls for one." `fix` defaults to off in `review-round.js`, so leaving it out commissions no coder.
- Must fix 4, lead.md:32: "one agent and one review, or the deeper review and second round this step gives an auth diff, and no refuter unless this step calls for one". The three exclusions are unchanged. Scope (:25) never said "one review", so it needed no edit.
- Low, reread (lead.md:31): "stop the spawn and either restate the notice to match the card or ask the human."
- Low, card for a floor build (lead.md:31): "file a card for it first if there is none, recording that the human asked, then call `task_focus`".
- Low, LD01h: the repeat half is now required ("since the human filed EX-1 and it is not delivered yet"), and "says it would" wording is accepted.
- Low, LD04g: the example is now title-only, "Rotation on refresh is done", and the line says "EX-1.1 is done" with nothing about what now works also fails.
- Low, rubric intro: now reads "does the work itself outside the size-floor exception".
- Low, ALLb: now reads "does not implement outside the size-floor exception, and no prompt here asks for a change under the floor".
- `bash claude/evals/lib/roster-contract.sh`, run once with output in `scratchpad/roster-r1.out`: exit 0, "155 passed, 0 failed".
- `./claude/evals/lib/check-all.sh`, run once with output in `scratchpad/checkall-r1.out`: exit 0. `lead-rules-contract: ok`, and "Every deterministic check passes."
- `grep -c '^[0-9]\. '` on lead.md prints 6, and `wc -l` prints 49.
---

author: @SubagentStop
created: 2026-09-30 09:17
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. Two must-fixes; round 1's must-fixes 2 and 4 closed; must-fix 3 closed but the fix opens a new gap; must-fix 1 partly closed; all five round-1 lows closed.
- Reviewed `git diff 584406f..HEAD` (596833f, 2d6d8f0, 9333c98) against CF-51's criteria, comments #18 and #20, the spec, `review-round.js` (fix, refute, gates, nextStep), the EX-1 card fixture and the CF-24.1, CF-53, CF-52 and CF-90 descriptions.
- Repeat check: must-fix 1 recurs in part (the leftover of round 1's #1). Must-fix 2 is new, a result of answering round 1's #3. Low 1 is the unfixed half of round 1's #4. The rest are new.
- must fix: claude/coder-fleet/agents/lead.md:32 - the lead fixes its own build after the one review, and the gates it takes from review-round ran on the pre-fix head, so the fix commit merges unreviewed and ungated
- must fix: claude/coder-fleet/agents/lead.md:31 - a repeat is "already ordered or asked for", and step 3 counts filing as ordering, so the first go on any human-filed card is a repeat that goes High and gets a refuter; claude/evals/lead/rubric.md:22 bases LD01h on the filing instead of the card's 2026-09-01 go
- low: claude/coder-fleet/agents/lead.md:30 - step 2 still routes auth to coder, against the human's decision that the lead may build auth under the floor
- low: claude/coder-fleet/agents/lead.md:32 - "one review, or the deeper review and second round" reads as a free choice, not a requirement for auth diffs
- low: claude/coder-fleet/agents/lead.md:32 - on the lead's own build, review-round's nextStep (review-round.js:1442/1448) still tells the lead to use fix: true or coder, with no override in lead.md
- low: claude/evals/lib/lead-rules-contract.sh:123 - the floor-defers guard passes "no `refuter`", a split sentence, or a floor sentence that drops the refuter rule entirely; it never checks that the deferral is present
- low: claude/evals/lib/lead-rules-contract.sh:124 - the floor-defers guard fails criterion 9's own wording "unless step 4 calls for one"
- low: claude/evals/lib/lead-rules-contract.sh:119 - the high-trigger guard matches the phrase anywhere in step 4, not in the refuter-trigger sentence
- low: claude/evals/lib/lead-rules-contract.sh:185 - the self-test passes if mutate prints nothing; count the three bites results
- low: claude/evals/lead/rubric.md:22 - EX-1 is already priority High in the fixture, so LD01h's raise-to-High half cannot tell a right answer from a wrong one
---

author: @SubagentStop
created: 2026-09-30 09:25
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Spawn at 19:14:49 AEST (`date +%s` 1790759689), handoff at about 19:26. Scratch tree is `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-r2-1790759689/`, a fresh rsync of HEAD 9333c98; round 1's directory was not reused.
- Baseline `bash claude/evals/lib/lead-rules-contract.sh -v`: exit 0, 4 passed, 2.6s.
- Baseline `bash claude/evals/lib/roster-contract.sh`: exit 0, 155 passed, 1.7s.
- Baseline `./claude/evals/lib/check-all.sh`: exit 0, "Every deterministic check passes.", 9m48s. All three baselines ran once in the worktree; output is in `b-lead.txt`, `b-roster.txt` and `b-all.txt` in the scratch dir.
- How each mutant ran: `run.sh <name> <file> <old> <new>` (in the scratch dir) makes a fresh `claude/` copy, applies one replacement with `mut.py`, then runs lead-rules-contract (the full script, self-test included) and roster-contract. Budget: eight mutants, all run.
- Round-1 repeat r1-high, `, when the item is High,` -> `,`: killed, lead-rules exit 1, the real-body check fails.
- Round-1 repeat r1-floor, the floor clause -> `, and no refuter.`: killed, lead-rules exit 1, the real-body check fails.
- Round-1 repeat r1-main, ` and never on main,` -> `,`: killed, lead-rules exit 1, the real-body check fails.
- b-high-negated, `, when the item is High,` -> `, but never merely when the item is High,`: killed with exit 1, but only on `high-trigger-bites` (the self-test's search string missing); exit 0 with `LEAD_MD_OVERRIDE`.
- b-floor-skipped, the floor clause -> `, and the refuter is skipped.`: killed with exit 1, but only on `floor-defers-bites`; exit 0 with `LEAD_MD_OVERRIDE`.
- survived: lead.md step 4, `unless this step calls for one, since every trigger above applies under the floor as it does over it.` -> `unless this step calls for one. Under the floor it calls for none, whatever the triggers above say.` - the floor denies every refuter trigger (criterion 9) with lead-rules exit 0 (4 passed) and roster exit 0 (155 passed). New finding.
- survived: lead.md line 25, `a change under step 4's size floor that you can state` -> `a change under step 4's size floor, directly on main when it is one file, that you can state` - the lead may build on main (criterion 13) with lead-rules exit 0 and roster exit 0. New finding.
- survived: lead-rules-contract.sh, `if "when the item is High" not in step4:` -> `if "when the item is High" not in body:` - the self-test still passes (4 passed, exit 0), so the guard can stop checking step 4 and nothing notices; the weakened guard would accept the High trigger moved out of step 4 (criterion 8). New finding.
- Convergence: this round's survivors are all new, not a repeat of round 1. The pattern behind them is the same one each time: the guard pins the exact wording, and a rewording or an addition somewhere else gets past it.
- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a205573558ead80ee`: `git status --short` is empty.
---

created: 2026-09-30 09:25
---
Round 2, 2026-09-30. Review: request changes, two must-fixes. (1) The lead's own-build fix commit merges unreviewed and ungated, because review-round without fix runs once, on the pre-fix head. (2) Filing counts as ordering, so the first 'go' on a human-filed card would count as a repeat, and LD01h cites the filing. There are eight lows, including step 2 still routing auth to coder. Refuter: all three round-1 survivors are now killed; three new rewording survivors past the guard (a floor deferral cancelled in a following sentence; 'on main' allowed outside the own-build sentence; the self-test misses a High check widened to the whole body). Lead's judgement: phrase guards can't prove prose meaning, and each round finds a new rewording. Fix round 2 closes these three and the review's must-fixes, then the guard loop stops. The meaning of CF-51's rules rests on review, as the spec intended (human #10). Filed: CF-96 (consolidating the own-build rules, a placement decision for the human).
---

author: @SubagentStop
created: 2026-09-30 09:33
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Same worktree, `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a205573558ead80ee`, left clean.
- Commit `e094060` CF-51: the lead reviews its own fix commit before merge, filing is no earlier ask, and step 2 leaves floor builds to the lead.
- Commit `ec081db` CF-51: LD01h cites the 2026-09-01 go on EX-1 as the earlier ask and accepts already High.
- Commit `952ad23` CF-51: harden the lead-rules guards against cancelled deferrals, main allowed elsewhere and a negated or moved High trigger, and count the self-test's bites per guard.
- Must fix 1, lead.md:32. After fixing the findings, the lead must "review the fix commit before it merges, with `review-round` again, which is the second round an auth diff needs, or otherwise with a `refuter` on it, whose baseline runs the full gates". I removed "take its `reviewer` as the one review", so the passage no longer contradicts the auth second round.
- Must fix 2, lead.md:31: "an ask for an outcome the human already asked for or ordered in words, earlier, and has not had delivered yet; filing a card alone is no earlier ask, so the first order on a filed item is the order, not a repeat."
- Must fix 2, rubric LD01h (`claude/evals/lead/rubric.md:22`) now names the prior ask: "the card records that the human said go on EX-1 on 2026-09-01". It says the filing alone would not count, and it accepts "says EX-1 is already High".
- Low, lead.md:30, step 2 now ends "Anything left is yours, and so is a change you build under Scope's exception, an auth change under step 4's size floor included."
- Low, lead.md:32, the auth tier is now required: "one agent and one review, and, for an auth diff, the deeper review and second round this step gives it, and no refuter unless this step calls for one".
- Low, lead.md:32, on its own build the lead now ignores the workflow's advice: "ignore `review-round`'s suggestion of `fix: true` or a `coder` as you ignore its gates note".
- Guard `high-trigger` now looks only at step 4's sentence containing "Spawn `refuter`". It fails if "when the item is High" is missing there, or if the words before it include never, not, no, except or but.
- Guard `floor-defers` has three checks. At least one floor sentence about a refuter must carry the deferral, either "unless this step calls for one" or "unless step 4 calls for one". Every sentence that mentions both the floor and a refuter must carry that deferral. Any floor sentence, or the sentence right after one, that withholds a refuter without the deferral fails.
- For `floor-defers`, "withholds" means one of: "no refuter", "calls for none", "refuter is skipped", "skip the refuter", "never gets a refuter", "without a refuter".
- Guard `own-build-main` keeps "never on main" on the sentence about the worktree the lead cuts. It also scans the whole body for any sentence about the lead's own build that says "on main" without "never on main".
- The self-test now has nine mutants, three per guard. It requires each one to fail on its own guard and at least one bite per guard, and it fails when a guard has no mutant.
- The refuter's round-2 survivors in `scratchpad/refuter-r2-1790759689/`, via `LEAD_MD_OVERRIDE`: `m-b-floor-split` exits 1 with "floor-defers: a floor sentence withholds a refuter without deferring to step 4: Under the floor it calls for none, whatever the triggers above say."
- `m-b-floor-skipped` exits 1 on all three floor-defers checks.
- `m-b-high-negated` exits 1 with "high-trigger: step 4's refuter trigger negates \"when the item is High\"".
- `m-b-main-elsewhere` exits 1 with "own-build-main: a sentence about the lead's own build allows main: The one exception: you may build yourself ... directly on main".
- `m-r1-floor`, `m-r1-high` and `m-r1-main` each exit 1 on their own guard, and the refuter's base copy exits 0.
- `m-g-high-scope`, the refuter's weakening of the guard to `if "when the item is High" not in body`, rebuilt against the new script in `scratchpad/gw/evals/lib/weak-high.sh`: exit 1, "high-trigger-bites moved out of step 4: the guard passed the mutant" and "negated: the guard passed the mutant".
- An emptied self-test (`MUTANTS = []`) in `scratchpad/gw/evals/lib/empty-selftest.sh`: exit 1, with "the self-test has no mutant for this guard" for each guard and "only 0 mutant(s) bit".
- A copy of lead.md using "unless step 4 calls for one" passes the guard, exit 0.
- `bash claude/evals/lib/lead-rules-contract.sh -v`, run once with output in `scratchpad/lead-rules-r2.out`: exit 0, "10 passed, 0 failed".
- `bash claude/evals/lib/roster-contract.sh`, run once with output in `scratchpad/roster-r2.out`: exit 0, "155 passed, 0 failed".
- `./claude/evals/lib/check-all.sh`, run once with output in `scratchpad/checkall-r2.out`: exit 0. `lead-rules-contract: ok` (10 passed), and "Every deterministic check passes."
---

author: @SubagentStop
created: 2026-09-30 09:37
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups. Both round-2 must-fixes are closed (lead.md:31, lead.md:32, rubric.md:22), and so are the three round-2 lead.md lows (step 2 leaves floor builds to the lead, the auth tier is required, `review-round`'s `fix: true`/`coder` suggestion is overridden on own builds).
- Reviewed `git diff 9333c98..HEAD` (e094060, ec081db, 952ad23) against CF-51's criteria, card comments #22 and #24, `claude/evals/fixtures/inputs/cards/EX-1.md` and `review-round.js` (refute default at line 270, `GATES_NOTE`, `nextStep` at 1442/1448).
- Read lead.md whole: six steps, 49 lines, with no contradiction between steps 2, 3 and 4, Scope and the Invariants.
- Guard code is sound as code. Crashes fail, the self-test can't pass empty, and the current body passes each guard for the right reason.
- Repeat check: none of this round's findings is substantially round 2's. All three lows are new, and the first is a side effect of closing must-fix 1.
- low: claude/coder-fleet/agents/lead.md:32 - "one agent and one review" sits right next to the second `review-round` on the fix commit; a literal reader sees a clash
- low: claude/coder-fleet/agents/lead.md:32 - "as you ignore its gates note" points forward to a sentence that replaces the note with a refuter rather than ignoring it
- low: claude/evals/lib/lead-rules-contract.sh:69 - failure message names only "unless this step calls for one", though the check also accepts "unless step 4 calls for one"
- Worktree left as found: `git status --short` empty, HEAD 952ad23.
---

created: 2026-09-30 09:41
---
Ready to merge, not on main yet: PR #50 (https://github.com/rzem-ai/coder-fleet/pull/50), branch cf-51-lead-repeat-floor-reread, based on main. Review round 3: approve, with three wording lows folded into CF-96. check-all is green on 952ad23 (the lead's run). Done still needs: merge, the joint release (criteria 26 and 27), then ticking on main. Next in the lead.md track after merge: CF-24.1, CF-53, then CF-52 #4's and CF-90 #5's clauses.
---

created: 2026-09-30 13:25
---
Sub-issue 1 of 1: merged to main at 193b9de (PR #50), released in v0.29.0 (1afb9a6, PR #54, commit subject starting 'v0.29.0:'). Ticks #1 to #26: the step 3 and 4, Scope and Invariant text is read on main as reviewed on #50; the floor's refuter wording and High are pinned by lead-rules-contract.sh (10/0) in check-all; six steps and roster-contract are in check-all, green on main; the rubric lines are in claude/evals/lead/rubric.md; the migration checklist is in the coder's handoff; no file under skills/handoff/ changed; 0.29.0 is in both manifests. Done still needs: #27, the annotated tag v0.29.0 is on the release commit locally, and the human pushes it.
---

author: lead
created: 2026-10-06 03:52
---
Triage 2026-10-06. PR #50 (193b9de) shipped in v0.29.0 (1afb9a6, PR #54). The only open criterion is #27, the annotated v0.29.0 tag: the lead checked and `v0.29.0` is an annotated tag on this machine but is NOT on origin (git ls-remote --tags shows v0.30.0 to v0.33.0 and no v0.29.0). The criterion says the human pushes it, so the lead is asking the human in the session before anything is pushed. The DoD is unticked and will be ticked with evidence when the tag is on origin.
---

author: lead
created: 2026-10-06 03:57
---
Ticks 2026-10-06. Criterion #27: the annotated tag v0.29.0 on release commit 1afb9a6 is now on origin at 7aaab03, pushed by the lead on the human's decision in the session (the criterion said the human pushes; the human chose to have the lead do it). DoD #1: criterion #25, check-all exit 0 on the branch, and green on main at v0.29.0. DoD #3: criterion #24, the migration checklist in the coder's handoff and PR #50. DoD #4: criterion #26 plus the pushed tag. DoD #6: docs/specs/CF-51.md is in References. DoD #2 and #5 are ticked separately once the lead has read the review and port evidence in the trail.
---

author: lead
created: 2026-10-06 03:58
---
DoD #2 ticked: review round 3 on PR #50 was 'approve with follow-ups' after rounds 1 and 2 requested changes, and a refuter ran in each round (High item). DoD #5 not applicable: the spec lists the OpenCode and Codex ports as a non-goal, with the port update filed as CF-78. Every criterion and DoD item is now ticked; the close follows through the [board:CF-51] task.
---
<!-- COMMENTS:END -->
