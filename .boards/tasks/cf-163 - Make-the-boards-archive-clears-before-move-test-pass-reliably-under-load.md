---
id: CF-163
title: Make the board's archive-clears-before-move test pass reliably under load
status: In Progress
assignee: []
created_date: '2026-10-18 08:06'
updated_date: '2026-10-19 10:45'
labels: []
dependencies: []
type: bug
ordinal: 298000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word, 2026-10-18. On the PR #96 branch, `archive-clears-before-move` in claude/coder-fleet/board/src/test/actions-for-human-core.test.ts failed once during check-all at load average 47 (commit count 4, expected 5), then passed (50 pass, 0 fail) when rerun with `bun test --timeout=60000` on the same commit at load 42. Two runs with different outcomes make it an intermittent failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The cause of the missing commit under load is found and named on the card (for example, an auto-commit raced, debounced or dropped), with evidence
- [x] #2 The test checks the outcome it is about without depending on how fast the machine is, and a real regression in the archive-before-move order still fails it
- [x] #3 The test passes in 20 back-to-back runs with the machine loaded (for example, alongside a check-all run), and the command and results are recorded on the card
- [x] #4 bash claude/evals/lib/check-all.sh passes, apart from CF-159 while that is open
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
created: 2026-10-18 12:52
---
2026-10-18, another instance under load: server-host-guard.test.ts "serves the page and an asset to loopback, and refuses both to a rebinding Host" failed (no response within 5s, test ran 594 s) in a check-all run on PR #101's a3ded99 that took 1555 s with several suites running; the same file passed 35/35 alone on the same commit. Earlier the same day git-commit.test.ts "retries a locked index" failed once under load. Both are timing-based tests failing when the machine is saturated.
---

created: 2026-10-18 13:40
---
2026-10-19: board-hook-contract live-resume-from-blocked-human and live-resume-archives-actions failed in a check-all on PR #104 that waited 240 s for the lock then ran unlocked beside another check-all; alone on the same commit, 265/0. The log shows 'No such file or directory' on state/sessions/s-w/runs paths, a lead for what they race on. The PR #103 reviewer saw 12 live-backend board-hook cases fail in a 370 s loaded run the same night.
---

created: 2026-10-19 09:08
---
2026-10-19 20:02 AEDT: the CF-162 close gate (check-all on main 9c387db) failed `FAILED: board` while a CF-164.3 coder ran beside it. A bare `bun test` in claude/coder-fleet/board on the same commit at load 41.8 gave 1705 pass and 6 fail, including getTaskPath "should handle errors gracefully", "package bin wrapper", task_search including completed tasks, and "stay-in-queue-untouched". The log is in the lead's scratchpad (board-close.log). Not yet shown to be intermittent: the close will be retried when the machine is quiet.
---

created: 2026-10-19 09:24
---
2026-10-19 20:24 AEDT: the CF-162 close retried on main 93d7bd5 (differs from 9c387db only by board-card commits) and passed the check-all gate at load 33. That makes the earlier `FAILED: board` an intermittent failure: two runs, different outcomes, same code.
---

created: 2026-10-19 09:50
---
2026-10-19 20:48 AEDT: the CF-167 close gate on main 972d242 failed with `FAILED: board-hook-contract` (292 s). Run alone on the same commit at load 69 (none of the lead's agents running), the contract passed: 265 passed, 0 failed, across 4 shards. Another intermittent failure. An earlier CF-167 close timed out (exit 124) at the 480 s gate limit under load.
---

created: 2026-10-19 10:04
---
2026-10-19, the human ordered this card in the session (picked "CF-163 board failures" alongside CF-164.3, CF-167 and CF-162). It ran last, so the other builds' load would not disturb its timing evidence.

Sub-issue 1 of 1: started. Done still needs: criteria 1-4.
Done: nothing yet.
Not done: `archive-clears-before-move` can still fail when the machine is loaded, and its cause is not yet named.
---

created: 2026-10-19 10:33
---
Cause (criterion 1), from the coder on PR #112: under load, Bun 1.3.10's `Bun.spawnSync` now and then returns exit 0 with stdout lost.

`commitBoard` in claude/coder-fleet/board/src/git/operations.ts read an empty answer from `git rev-parse --show-toplevel` as "not in a git repository" and skipped the commit. It logged only a skip line, so this was a dropped board commit, not a slow test.

Evidence:
- The failing run's board log has `2026-10-18T08:01:42Z [board] commit skipped for "Archive task BD-1": the board is not in a git repository` inside a git repo.
- A probe made 12000 spawnSync calls to rev-parse at load ~49 and got 6 with exit 0 and empty stdout (node execFileSync: 2). Async Bun.spawn lost none.
- Older test logs show six more such skips on other writes.

Fix: commitBoard decides by exit code. A new test uses a stand-in git that answers empty and fails without the fix. The archive test now also checks the commit's subject and contents, and retries git reads that cannot be empty.

Criterion 2: the test fails when the order is broken four ways.
Criterion 3: 20 of 20 runs at load 48-121, each 50 pass and 0 fail.
Criterion 4: check-all exit 0 (236.9 s).

Sub-issue 1 of 1: ready to merge in PR #112 (v0.42.5 bump included) after review. Done still needs: the review, the merge and the tag.
Done: in the PR, board writes are committed even when git's answer is lost under load.
Not done: not merged. Other board git reads (mainCheckoutOf, listTaskIdsAcrossRefs, the getRepositoryRoot callers in backlog.ts) still read a lost answer as empty, and that is not covered by this card.
---

created: 2026-10-19 10:45
---
Sub-issue 1 of 1: merged to main at 3c93b70 (PR #112), released as v0.42.5. Done still needs: nothing beyond the close gate.

Done: board writes are committed even when Bun loses git's answer under load, and `archive-clears-before-move` checks the commit's contents rather than racing the machine.

Evidence:
- #1: the cause is in comment #7: Bun.spawnSync lost stdout, and commitBoard skipped the commit.
- #2: the test fails on four broken orders, and the stand-in-git test fails without the fix (the reviewer confirmed both by reading).
- #3: 20/20 runs at load 48-121, each 50 pass and 0 fail, via the coder's loop20.sh.
- #4: check-all exit 0 (reviewer, 220 s; board 320 pass, board-hook-contract 265 pass).

Definition of Done:
- 1: suite green.
- 2: reviewer approved with follow-ups (two lows, dropped). The build phase runs no refuter on a non-credential path.
- 3: not applicable: no agent body or skill frontmatter changed.
- 4: v0.42.5 tagged on 3c93b70 and pushed.
- 5: not applicable: no ported artefact changed.
- 6: not applicable: there is no spec.

Not done: other board git reads (getRepositoryRoot callers in backlog.ts, mainCheckoutOf, listTaskIdsAcrossRefs) still read a lost answer as empty. The human chose to leave that, 2026-10-19.
---
<!-- COMMENTS:END -->
