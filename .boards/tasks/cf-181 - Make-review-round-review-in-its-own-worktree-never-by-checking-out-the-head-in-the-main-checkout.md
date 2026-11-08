---
id: CF-181
title: >-
  Make review-round review in its own worktree, never by checking out the head
  in the main checkout
status: Next
assignee: []
created_date: '2026-11-07 08:11'
updated_date: '2026-11-08 04:09'
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
- [ ] #1 review-round never changes the main checkout's HEAD, branch or working tree: every lane that needs the head's tree uses a worktree it creates for that run (or the coder's existing worktree at that head, read only), and removes any worktree it created when the round ends
- [ ] #2 A test or eval runs a round from a main checkout on its default branch and shows the checkout's HEAD, branch and git status are unchanged afterwards, with a board write made during the round landing on the default branch
- [ ] #3 Each lane reports the worktree path and HEAD it ran in, and a lane whose tree is not at the pinned head says so and runs nothing rather than grading the wrong tree
- [ ] #4 The lead's step 4 and the review-round docs say where reviews run, and the OpenCode port matches or has a divergence-register row
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
