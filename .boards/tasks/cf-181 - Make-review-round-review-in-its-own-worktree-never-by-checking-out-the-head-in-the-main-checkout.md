---
id: CF-181
title: >-
  Make review-round review in its own worktree, never by checking out the head
  in the main checkout
status: Done
assignee: []
created_date: '2026-11-07 08:11'
updated_date: '2026-11-11 12:40'
labels:
  - review-round
dependencies: []
priority: High
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 7 November 2026, in the Fathom session (FTH-506): "review-round should cut its own worktree. I concur - file a card."

What happened: the review round on Fathom PR #876 (FTH-506.3, head 3a0d72cce) moved the main checkout off main with `checkout: moving from main to 3a0d72cceb86df1032c9945077b3ae59c3d7ee02` (from the main checkout's reflog) and left it detached there. For the length of the round, every board write the hooks committed (two new cards and two comments) landed on that detached HEAD, not on main, and agent worktrees spawned meanwhile would have been cut from the reviewed branch, since the harness cuts them from the lead's HEAD. The lead found it only because a commit log looked wrong, then had to return to main and cherry-pick the four board commits. A later round's verdict reported running in a different session's worktree that was mid-merge with conflicted files, so it could not run the gates against its own head.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 review-round never changes the main checkout's HEAD, branch or working tree: every lane that needs the head's tree uses a worktree it creates for that run (or the coder's existing worktree at that head, read only), and removes any worktree it created when the round ends
- [x] #2 Each lane reports the worktree path and HEAD it ran in, and a lane whose tree is not at the pinned head says so and runs nothing rather than grading the wrong tree
- [x] #3 The lead's step 4 and the review-round docs say where reviews run, and the OpenCode port matches or has a divergence-register row
- [x] #4 A test or eval runs a round from a main checkout on its default branch and shows the checkout's HEAD, branch and git status are unchanged afterwards, with a board write made during the round landing on the board's state branch (coder-fleet/state, since 0.49.0) and never on the reviewed head or the main checkout
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
created: 2026-11-08 07:16
---
Drain, 8 Nov 2026. Lead decision: criterion 2 revised to the shipped design - since 0.49.0 (CF-183) a board write lands on coder-fleet/state in the state worktree, never on the default branch, so the test checks that instead (now criterion 4 in the list; the old #2 is removed).

More evidence from 8 Nov 2026 in the coder-fleet repo: the review lanes ran in whatever checkout the lead's shell was in, not the coder's worktree. Round 1 on CF-184 (8bbd1db) graded cf-183.1 at 33484e7 and its tests lane claimed 8bbd1db was an ancestor of HEAD; a narrow review on f75811d launched from the main checkout. Both times the lead had to run the gates itself. The review-round args accept no worktree key (it refused `worktree:`), so the lane's tree depends on the lead's cwd at launch.

Sub-issue 1 of 1: started. Done still needs: criteria 1, 3, 4 and the revised one.
---

author: lead
created: 2026-11-08 07:40
---
Built on cf-181-review-round-own-worktree (from origin/main 095d136): 67d482a grades every round in a named worktree at the pinned head (reuses the coder's clean worktree at the head read only, else cuts .claude/worktrees/review-round-<id>-at-<sha12> with --detach and removes it in a finally without --force; each tree lane checks show-toplevel and HEAD first and runs nothing on a mismatch; a verdict or refutation on the wrong tree stops the run); a7caa53 fixture hardening; 9d3ee3f lead.md step 4, README, limits.md entry, divergence-register Deferred row; 8da28bc coder memory. workflow-logic 757/0 (64 of the 72 new checks failed before the change); live fixture shows the main checkout unmoved and board writes on coder-fleet/state; 8 mutants all killed. Coder's check-all.sh: exit 0 captured, 92.2 s. migration-checklist over lead.md: no findings.

Known merge conflict with cf-183.2-memory-state: lead.md lines 32 (this card's step 4) and 33 (CF-183.2's step 5) are adjacent; keep both. Coder's unverified points: no live round yet; a reused coder worktree can move if that coder is still running; fix worktrees are still left for the lead to adopt; a crashed run's leftover review worktree stops the next run at the same head. Review round 1 running.
---

author: lead
created: 2026-11-08 07:50
---
Sub-issue 1 of 1: ready to merge in PR #131. Done still needs: criteria 1-4 ticked once proven on main; the release bump and tag.

Review round 1 (095d136..8da28bc): approve with follow-ups. Gates from the review worktree: check-all.sh exit 0 (88.2 s, workflow-logic 757/0 with the live fixture), scope-hook 773/0, board-hook 269/0, handoff-parity agree. Two lows dropped (the refuter's worktree bullet parsed with \S+ breaks on a path with a space; AGENTS.md:77 still says reviews never install). No refuter: build phase, no authentication or credential path.

Proposed by the reviewer (not filed): let review-round recover from a review worktree a crashed or concurrent run left at the same issue and head - an ownership marker or a per-run suffix - instead of stopping until it is removed by hand. Lead default meanwhile: fail closed, as built.

Done: review-round grading its own named worktree and refusing the wrong tree is reviewed and up as draft PR https://github.com/rzem-ai/coder-fleet/pull/131. Not done: not merged; the installed review-round still grades whatever checkout the lead's shell is in.
---

author: lead
created: 2026-11-08 08:32
---
Sub-issue 1 of 1: merged to main at 4c151fb (PR #131, merged on Alex's "merge the ready PRs"). Done still needs: Definition of Done 4, the version bump and tagged release.

The branch conflicted with #130 on adjacent lead.md lines 31 and 32 after #130 merged; resolved by keeping main's step 3 and this card's step 4, each checked unchanged on the other side against the merge base (merge commit 39e2040, CI deterministic pass). Criteria ticked on main, on evidence: 1 - review-round.js names one tree and removes a cut one in a finally (review round 1); 2 - workflow-logic.mjs's live fixture shows the main checkout unmoved and mid-round board writes on coder-fleet/state (757/0); 3 - each tree lane checks and reports its worktree and HEAD and runs nothing on a mismatch; 4 - lead.md step 4, claude/README.md, docs/limits.md and an OpenCode register row. Definition of Done: 1 check-all.sh exit 0 at 8da28bc and CI on 39e2040; 2 review round 1 approved, no refuter in the build phase; 3 migration-checklist findings in PR #131 (none); 5 the register row; 6 not applicable, no spec.

Done: on main, review-round grades a worktree it names at the pinned head and never moves the main checkout. Not done: not released, so installs still run the old review-round until the next version.
---

author: lead
created: 2026-11-11 12:23
---
Triage, 11 Nov 2026. Definition of Done 4 ticked on evidence, at the human's "Tick and close both (Recommended)": the merge 4c151fb is contained in tag v0.50.0 (26774e5 on origin), and plugin.json reads 0.50.0.

Done: shipped in v0.50.0, so installs now run the review-round that grades its own worktree. Not done: nothing on this card.
---
<!-- COMMENTS:END -->
