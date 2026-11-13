---
name: cf-208-review-cap-three
description: CF-208 - three review rounds per change then one question to the human, no Polish card; review-round cap check now precedes the fix hand-back, openFindings on round cap
metadata:
  type: project
---

CF-208 (round 1 reviewed 2026-11-14 at ee9cea94) replaced "one review, one fix, then a Polish sub-issue" with up to three review rounds per change, then one question to the human (AskUserQuestion plus actionsAdd; /drain parks the card). `review-round` moved its `round >= maxRounds` check ahead of the `!autoFix || buildPhase` hand-back, so at the cap the findings come back under `openFindings` and `fixRequest` stays null in every phase. Default maxRounds was already 3 before the change.

**Why:** the human did not want extra cards for leftover findings (14 Nov 2026).

**How to apply:** the cap across separate build-phase runs depends on the lead passing `round`; nothing in the workflow can count rounds across runs. The early `startRound > maxRounds` return carries no `openFindings` key. The OpenCode port still has the old cap, recorded in the divergence register as a deliberate deferral, so don't raise it as a finding. Related: [[cf-193.4-gate-run-settled]], [[lead-procedures-split]].
