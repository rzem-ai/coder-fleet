---
id: CF-126
title: >-
  Pin review-round's range against the branch's real upstream, not a stale local
  main
status: In Progress
assignee: []
created_date: '2026-10-04 21:36'
updated_date: '2026-10-06 12:11'
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
- [x] #1 With local main behind origin/main, a review-round run with a target reviews only the target's own commits (or stops naming the gap), with a workflow-logic case for the stale-main shape
- [x] #2 (from CF-66, folded in) A review-round run given a branch name as head or target pins the branch's tip as origin has it when the local branch is behind origin, or stops naming the gap; a workflow-logic case covers the 2026-10-06 shape where the local branch lagged its pushed fix and the round reported 'nothing to review'
- [x] #3 (from CF-66) With no remote, the resolution falls back to the local refs and says so in the log
- [x] #4 check-all is green and the version is bumped
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

author: @SubagentStop
created: 2026-10-06 11:49
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree confirmed linked and clean. I fetched, then cut `cf-126-pin-against-origin` from origin/main (82d758f). It's pushed and the PR is open; I wrote no board column.
- `a000578` "Pin review-round's branch ends where origin has them, and stop on divergence (CF-126, CF-66)" changes `claude/coder-fleet/workflows/review-round.js` and `claude/evals/lib/workflow-logic.mjs`.
- Lane report: for each end given as a branch name (base, head, target, or the default branch behind a target), the pin lane now also reports `refs/remotes/origin/<name>`, the two `git merge-base --is-ancestor` answers, and whether an `origin` remote exists. Each end's own `sha` stays the local commit.
- `pinEnd`, local behind origin: pins origin's commit and logs both commits.
- `pinEnd`, local ahead of origin: keeps the local commit and logs that.
- `pinEnd`, diverged: stops as `diverged from origin`, naming both commits.
- `pinEnd`, different commits with a missing or contradictory ancestry answer: stops as `origin ancestry unreported`, naming both commits.
- `pinEnd`, no origin remote or no origin copy of the branch: pins local and logs why.
- `pinEnd`, a full commit id, `HEAD`, or anything with `~`/`^`: pinned as resolved, and the lane isn't asked about origin for it.
- No `git fetch` was added.
- `accf7e0` "Record the origin pin's unproven live lane in docs/limits.md (CF-126)" adds an entry to `docs/limits.md` under "Never run against a live Claude". `hooks/README.md` doesn't describe how the range is pinned, so I left it alone.
- `28a229a` "v0.37.5: pin review-round's branch ends against origin, and stop on divergence" sets the version to 0.37.5 in both `plugin.json` and `marketplace.json`.
- Criterion 1 (stale local main with a target): `stale-main-target-pins-origin`, `stale-main-target-logged`, `stale-main-target-reviews`.
- Criterion 2, today's case: `stale-head-pins-origin`, `stale-head-logged`, `stale-head-reviews`. The scope stub answers like git, so a range from a commit to itself is empty. Before the change this case stopped as "nothing to review" at `ba5e0000...ba5e0000`.
- Criterion 2, target branch behind origin: `stale-target-pins-origin`.
- Criterion 2, stops: `diverged-stops:{head,target-base}`, `diverged-names-both:*`, `diverged-reviews-nothing:*`, `ancestry-unreported-stops`, `ancestry-unreported-names-both`.
- Criterion 3 (no remote falls back and says so): `no-remote-pins-local`, `no-remote-logged`, plus `no-counterpart-pins-local` and `no-counterpart-logged`.
- Criterion 4: `bash claude/evals/lib/check-all.sh` exited 0, "total: 67.3s", "Every deterministic check passes". workflow-logic was 639 passed, 0 failed; versions 0.37.5 / 0.37.5.
- Brief's extra cases: `commit-id-untouched` and `commit-id-not-asked` (commit id untouched), plus `local-ahead-*`, `pin-asks-origin-refs`, `pin-schema-origin`, `head-not-a-branch`.
- Every new test was seen failing first: 18 failed on the first run, and 19 after I added the stale-head scope stub.
- What makes each test fail: removing `pinEnd` (or applying none of its results) fails the origin-pin and stop cases. Removing the `originRemote === false` branch fails `no-remote-logged`. Dropping the `HEAD` exclusion in `isBranchName` fails `head-not-a-branch`. Dropping `originAsk` from the prompt fails `pin-asks-origin-refs`.
- Commands run: `node claude/evals/lib/workflow-logic.mjs` went red at 621/18, then 620/19, then green at 639/0. I ran check-all once, through a scratch script, because the guard refuses compound commands.
---

author: lead
created: 2026-10-06 11:49
---
Sub-issue 1 of 1: ready to merge in PR #71 (cf-126-pin-against-origin, v0.37.5), after review. Done still needs: one review round (build: no refuter, the change touches no authentication or credential path; no fix lane), criteria ticked on main, the tag, the close.

