---
id: CF-56
title: Bring check-all.sh back under two minutes
status: In Progress
assignee: []
created_date: '2026-09-28 04:43'
updated_date: '2026-10-06 08:36'
labels: []
dependencies: []
priority: High
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured 2026-09-28: bash claude/evals/lib/check-all.sh takes 200 seconds on main (v0.27.9) on marvin, against the two-minute budget AGENTS.md sets so one run fits a shell timeout. CF-25 adds about 13 seconds to the board section. Find where the time goes (per sub-suite timing), then split or speed up, or change the budget and AGENTS.md together.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each sub-suite prints its own duration in check-all output
- [ ] #2 one run of check-all finishes under the stated budget on main, or AGENTS.md states a new budget with the reason
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 09:07
---
2026-09-30 measurements, all under load from parallel agents, so treat them as upper bounds: check-all took 225-650s across today's runs (CF-84 237s, CF-24.2 515s, the CF-51 refuter 327s). Growth today: CF-84 added the gh matrix (scope contract 74s to about 132s after trimming), CF-80 added 15 board-hook cases, and CF-24.2 added the backfill contract (about 6s) and two board test files. The board stage (bun test) dominates by the refuter's reading. Timing each section on an idle machine is still the first step.
---

created: 2026-09-30 14:26
---
More urgent from 2026-10-01 (CF-24.4). This repo's strict TaskCompleted gate runs check-all with CODER_FLEET_TEST_TIMEOUT=480, and one run took 451 s (with a fresh bun install), with board-hook-contract growing from 61 s to 85 s. Once check-all passes 480 s, every close times out. Measure a normal close; either trim the suite or raise the timeout (the hook's own limit is 600).
---

author: lead
created: 2026-10-06 04:24
---
2026-10-06, the human, in the session, ordered this ahead of the remaining backlog, choosing 'CF-56: suite under two minutes' from the lead's session review. Reason given by the lead: the 8-minute check-all is the tax on every card close (seven closes queued today), every review lane and every refuter baseline. Raised to High.
---

author: lead
created: 2026-10-06 07:02
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-2. Today's measurements for the coder: idle full runs 420-480 s (refuter baselines 423 s and 447 s, a coder's run about 8 min); the gate's 480 s limit killed the CF-24.2 close when it overlapped a review round. Version 0.35.4 assumed, parallel with CF-147 (0.35.2) and CF-146 (0.35.3).

Done: nothing yet; a close still takes eight minutes and dies if anything else runs the suite.
Not done: per-section timing, and the suite under budget or an honest new budget.
---

