---
id: CF-188
title: >-
  Make board flush skip board and memory paths a project has turned off or
  ignored
status: Done
assignee: []
created_date: '2026-11-10 04:28'
updated_date: '2026-11-12 00:19'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board/src/flush.ts
  - claude/coder-fleet/commands/init.md
  - CF-187
priority: Medium
type: bug
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 2026-11-10, from CF-187's review: `flushState` (claude/coder-fleet/board/src/flush.ts around 340-413) has no `auto_commit` or ignore guard, and `buildTree` writes index entries without consulting `.gitignore`, so a project that chose Ignore at /init after its board had already moved still gets its earlier coder-fleet/state commits pushed onto the default branch at the next flush.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the default branch's `.gitignore` ignores `.boards/` or `.claude/agent-memory/`, `board flush` lands no file under that path on the default branch, and says so in its output
- [x] #2 When `auto_commit` is not `true` in the live board's config, `board flush` lands no `.boards/` change and says so
- [x] #3 A test with a real linked state worktree pins both cases, and fails with the guard reverted
- [x] #4 `bash claude/evals/lib/check-all.sh` passes
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
created: 2026-11-11 22:12
---
Sub-issue 1 of 1: started, 12 Nov 2026, by drain; the card is in Next, which is the human's order. Done still needs: criteria 1 to 4.

Lead notice: `board flush` lands nothing under `.boards/` or `.claude/agent-memory/` on the default branch when the project's `.gitignore` ignores that path, lands no `.boards/` change when `auto_commit` is not true, and says so in its output. What the human will see: a project that chose Ignore at /init no longer gets board or memory files pushed onto main by a flush.

Lead defaults for the builder: the ignore test reads the `.gitignore` at the default branch's tip, the tree the flush builds on, not the working copy; a flush with nothing left to land after the skips exits 0 with a line saying what it skipped and makes no commit. Base: main at e7c332e.

Done: nothing yet. Not done: a flush still pushes ignored board and memory paths.
---

author: lead
created: 2026-11-11 22:23
---
Coder handoff, 12 Nov 2026: branch cf-188-flush-skips-ignored-paths at 161b8fd, two commits on e7c332e, up as draft PR https://github.com/rzem-ai/coder-fleet/pull/154. A flush holds back every `.boards` change while the live config does not say `auto_commit: true`, and holds back any changed path ignored by the `.gitignore` files at the default branch's tip, judged by git's own matcher (`check-ignore --no-index`) in a scratch repo under `.git/coder-fleet/`, so the working copy, info/exclude and global excludes play no part. Board and memory are judged separately. Beyond the brief: held-back changes are kept on the state branch in a `Keep what the flush did not land` commit so a restart does not drop them, and init.md step 2a's three sentences that described the old behaviour are corrected. Two new tests with a real linked state worktree; each failed with its guard reverted (matcher returning nothing, auto_commit forced on, carry commit removed). 18 flush tests pass; coder's check-all.sh exit 0.

Unverified by the coder: not run on Linux or Bun 1.3.14; a flush run from a git hook that exports GIT_* variables; a carry during a concurrent board write; a skip combined with a failed restart; matching is per file, so `*.md` holds back only matching files; while auto_commit stays off the same skip line repeats each flush.

Proposed by the coder (not filed): fix the import-order finding Biome reports in board/src/cli.ts, and run the board's `biome check` in the suite or CI, since nothing runs it.

Review round 1 running. No break round: build phase, and not an authentication path, though the flush writes to the default branch.
---

author: lead
created: 2026-11-11 22:53
---
Review round 1 (e7c332e..161b8fd): request changes, one must-fix. Gates run by the reviewer at 161b8fd, all exit 0: check-all.sh (board 367/0), scope-hook 916/0, board-hook 268/0, handoff-parity 32 agree. The skip guard meets criteria 1 to 4 as written, and both new tests would fail with their guard reverted.

Must fix, a regression downstream of the guard: the memory leftover check still compares the main checkout's notes with the flush commit. A note the flush skipped is not in that commit, so it counts as a differing leftover, the main checkout's fast-forward is refused on every flush, and the output tells the human to discard or set aside memory that is already safe on the state branch. It reaches any project that ignores agent memory with the board tracked. Low, riding the fix round: the auto_commit test does not check the skipped card is still on the state branch after the restart.

Follow-up left open for the human, not fixed in this round: when a flush that held something back fails to restart the state branch, the held-back changes are never judged again, and the next successful restart can put an older version of those files into the live board. Rare (a failed restart while auto_commit is off or a directory is ignored), but closing it needs a decision on how such a flush marks where the next one starts.

Unverified by the reviewer, reasoned and not run: in a project that ignores only one of the two directories and untracked it with `git rm --cached`, restarting the state branch on the carry commit could delete the other's untouched files from the state worktree.

The fix round is with the same coder. Done: nothing mergeable yet. Not done: the must-fix.
---