Done, on the coder's word: the pin lane reports each branch-name end's origin counterpart, ancestry both ways and whether origin exists; pinEnd pins origin's commit when local is behind, keeps local when ahead, stops 'diverged from origin' or 'origin ancestry unreported' naming both commits, falls back to local with a log line when there is no remote or no counterpart, and leaves commit ids, HEAD and ~/^ forms alone; no fetch added. 21 new cases, red first (18, then 19), workflow-logic 639/0; check-all 67.3 s. docs/limits.md records that no live pin lane has run.
Not done: nothing on main. Held proposals: a lead.md line to fetch before a review-round run (without it the pin reads a stale origin); whether an end that exists only on origin should pin rather than stop.
---

author: lead
created: 2026-10-06 12:04
---
Review round 1 on 82d758f...28a229a: approve with follow-ups, nothing blocking, clean; no refuter (build, no auth or credential path). Two follow-ups: (1) in a board repo local main always carries unpushed board commits (91 ahead, 0 behind today), so after a fetch it has diverged from origin rather than fallen behind; the 'behind, pin origin' path never fires here and every target-mode review would stop 'diverged from origin'. (2) A single-ref range ('feature') derives base as the local feature~1 while the head moves to origin's tip, so a lagging local branch silently widens the review to every commit it lagged by: the same wrong-range class this card exists to end.

Decision the human gave in the session, 2026-10-06, on (1): use origin/<default> as the base whenever it exists (coders cut branches from origin/main, so origin's tip is the fork point, and local main's extra commits are board auto-commits that never belong in a review); fall back to local main with no remote. Fix round 1 (the item's one): that rule for the default-branch base in target mode and when base is the default branch by name; (2) derive a single-ref range's base from the pinned head (pinnedHead~1); and the low that the diverged stop advises a rebase, which on main would rewrite board history (advise merging origin into the branch instead). Other lows dropped: abbreviated ids asked about origin, origin.ref not checked against the name asked for, a test helper named backwards, two guard cases that pass either way.
---

author: @SubagentStop
created: 2026-10-06 12:09
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- `ee84bcf` "Base review-round on origin/<default>, keep a single-ref range to one commit, never advise a rebase (CF-126 fix round 1)", in `claude/coder-fleet/workflows/review-round.js` and `claude/evals/lib/workflow-logic.mjs`.
- Item 1: a base that is the default branch now pins `origin/<default>` whenever that ref exists, whatever local main's ancestry, and the log names both commits. This covers target mode's derived base and a base given by the default branch's name, which the pin lane is now also asked to find in range mode. With no remote or no origin copy it uses local main and logs why. Other branches keep the behind, ahead and diverged rules.
- Item 1 cases: `default-base-diverged-pins-origin:target` and `:base-by-name`, `default-base-diverged-logged:target` and `:base-by-name`, `default-base-no-ancestry-pins-origin`, `range-pin-asks-default`.
- Item 1, no remote: `default-base-no-remote-local` and `default-base-no-remote-logged`. These passed on the first run, because the old code already fell back to local; they guard behaviour rather than prove the fix.
- The old `diverged-stops:target-base` case became `diverged-stops:non-default-base` (base `develop`), because the human's rule turns the old case into a pin.
- Item 2: a single-ref range (`feature`) whose head moves to origin now takes the parent of origin's commit as its base, reported by the lane as `origin.parentSha`. If the lane doesn't report it, the run stops as `origin parent unreported` rather than widening the review. When the head stays local, the base is still the local `feature~1`.
- Item 2 cases: `single-ref-base-from-pinned-head`, `single-ref-asks-parent`, `single-ref-no-parent-stops`, `single-ref-local-unchanged`.
- Item 3: the `diverged from origin` next step now says to merge `origin/<name>` into the local branch, or push the local branch if it is the one to keep, with no mention of rebase. Case: `diverged-advises-merge:{head,non-default-base}`.
- Red first: 10 failed before the change (642 passed, 10 failed), the 2 no-remote cases passed as noted, and `single-ref-local-unchanged` passed too, as it should. `range-pin-asks-default` was added after the code, so I watched it fail by commenting out `defaultAsk` in the prompt (652 passed, 1 failed), then restored the line and confirmed it was back.
- `4053cd1` "Keep docs/limits.md true to the default-branch base and single-ref rules (CF-126 fix round 1)" updates the `docs/limits.md` entry to match.
- Commands: `node claude/evals/lib/workflow-logic.mjs` went from 642/10 to 653/0. `bash claude/evals/lib/check-all.sh`, run once through the scratch script: exit 0, "total: 74.3s", "Every deterministic check passes". `git push` moved the branch from 28a229a to 4053cd1, a normal push.
---

author: lead
created: 2026-10-06 12:11
---
Merged in PR #71, v0.37.5 tagged; CI green. Ticks: #1-#3 by the workflow-logic cases named in the handoffs (653/0), including the human's origin/<default> base rule and the single-ref fix from fix round 1; #4 check-all 74.3 s. DoD: review round approved (build, no refuter); #3, #5, #6 not applicable.
---
<!-- COMMENTS:END -->
