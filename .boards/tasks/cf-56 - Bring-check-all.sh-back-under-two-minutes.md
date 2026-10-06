---
id: CF-56
title: Bring check-all.sh back under two minutes
status: In Progress
assignee: []
created_date: '2026-09-28 04:43'
updated_date: '2026-10-06 07:02'
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
<!-- COMMENTS:END -->