author: lead
created: 2026-11-11 22:59
---
Fix round, 12 Nov 2026: 7e0083b on the same branch, pushed to PR #154. flushState now passes the set of held-back paths to both leftover checks. A held-back memory note in the main checkout is left out of the comparison: never cleared, never listed as kept, and no longer a reason to refuse the fast-forward. The coder found the board's leftover check had the same shape for a skipped `.boards` path and gave it the same fix, with no test of its own. The new test (the tip ignores memory, the same note on the state branch and in the main checkout) failed before the fix with a `kept` line and `not fast-forwarded`, and passes now. The low is fixed: the auto_commit test checks the skipped card is still on the state branch after the restart, and fails with the carry commit removed. Coder's check-all.sh: exit 0, 115.6 s.

An intermittent failure the coder saw and showed by rerun: the first full run of flush.test.ts after the fix had two existing tests killed at bun's 5000 ms per-test timeout, with no failed assertion, under a load average near 40 while other suites ran; the same two passed alone and the whole file then passed 19/0 on the same code.

Narrow review of 161b8fd..7e0083b running. Done: nothing mergeable yet. Not done: the fix is unreviewed.
---

author: lead
created: 2026-11-11 23:07
---
Sub-issue 1 of 1: ready to merge in PR #154. Done still needs: the merge, which is the human's under drain, and Definition of Done 4, the version bump and tag.

Review round 2, narrow (161b8fd..7e0083b): approve; round 1's must-fix and Low are closed, and the new test would fail on a revert. Gates run by the reviewer at 7e0083b, all exit 0: check-all.sh (board 368/0), scope-hook 916/0, board-hook 268/0, handoff-parity 32 agree. CI on 7e0083b: deterministic pass on Linux at CI's Bun pin, and the board binaries built for all five targets.

Ticked on evidence: criterion 1 (the ignore test in flush.test.ts and the CLI's skip line, read by the reviewer in round 1); 2 (the auto_commit test); 3 (both tests use a real linked state worktree, and the coder watched each fail with its guard reverted, which the round-1 reviewer confirmed by reading); 4 (the reviewer's and CI's runs). Definition of Done: 1 the same runs; 2 the review approved after its one fix round, no break round in the build phase off an authentication path; 3 not applicable: no agent body or skill frontmatter changed; 5 not applicable: the port has no board; 6 not applicable: no spec.

Left open after the two rounds, recorded here and not filed. For the human's decision (round 1's follow-up): when a flush that held something back fails to restart the state branch, the held-back changes are never judged again and a later restart can put an older version of those files into the live board. Low, dropped: the board half of the fix (`held.has(path)` in clearLeftovers) has no test, and a held `.boards` leftover is now never reported or cleared even when it matches the flush. Unverified, reasoned and not run: in a project that ignores only one of the two directories and untracked it, restarting the state branch on the carry commit could delete the other's untouched files from the state worktree; a tracked-but-ignored memory note newly added on the tip could be overwritten by the fast-forward; a flush run from a git hook that exports GIT_* variables.

Done: on the branch, a flush lands nothing under a path the default branch ignores and no board change while auto_commit is off, says so, keeps what it held back on the state branch, and still fast-forwards the main checkout. Not done: not merged, not released.
---

author: lead
created: 2026-11-11 23:39
---
Action 1 answered by the human in the session, 12 Nov 2026: "Fix before release" - file the card and put it straight into the work, holding CF-188's merge until it is fixed. The fix is sub-issue CF-188.1, built on this card's branch. PR #154 is not to be merged until CF-188.1 is ready to merge with it.
---

author: lead
created: 2026-11-12 00:06
---
Sub-issue 1 of 2: merged to main at 745bd1c (PR #154, squash-merged by the lead on the human's order of 12 Nov 2026, with sub-issue CF-188.1's fix merged into the branch first, as the human's "Fix before release" required). Done still needs: Definition of Done 4, the release bump and tag, in PR #161.

CI passed on the combined head 134507e. Still open from the reviews, on no card: the board half of the leftover fix has no test. Filed separately at the human's word: CF-198, a flush's restart deleting untouched files under a path the default branch ignores and has untracked.

Done: on main, a flush lands nothing under an ignored path and no board change with auto_commit off, keeps what it held back, and still fast-forwards the main checkout. Not done: not released yet.
---

author: lead
created: 2026-11-12 00:13
---
Released in v0.52.0, 12 Nov 2026: bump 7479a72, tag v0.52.0 pushed, flush 95ddde7. Ticked: Definition of Done 4. Every criterion and Definition of Done item is now ticked.

Done: this card's change is in v0.52.0. Not done: it has not run in a live session yet.
---

author: @board
created: 2026-11-12 00:19
---
Actions for Human cleared: CF-188 moved from In Progress to Done.

- #1 (ticked) When a flush that held changes back then fails to restart the state branch, those changes are never judged again and a later restart can put older versions of those files into the live board. Should this be fixed on its own card before the next release, or accepted as a known limit and written into docs/limits.md?
---
<!-- COMMENTS:END -->
