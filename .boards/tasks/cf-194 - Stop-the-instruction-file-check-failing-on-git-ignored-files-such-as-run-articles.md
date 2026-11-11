---
id: CF-194
title: >-
  Stop the instruction-file check failing on git-ignored files such as run
  articles
status: In Progress
assignee: []
created_date: '2026-11-11 12:43'
updated_date: '2026-11-11 13:24'
labels: []
dependencies: []
references:
  - claude/evals/lib/instruction-file-contract.sh
priority: Medium
type: bug
ordinal: 325000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human ordered this on 2026-11-11 in triage. Asked how to unblock three card closes that the suite refused, he first asked "is there an instruction in `docs/runs/2026-11-11-reviewer-CF-192.md` or an instruction testing the contents in `docs/runs/2026-11-11-reviewer-CF-192.md`?" and, told it was a false positive in the check, answered "Both": reword the line now and fix the check.

What happened: `claude/evals/lib/instruction-file-contract.sh` scans the whole checkout for lines mentioning CLAUDE.md and fails `every CLAUDE.md mention is whitelisted` on any line not on its whitelist. It scans git-ignored files too. docs/runs/ is ignored (.gitignore:15) and holds run articles the lead saves locally; the reviewer's article for CF-192 said "The CLAUDE.md reminder is added at request time and never stored", a fact about Claude Code, not a fleet instruction. That one sentence turned check-all.sh red in the main checkout only, CI stayed green, and the TaskCompleted gate refused the close of CF-183.3 and would have refused every other close.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 instruction-file-contract.sh does not scan files git ignores: with a git-ignored file under docs/runs/ that mentions CLAUDE.md on a line outside the whitelist, the check passes
- [x] #2 A tracked file, or an untracked file git does not ignore, that mentions CLAUDE.md on a line outside the whitelist still fails the check and is named in its output
- [x] #3 The contract has a case for each of the two behaviours above, and the ignored-file case fails on the script as it is on main today
- [x] #4 bash claude/evals/lib/check-all.sh passes
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
created: 2026-11-11 12:43
---
Sub-issue 1 of 1: started. Done still needs: criteria 1 to 4.

Lead notice: the instruction-file check stops reading files git ignores, so a local run article can no longer turn the suite red or refuse a card close, while a real stray mention in a tracked or unignored file still fails. Lead defaults for the builder: decide ignored-ness with git itself (for example `git check-ignore` or `git ls-files`), not a hard-coded docs/runs path, and keep the check working when run from a linked worktree; no version bump on this branch, the release that carries it bumps.

Done: nothing yet; the human can close cards today only because the one stray line was reworded by hand. Not done: the check still scans ignored files.
---

author: lead
created: 2026-11-11 13:06
---
Scripter handoff, 12 Nov 2026: one commit, 968b4b3, on cf-194-skip-git-ignored-files-in-instruction-scan, changing only instruction-file-contract.sh. Hit files go through `git check-ignore --stdin` and ignored ones are dropped before the whitelist comparison. Four new cases in a throwaway git repo; the ignored-file case and the still-not-named case failed on the old script (15 passed, 2 failed) and pass now (17/0). Scripter's check-all.sh exit 0, 103.6 s.

Unverified by the scripter: not run from a linked worktree with an ignored file beside it; the empty-ignored-list path has no case of its own.

Proposed by the scripter (not filed): other checks under claude/evals/lib/ may scan the checkout with a plain grep and read ignored files too.

Done: the fix is built on a branch. Not done: not reviewed or merged, so a run article can still trip the check.
---

author: lead
created: 2026-11-11 13:13
---
Sub-issue 1 of 1: ready to merge in PR #140. Done still needs: Definition of Done 4, the release bump and tag, which the human ordered for when every In Progress and Next card is finished.

Review round 1 (c5dd066..968b4b3): approve with follow-ups, no must fix, four lows dropped under the build phase (the fixture repo does not unset GIT_DIR; the tracked-stray case cannot fail on its own; scan_clean passes if the nested scan crashes; check-ignore without -z misses non-ASCII names, erring towards a failing check). Gates run by the reviewer from the review worktree at 968b4b3: check-all.sh exit 0 (110.6 s, instruction-file 17/0), scope-hook 773/0, board-hook 269/0, handoff-parity 32 ok. No refuter: build phase, no authentication or credential path.

Ticked on that evidence: criteria 1 and 2 (the reviewer read the filter: git decides, tracked files are never dropped, an empty ignored list drops nothing), 3 (the two ignored-file cases fail on the old script, 15/2, and pass now), 4 (the reviewer's check-all run). Definition of Done: 1 the same run; 2 review approved, no refuter in the build phase; 3 not applicable: no agent body or skill frontmatter changed; 5 not applicable: no ported artefact changed; 6 not applicable: no spec.

Done: the fix is reviewed and up as draft PR https://github.com/rzem-ai/coder-fleet/pull/140. Not done: not merged, so a run article can still trip the check; merging once CI is green, on the human's order of 12 Nov 2026.
---

author: lead
created: 2026-11-11 13:18
---
12 Nov 2026: CI is green on PR #140 (deterministic pass, 3m45s), GitHub reports it clean and mergeable, and it is marked ready. The merge itself was refused in this session by Claude Code's auto mode classifier (no reason given), so the lead did not merge it and did not try another route. The human was told and asked about that step.

Done: reviewed, green, ready to merge at https://github.com/rzem-ai/coder-fleet/pull/140. Not done: not merged.
---

author: lead
created: 2026-11-11 13:24
---
Sub-issue 1 of 1: merged to main at 34bd97a (PR #140, squash-merged by the human on 12 Nov 2026, who then said: "any further PRs you are to merge yourself"). Done still needs: Definition of Done 4, the release bump and tag, which ride the release the human ordered for when every In Progress and Next card is finished.

The main checkout is fast-forwarded to 34bd97a, and the scripter's worktree and local branch are removed after checking the branch's change is identical to main's.

Done: on main, a git-ignored run article can no longer turn the suite red or refuse a card close. Not done: not released.
---
<!-- COMMENTS:END -->
