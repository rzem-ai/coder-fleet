---
id: CF-126
title: >-
  Pin review-round's range against the branch's real upstream, not a stale local
  main
status: To Do
assignee: []
created_date: '2026-10-04 21:36'
labels: []
dependencies: []
priority: Medium
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