author: @SubagentStop
created: 2026-10-06 08:11
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Criterion 1: each section of `check-all.sh` now prints its own duration (`label: ok (N.Ns)`) and the run ends with `total:`. This went in alone as `95dad29` "Time every section of check-all.sh (CF-56 criterion 1)", with the idle per-section timings in its body.
- Before (one serial run, 419.8 s total): scope-hook-contract 116.7, board-hook-contract 69.8, steward-checks 67.4, disabled-agents 45.2, board 39.8, agents-command 18.0, board-backfill 14.5, workflow-logic 10.0, handoff-parity 7.1, everything else under 6 s.
- After (final run on `a89e2fb`, exit 0, 110.1 s total; 317 s user, 235 s system): board install 0.0 (skipped), syntax 1.2, check-all-timing 3.7, suite-coverage 0.8, handoff-parity 22.5, handoff-extractor 21.3, board-hook-contract 83.9, scope-hook-contract 100.4, disabled-agents 110.1, agents-command 68.9, fleet-config 0.2, roster-contract 1.5, roster-readme-fixture 3.6, agent-pairs-contract 10.3, lead-rules-contract 0.9, workflow-logic 41.4, runner-gate 14.4, install-home-migration 10.8, instruction-file 0.8, prune-worktrees 6.8, board-backfill 50.2, task-tools 1.2, worktree-base 0.5, requirements-source 3.9, next-column 1.9, board 99.0, glossary 0.1, agent pairs 0.2, versions 0.4. Each section's own time is longer now because they all run at once.
- Other full runs I measured: 159 s with only check-all running sections at once and scope sharded, 129 s once the checker-copy fix was also in, 125 s with a 6-section cap (cap dropped), 113 s with board-hook sharded too, 126 s while the machine was busier.
- Why it stops near 110 s: what limits the suite is how fast this machine can start processes, not how many cores it has. Every section finishes at about the same time whatever its size, running together slows each one two to three times, and system time is about 235 s of the 552 CPU-s. The Little Snitch and Tailscale system extensions on this host probably add cost to every process start.
- `5d37ffc` "Show a missing write-scope checker on a copy of the hooks, not the real tree": `scope-hook-contract.sh` used to move the real `check-write-scope.py` aside, which would race any hook call made in parallel. It now removes it from a copy instead. The new allow case on that copy is the "checker not removed" mutant, and I saw it allow.
- `3437bdc` "Run scope-hook-contract as four shards that split its cases": 593 cases pass in 46 to 49 s, against 117 s in one process. Removing the gate from `clock_pass` as a mutant made the parent report 692 decided of 593 and exit 1, which is the failure the split check exists to catch.
- `8cd74f9` "Move the shard runner into shards.sh for any contract to source": new file `claude/evals/lib/shards.sh`. With 30 shards (one section each), 593 still pass.
- `b1c28ef` "Run board-hook-contract as four shards over no-op hooks": in sections another shard owns, every line still runs, but against no-op hooks and a no-op board. 205 cases pass in 31.9 s, against 70 s. The case names are identical to an unsharded run, and 205 still pass with 21 shards (one section each).
- `5c0d131` "Run check-all's sections at once, printed in order": board `node_modules` are installed once in a "board install" step before anything else starts, each section gets nothing on stdin, and `CHECK_ALL_SERIAL=1` runs them one at a time. I watched three new `check-all-timing.sh` cases fail against the serial script before making the change; they check that sections run at once, print in order, and get no stdin.
- `8105fa5` "Stop each steward-checks mutant at the first case that catches it": 67 s to 59 s.
- `a6e96df` "Move steward-checks to check-slow.sh, which CI runs and the gate does not": adds `claude/evals/lib/check-slow.sh`, a CI step for it in `.github/workflows/checks.yml`, and `claude/evals/lib/suite-coverage.sh`. The coverage check failed before `check-slow.sh` existed, on the three expected counts. `check-slow.sh` passed in 49 s.
- `a89e2fb` "v0.35.4: give check-all a 180-second budget and the gate 360 (CF-56)": the new budget and its reason go in AGENTS.md "Before saying anything works", the `.claude/settings.json` timeout goes from 480 to 360, `claude/coder-fleet/hooks/README.md` and `docs/fleet-design.md` are updated to match, and `plugin.json` and `marketplace.json` are at 0.35.4.
- Pushed branch `cf-56-check-all-budget` and opened https://github.com/rzem-ai/coder-fleet/pull/66. The `node_modules` symlink is gone from the worktree and was never committed.
---

author: lead
created: 2026-10-06 08:15
---
Sub-issue 1 of 1: ready to merge in PR #66, after review. Done still needs: a merge of main and a bump to 0.36.2 (the coder is on it), one review round with a refuter (scripts and the gate's settings are code paths), criteria 1-2 ticked on main, the tag, the close.

Done, on the coder's word: every check-all section prints its duration and the run ends with a total (95dad29, with idle per-section timings in its body). The suite runs its sections at once with the board install done first (5c0d131), scope-hook-contract and board-hook-contract run as four shards each (3437bdc, b1c28ef, via a new shards.sh), steward-checks stops a mutant at the first catching case and moves to a new check-slow.sh that CI runs and the gate does not (8105fa5, a6e96df), with suite-coverage.sh making sure each check runs in exactly one suite. A real race fixed on the way: scope-hook-contract moved the real check-write-scope.py aside and now works on a copy (5d37ffc). Measured: 419.8 s serial before; 110.1 s on the final commit, other full runs 113-159 s; the limit is this machine's process-start rate (235 s of system time in 552 CPU-s), so two minutes is not reachable here. Criterion 2's fallback taken: AGENTS.md states a 180 s budget with the reason, the gate's timeout in .claude/settings.json goes from 480 to 360, and hooks/README.md and fleet-design.md match (a89e2fb). The coder's proposals, held in the lead's handoff: install bun in CI so the board checks run there; cut process starts in enforce-agent-scope.sh and the board hooks, the remaining route to two minutes.
Not done: nothing of this is on main; a close still takes eight minutes until it merges.
---

