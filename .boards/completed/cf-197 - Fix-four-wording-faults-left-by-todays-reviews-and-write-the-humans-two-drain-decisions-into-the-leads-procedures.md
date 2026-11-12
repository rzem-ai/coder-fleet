---
id: CF-197
title: >-
  Fix four wording faults left by today's reviews, and write the human's two
  drain decisions into the lead's procedures
status: Done
assignee: []
created_date: '2026-11-11 23:39'
updated_date: '2026-11-12 00:30'
labels: []
dependencies: []
priority: Medium
type: bug
ordinal: 333000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human in the session, 12 Nov 2026. On CF-196's action 1: "Fix all four (Recommended)". On CF-184.1's action 1: "Sub-issue's own card (Recommended)". On CF-184.1's action 2: "Build with the parent".

The four faults are the Low findings recorded on CF-195 and CF-196. The two decisions change the lead's procedures so they agree with drain as CF-184.1 leaves it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 commands/ask.md says a card leaves Blocked by human on its next agent start or when the human moves it, never as soon as its last action is ticked
- [x] #2 The keep-local-main-level rule in lead-procedures says what the lead does when `git fetch` itself fails and where it reads the remote and default branch names from
- [x] #3 It says that when the main checkout is on another branch the lead tells the human which branch is out, since worktrees are cut from it
- [x] #4 It says a flush that reports it did not fast-forward is read as a refusal
- [x] #5 lead-procedures says a sub-issue's started, ready and merged comments go on the sub-issue's own card, never its parent's
- [x] #6 lead-procedures says a Polish sub-issue filed at the end of an ordered item's rounds is part of that order, needing no further go
- [x] #7 The OpenCode port's lead carries whichever of these apply to it, and `bash claude/evals/lib/check-all.sh` passes
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
created: 2026-11-11 23:40
---
Sub-issue 1 of 1: started, 12 Nov 2026. Done still needs: criteria 1 to 7.

Lead notice: one small pull request corrects the false sentence in /coder-fleet:ask, closes the three gaps in the keep-local-main-level rule, and writes the human's two drain decisions into the lead's procedures. What the human will see: a release that does not ship a sentence known to be false, and a lead whose rules agree with drain.

The lead builds this itself: prose only, under the size floor. Lead default: the remote and default branch names are read from the remote's HEAD ref, as prune-worktrees does.

Done: nothing yet. Not done: all six wordings.
---

author: lead
created: 2026-11-11 23:54
---
Sub-issue 1 of 1: merged to main at 432439e (PR #159, squash-merged by the lead, 12 Nov 2026, after CF-184.1's PR #152, which the reviewer said it must not land ahead of). Done still needs: Definition of Done 4, the release bump and tag the human ordered.

Review round 1 (cfa439d..8a62159): approve with follow-ups, no must-fix. Gates run by the reviewer at 8a62159: check-all.sh exit 0, scope-hook 916/0 (exit not captured; it also ran inside check-all), board-hook 268/0, handoff-parity 32 agree. CI on 8a62159: deterministic pass. The reviewer checked the new claims against the start hook, flush.ts and drain.md.

Ticked on evidence, each read by the reviewer: criteria 1, 3, 4, 5 and 6 as written; 2 in part (see the Low below); 7 (the port's lead carries the failed-fetch case, the rest not applying to a port with no board, flush or drain; the suite passed). Definition of Done: 1 the reviewer's and CI's runs; 2 the review approved, no break round for prose; 3 the checklist's result, no findings, is in PR #159; 5 not applicable: the port takes the one rule that applies, with no divergence; 6 not applicable: no spec.

Left open, recorded here and not filed. Follow-up: with a sub-issue's comments on its own card only, nothing says where a split parent's list of remaining sub-issues is written. Low, dropped: the rule points at origin/HEAD for the default branch but does not say where another remote's name comes from, and drops prune-worktrees' fallback to main when origin/HEAD is unset; the port's lead has the same unnamed default branch.

Done: on main, the false sentence in /coder-fleet:ask is corrected, the keep-level rule covers a failed fetch, another branch and a declining flush, and the lead's procedures carry the human's two drain decisions. Not done: not released.
---

author: lead
created: 2026-11-12 00:13
---
Released in v0.52.0, 12 Nov 2026: bump 7479a72, tag v0.52.0 pushed, flush 95ddde7. Ticked: Definition of Done 4. Every criterion and Definition of Done item is now ticked.

Done: this card's change is in v0.52.0. Not done: it has not run in a live session yet.
---
<!-- COMMENTS:END -->
