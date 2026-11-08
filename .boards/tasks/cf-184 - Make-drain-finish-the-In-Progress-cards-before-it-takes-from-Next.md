---
id: CF-184
title: Make drain finish the In Progress cards before it takes from Next
status: In Progress
assignee: []
created_date: '2026-11-08 04:12'
updated_date: '2026-11-08 05:11'
labels:
  - commands
dependencies: []
references:
  - claude/coder-fleet/commands/drain.md
priority: High
type: enhancement
ordinal: 311000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 8 Nov 2026: "create a command that says that an agent should continue working on anything in \"In Progress\" and start picking items from \"Next\"".

Decisions from Alex in the session (AskUserQuestion), 8 Nov 2026: "Fold it into drain" (rather than a new command beside it), and "Unattended" (questions go on the card as Actions for Human and the card is parked, as drain does today; each card stops at a pull request ready to merge).

Today claude/coder-fleet/commands/drain.md lists Next once at the start and builds only those cards; In Progress is never read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A card in In Progress that a live session or a running agent still holds - its worktree locked by a live process, or a spawn on it still running - is skipped with that reason and not built, so two builders never share a branch
- [ ] #2 drain's existing rules hold for In Progress cards too: questions are parked on the card with actionsAdd, nothing is merged, each card stops at ready to merge with its PR named on the card, and the focus is cleared between cards
- [ ] #3 drain's closing line and its /goal line account for both columns, naming the In Progress and Next cards separately
- [ ] #4 The command's description, claude/README.md and help-boards say that drain finishes In Progress before Next
- [ ] #5 The suite's roster and any check that pins drain's wording pass, and a contract or eval check pins the column order
- [ ] #6 /coder-fleet:drain first works the In Progress cards the human ordered built - a card carrying a lead `Sub-issue <n> of <m>: started` comment or the human's recorded order - top first by ordinal, then works Next top first; an In Progress card with neither is skipped as `not ordered`; the run's list is both columns as they stood at its start
- [ ] #7 Any card with build progress, whichever column it sits in, is resumed from its latest `Sub-issue <n> of <m>:` comments, branch and worktree, never rebuilt from scratch; a card counts as ready to merge only when every sub-issue is ready to merge or merged, judged against its criteria and not by how many sub-issue PRs exist
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
created: 2026-11-08 04:16
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-6.

Built on cf-184-drain-in-progress-first at 8bbd1db: drain.md lists In Progress then Next (top first by ordinal) as the run; skips a held In Progress card (a running spawn, or its worktree locked by a live pid) as `held`; resumes an In Progress card from its latest `Sub-issue <n> of <m>:` comment, branch and worktree; closing line `In Progress drained: ... Next drained: ...` and the /goal line updated. README, fleet-design and help-boards updated. Six column-order checks in next-column-contract.sh, watched failing on main's drain.md (34 pass, 5 fail) and passing after (39/0). Scripter's check-all.sh: exit 0, 88.3 s. Review round 1 running.

Done: nothing you can run yet; the change is built on a branch.
Not done: review, PR, release - /coder-fleet:drain still ignores In Progress.
---

created: 2026-11-08 04:22
---
Review round 1 (8bbd1db): request changes, 2 blocking. (1) 'latest comment says ready to merge in PR #<n> has nothing left to build' misreads a split card: CF-183's latest comment is sub-issue 1 of 3 ready to merge, with two sub-issues unbuilt. (2) 'A Next card starts fresh' would rebuild CF-183 beside PR #127. Low riding the fix: 'a branch named for the card's id' matches by prefix (cf-18 vs cf-184, CF-183 vs cf-183.1-); match the lower-cased id followed by '-'. The review's gate lanes ran in the wrong checkout (cf-183.1 at 33484e7), so no gate ran on this head; the lead runs them on the fix head.

Lead decision on the reviewer's follow-up (from the lead's invariant that no builder runs on work the human has not ordered, so not asked): a card reaches In Progress from any agent's start, a researcher's included, so drain resumes only In Progress cards with a lead build-start comment or the human's recorded order and skips the rest as `not ordered`. Criterion 1 is revised to say so and criterion 7 added for the two blocking findings.
---

created: 2026-11-08 04:29
---
Sub-issue 1 of 1: started (fix round 1 done, narrow review running). Done still needs: criteria 1-7.

Fix round 1, bf52d01 (drain.md only): a split card is ready to merge only when every sub-issue is ready to merge or merged, read from `Done still needs:` and the sub-issue cards; resumption keys on build progress in either column, never on the column; an In Progress card without a lead `started` comment or the human's recorded order is skipped as `not ordered`; the branch match is the lower-cased id followed by `-`. The scripter's `Blocker:` asking for criterion 7's text was a question for the lead, not the human: criterion 7 is the two blocking findings bf52d01 fixes.

Gates run by the lead in the scripter's worktree at bf52d01: check-all.sh exit 0 (90.1 s, "Every deterministic check passes"), scope-hook-contract exit 0 (773/0), board-hook-contract exit 0 (267/0), handoff-parity exit 0 (agree). Narrow review of 8bbd1db..bf52d01 running.

Done: nothing you can run yet. Not done: review, PR and release; installed drain still ignores In Progress.
---

created: 2026-11-08 05:08
---
Review round 2 (8bbd1db..bf52d01): approve with follow-ups. Gates from the review worktree at bf52d01: check-all.sh "Every deterministic check passes" (97.0 s), scope-hook 773/0, board-hook 267/0, handoff-parity 32 agree. Criteria 6 and 7 met as written; 1-5 hold.
The item has had its one review round and one fix round, so what is still open went into one Polish sub-issue, CF-184.1: which In Progress cards count as ordered when one reached In Progress before its `started` comment; the branch rule's `-` versus `.` contradiction; a card whose sub-issues are built but not all PR-named; fleet-design and help-boards overstating the In Progress rule.

Proposed by the reviewer (not filed): make claude/coder-fleet/board/src/test/board-port.test.ts:114 (busy default_port on 65535) deterministic - it failed in the mechanical lane's check-all run and passed in the reviewer's on the same commit bf52d01, so it is an intermittent failure and will fail a strict TaskCompleted gate at random.
---

created: 2026-11-08 05:11
---
Sub-issue 1 of 1: ready to merge in PR #128. Done still needs: criteria 1-7, ticked once proven on main; the release.

Draft PR https://github.com/rzem-ai/coder-fleet/pull/128 from cf-184-drain-in-progress (514b086), rebuilt on origin/main c121220 by cherry-picking 8bbd1db and bf52d01, because the first branch was cut from local main and carried 22 unpushed board commits. The superseded remote branch cf-184-drain-in-progress-first is left for the human to delete.

Done: drain finishing In Progress before Next is reviewed and up as a draft PR.
Not done: not merged or released, so the installed /coder-fleet:drain still ignores In Progress; the Polish sub-issue CF-184.1 is open.
---
<!-- COMMENTS:END -->