author: @SubagentStop
created: 2026-10-06 08:18
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Merge commit `d66d9b7` "Merge remote-tracking branch 'origin/main' into cf-56-check-all-budget". Only the two manifests conflicted, and I took main's 0.36.1 there. `check-all.sh`, `hooks/README.md` and `docs/fleet-design.md` merged automatically.
- Version commit `d656528` "v0.36.2: release CF-56 on top of v0.36.1": `plugin.json` and the marketplace entry are at 0.36.2. `git grep 0.35.4` finds nothing outside history and `.boards`.
- `check-all.sh` keeps every `BOARD_TESTS` entry from main, 27 in all including `src/test/mcp-task-ack.test.ts`, inside `check_board`. Main's only change to that file was adding that line.
- `suite-coverage.sh` after the merge: every check runs in exactly one suite, and CI runs both. Main added no new scripts under `claude/evals/lib`.
- One check-all run on the merged tree, timing captured: exit 0, 127.6 s total (332 s user, 267 s system). The board section ran 301 tests across 27 files, up from 291 across 26 before the merge.
- The slowest sections in that run: disabled-agents 127.6, scope-hook-contract 118.7, board 116.9, board-hook-contract 103.2, agents-command 86.7, board-backfill 66.1, workflow-logic 51.7 (seconds).
- I renamed PR #66 to say v0.36.2: https://github.com/rzem-ai/coder-fleet/pull/66. The `node_modules` symlink was removed before the commit.
---

author: @SubagentStop
created: 2026-10-06 08:35
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Cause: CI's ubuntu runner has no bun and no installed board. The shard that owns the live section found no board, took the skipped branch and recorded no cases. The other three shards had swapped in the no-op board, which always answers `--version`, so they walked the section and counted its 21 cases as skipped. The totals disagreed (205 against 184) and the split check refused, as designed.
- Fix (`46d3d47`, "Keep every board-hook shard on the live section's branch when no board resolves", in `claude/evals/lib/board-hook-contract.sh`): a shard that doesn't own the live section now swaps in the no-op board only when the real board resolves. Every shard takes the owner's branch. The split check itself is unchanged.
- Why not your suggestion: treating skipped cases as accounted for would have accepted "184 of 205" with three shards out of step. It would also have let through the `clock_pass` gate mutant, the one I ran against the split check, which it currently catches.
- I reproduced the CI failure on this Mac (bun removed from PATH, empty HOME): 184 of 205, exit 1, the same message as CI.
- New `claude/evals/lib/board-hook-no-bun.sh` recreates that shape on any machine and runs the contract across 4 shards. I watched it fail with the CI message when I put the old line back, and pass on the fix. It's a second full run of the contract, so it lives in `check-slow.sh`, which CI runs. suite-coverage confirms it is in exactly one suite.
- Run: board-hook-contract, no bun, 4 shards: 184 passed, exit 0.
- Run: board-hook-contract, no bun, unsharded: 184 passed, exit 0.
- Run: board-hook-contract, bun present, 4 shards: 205 passed, exit 0.
- Run: board-hook-contract, bun present, `BOARD_HOOK_SHARDS=1`: 205 passed, exit 0, same case names as the sharded run.
- Run: check-all once, 91.2 s total, exit 0.
- Run: check-slow, 73 s (steward-checks 48 s, board-hook-no-bun 25 s), exit 0.
- For the contract's serial run I used `BOARD_HOOK_SHARDS=1`, because `CHECK_ALL_SERIAL=1` only changes how check-all schedules its sections.
- Earlier commits on the branch: merge `d66d9b7` and version `d656528` (v0.36.2). Pushed `d656528..46d3d47` normally; the `node_modules` symlink was removed before committing.
---

author: lead
created: 2026-10-06 08:36
---
Fix round 1 (CI): PR #66's first CI run failed on board-hook-contract alone, with the parallel suite finishing in 32.8 s on ubuntu. Cause, found by the coder: with no bun and no board on the runner, the shard owning the live section took the skipped branch and recorded no cases, while the other three had swapped in the no-op board (which answers --version) and counted the 21 live cases as skipped, so the split check saw 184 against 205 and refused as designed. Fix 46d3d47: a shard swaps in the no-op board only when the real board resolves, so every shard takes the owner's branch; the split check is unchanged, and the lead's looser suggestion (count skips as decided) was rejected because it would also pass the clock_pass gate mutant. New board-hook-no-bun.sh reproduces the runner's shape on any machine, in check-slow.sh. check-all 91.2 s, check-slow 73 s, both exit 0. The branch is at v0.36.2 on top of main. Review round 1 with a refuter launched on 46d3d47; the item's one fix round is spent, so a blocking finding becomes a Polish sub-issue, not another round.
---
<!-- COMMENTS:END -->
