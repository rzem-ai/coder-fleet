---
id: CF-163
title: Make the board's archive-clears-before-move test pass reliably under load
status: In Progress
assignee: []
created_date: '2026-10-18 08:06'
updated_date: '2026-10-19 10:04'
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
- [ ] #1 The cause of the missing commit under load is found and named on the card (for example, an auto-commit raced, debounced or dropped), with evidence
- [ ] #2 The test checks the outcome it is about without depending on how fast the machine is, and a real regression in the archive-before-move order still fails it
- [ ] #3 The test passes in 20 back-to-back runs with the machine loaded (for example, alongside a check-all run), and the command and results are recorded on the card
- [ ] #4 bash claude/evals/lib/check-all.sh passes, apart from CF-159 while that is open
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
<!-- COMMENTS:END -->
