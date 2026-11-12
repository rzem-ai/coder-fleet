---
id: CF-191
title: 'Polish: three wording fixes left in triage, springclean and /init after review'
status: In Progress
assignee: []
created_date: '2026-11-10 04:28'
updated_date: '2026-11-11 23:50'
labels: []
dependencies: []
references:
  - CF-185
  - CF-186
  - CF-187.1
priority: Low
type: bug
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 2026-11-10: the Low findings left under the round cap on CF-185, CF-186 and CF-187.1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 triage.md says each close runs the project's TaskCompleted gate, which may run the whole suite, rather than saying every close takes several minutes; and its leave-it skip holds per action, not only when the leave-it is the card's latest comment
- [x] #2 springclean.md holds a candidate for a Draft only when the Draft names it as a direct dependency (the first level of its Depends on tree), matching the direct Dependents rule; and after any task_complete error it re-lists Done to report what was cleared
- [x] #3 init.md step 2b's report does not say board writes are committed when the board is ignored, whether step 2a chose the ignore this run or found it already in place
- [x] #4 `bash claude/evals/lib/check-all.sh` passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-11 22:21
---
Sub-issue 1 of 1: started, 12 Nov 2026, by drain; the card is in Next, which is the human's order. Done still needs: criteria 1 to 4.

Lead notice: three wording fixes in the triage, springclean and /init commands, as the criteria list them. What the human will see: triage no longer claims every close takes minutes and remembers a leave-it answer per action; springclean holds a card for a Draft only on a direct dependency and re-lists Done after an error; /init stops saying board writes are committed when the board is ignored.

No lead decisions beyond the criteria. Base: main at e7c332e. Another card in this drain, CF-171, also changes init.md, in a different step.

Done: nothing yet. Not done: all three wordings stand as reviewed.
---

author: lead
created: 2026-11-11 22:28
---
Scripter handoff, 12 Nov 2026: branch cf-191-command-wording-fixes at 6099423, one commit on e7c332e, up as draft PR https://github.com/rzem-ai/coder-fleet/pull/156. triage.md step 3 says each close runs the project's TaskCompleted gate, which may run the whole suite, and step 5's leave-it skip holds per action. springclean.md holds a candidate for a Draft only on a direct dependency and re-lists Done after a task_complete error. init.md step 2b's report says board writes are not committed when the board is ignored, in both of step 2a's cases, and names the auto_commit value the config holds. No contract check pinned the old wording; the port's init.md carries no such claim. Scripter's check-all.sh: exit 0, 302.6 s while other suites ran beside it.

Unverified by the scripter: in the already-ignored case the config is left alone, so auto_commit may still be true there, and the report names the real value instead of asserting false.

Review round 1 running. No break round: prose alone.
---

author: lead
created: 2026-11-11 22:54
---
Review round 1 (e7c332e..6099423): request changes, one must-fix. Gates run by the reviewer from a review worktree at 6099423, all exit 0: check-all.sh, scope-hook 916/0, board-hook 268/0, handoff-parity 32 agree. The triage and springclean wording meets criteria 1 and 2.

Must fix: init.md step 2b's new report says board writes are not committed when the board was already ignored, which is false when the config still holds `auto_commit: true`: an ignore line that is uncommitted, or newer than the state branch, stops no commit, and the flush then lands the board on the default branch. The reviewer's point is that criterion 3's premise, ignored means not committed, is itself wrong. Lead default for the fix, easily reversed: the report keys on the config's auto_commit value; with false it says writes are not committed, with anything else it says the ignore alone does not stop commits on coder-fleet/state and names the value. That still meets the criterion's letter: the report never claims commits where there are none. Low, riding the fix round: triage step 6 should make a leave-it comment name its action's number, so step 5's per-action skip has something to match.

The fix round is with the same scripter. Done: nothing mergeable yet. Not done: the must-fix.
---

author: lead
created: 2026-11-11 22:57
---
Fix round, 12 Nov 2026: 584aded on the same branch, pushed to PR #156. init.md step 2b's report now keys on the config's auto_commit value in both of step 2a's ignore cases: with false it says board writes are not committed; with anything else it says the ignore alone does not stop commits on coder-fleet/state, that only auto_commit: false does, and names the value. triage.md step 6 makes a leave-it comment name its action's number or say it is the card's blocker. Scripter's check-all.sh: exit 0, 125.5 s.

Narrow review of 6099423..584aded running. Done: nothing mergeable yet. Not done: the fix is unreviewed.
---

author: lead
created: 2026-11-11 23:06
---
Sub-issue 1 of 1: ready to merge in PR #156. Done still needs: the merge, which is the human's under drain, and Definition of Done 4, the version bump and tag.

Review round 2, narrow (6099423..584aded): approve, no findings; round 1's must-fix and Low are closed. Gates run by the reviewer at 584aded: check-all.sh exit 0, scope-hook 916/0, board-hook 268/0, handoff-parity 32 agree. CI on 584aded: deterministic pass.

Ticked on evidence, each read by the reviewer across the two rounds: criterion 1 (triage.md steps 3, 5 and 6); 2 (springclean.md's direct-dependency hold and re-list after an error; the reviewer checked "first level" against the Depends on tree's rendering); 3 (init.md step 2b's report keys on auto_commit, per the lead's default in comment 3, and never says writes are committed when they are not); 4 (the reviewer's and CI's runs). Definition of Done: 1 the same runs; 2 the review approved after its one fix round, no break round for prose; 3 not applicable: commands changed, no agent body or skill frontmatter; 5 not applicable: the port's init.md carries no such claim; 6 not applicable: no spec.

Unverified by the reviewer: where the state worktree's own .gitignore also ignores .boards, the binary skips the commit even with auto_commit true, so the new wording would overstate the risk there; it errs on the safe side.

Done: on the branch, the three wordings are corrected. Not done: not merged, not released. It changes init.md step 2b, as CF-171 (PR #157) and CF-188 (PR #154) change other parts of that file, so the later merges may need a conflict resolved.
---

author: lead
created: 2026-11-11 23:50
---
Sub-issue 1 of 1: merged to main at c39346e (PR #156, squash-merged by the lead on the human's order of 12 Nov 2026, "merge the ready PRs yourself, then tag a new version"). Done still needs: Definition of Done 4, the release bump and tag the human ordered.

Done: on main, the three wordings in triage, springclean and /init are corrected. Not done: not released. The worktree and branch are removed.
---
<!-- COMMENTS:END -->
