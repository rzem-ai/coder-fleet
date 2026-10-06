---
id: CF-126
title: >-
  Pin review-round's range against the branch's real upstream, not a stale local
  main
status: To Do
assignee: []
created_date: '2026-10-04 21:36'
updated_date: '2026-10-06 11:38'
labels: []
dependencies: []
priority: High
type: bug
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the CF-53 review-round run, 2026-10-05: with a `target` and no base, review-round pinned `main...target` against local main, which was behind origin/main by the merged PR #55. The reviewed range carried 21 already-merged CF-111 commits next to CF-53's 14 (30 files where CF-53 changes 12), every lane reviewed and tested someone else's merged work, and range triggers fired on #55's content. Either base the range on the merge-base with the branch's upstream (origin/main when local main is behind it), or stop and say local main is behind before pinning. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With local main behind origin/main, a review-round run with a target reviews only the target's own commits (or stops naming the gap), with a workflow-logic case for the stale-main shape
- [ ] #2 (from CF-66, folded in) A review-round run given a branch name as head or target pins the branch's tip as origin has it when the local branch is behind origin, or stops naming the gap; a workflow-logic case covers the 2026-10-06 shape where the local branch lagged its pushed fix and the round reported 'nothing to review'
- [ ] #3 (from CF-66) With no remote, the resolution falls back to the local refs and says so in the log
- [ ] #4 check-all is green and the version is bumped
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
created: 2026-10-06 04:24
---
2026-10-06, the human, in the session, ordered this with CF-66 ahead of the remaining backlog ('CF-66/CF-126: review-round pins against origin'). Today's evidence: review-round pinned head by the local branch name cf-140-next-column, which was behind origin after the coder pushed, and reported 'nothing to review'; the relaunch had to pin the commit by hand. CF-66 and CF-126 are one change and one coder. Raised to High.
---

author: lead
created: 2026-10-06 11:38
---
Sub-issue 1 of 1: started, with CF-66 folded in as one change (one coder, same function in review-round.js). CF-66 carried only a provisional criterion, so its substance is added here as criteria 2 and 3, from its description and today's evidence; criterion 4 is the usual gate. Built in build phase: one review round. Version 0.37.5 assumed.

Done: nothing yet; review-round still pins a stale local branch or main when origin is ahead.
Not done: the origin-aware pin for base, head and target.
---
<!-- COMMENTS:END -->
