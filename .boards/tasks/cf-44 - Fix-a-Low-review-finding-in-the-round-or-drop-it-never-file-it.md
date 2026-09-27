---
id: CF-44
title: 'Fix a Low review finding in the round or drop it, never file it'
status: In Progress
assignee: []
created_date: '2026-09-27 06:59'
updated_date: '2026-09-27 09:44'
labels: []
dependencies:
  - CF-31
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/7'
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/agents/reviewer.md
  - claude/coder-fleet/agents/refuter.md
  - docs/plans/CF-44.md
priority: Medium
type: enhancement
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#7, part (c) (read as data). CF-31 (PR #6) covers parts (a) and (b): must-fix findings are `must fix:` Done bullets and Blocker: is a question only the human can answer. It does not say what happens to a Low finding: test hygiene, a misnamed test, a stale comment, a value nobody has confirmed. The issue proposes the handoff skill, reviewer.md and refuter.md say it is fixed in the current round or dropped, never filed as a Blocker or a Propose item. Fathom's .claude/rules/review-findings.md (commit c6dd6c2) is named as a draft. Builds on CF-31.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The handoff skill defines Low and its low: bullet; its example matches the fixture, and handoff-parity.sh failed first
- [ ] #2 reviewer.md, refuter.md, lead.md and board-conventions state the rule, and no body says to file a Low finding; line counts are unchanged
- [ ] #3 review-round hands Low findings to a fix round that is running anyway and drops them otherwise; Low never widens gateFix and never starts a round; the six new workflow-logic.mjs cases failed first and now pass
- [ ] #4 The reviewer and refuter rubrics grade the rule; the migration-checklist table is in the PR; check-all passes, run once
- [ ] #5 The patch bump is the last commit; after merge: tagged and pushed, and CF-34 has its comment
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-44.md approved by the human 2026-09-27, every open question on the recommended answer. Criteria replaced by the plan's Done when. Build waits for PR #6 (CF-31) to merge; branch cut from origin/main then.
---

author: @SubagentStop
created: 2026-09-27 09:36
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-44-low-findings` cut from freshly fetched `origin/main` (da81f28, v0.27.1) in worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abe3f002efb6751a3`. `--unset-upstream` applied and `status --branch` shows no upstream. `git rev-parse --git-common-dir` pointed at the main repo's `.git` from a linked worktree, which is correct.
- 9b1a239 "Add the approved CF-44 plan": `docs/plans/CF-44.md`, `cmp` identical to the main checkout's copy.
- Red run: `node claude/evals/lib/workflow-logic.mjs` exited 1 with 178 passed and 6 failed, exactly the six new cases.
- Red, `low-rides-the-fix-round`: the fix prompt had no Low heading, and there was no `fixes[0].low` or `dropped`.
- Red, `low-alone-commissions-nobody`: `dropped` was absent and `followUps` held the Low finding.
- Red, `low-does-not-widen-the-gate`: there was no `fixRequest.low`, the Low finding was in `followUps`, and `dropped` was absent.
- Red, `low-read-strictly`: `dropped` was absent.
- Red, `blocking-outranks-low`: `fixes[0].low` and `dropped` were both absent.
- Red, `verdict-prompt-asks-for-low`: the verdict prompt had no `low` sentence.
- Red run: `bash claude/evals/lib/handoff-parity.sh` exited 1 on "The skill example ... and valid-review-finding-not-blocker.txt differ". The fixture still read `valid valid valid ok`.
- Mutation run (`scratchpad/cf-44/mutate.sh`, file restored and `cmp` confirmed) covering the parts of three cases that already passed before the change: all 7 mutations were killed, each with exit 1.
- Mutation: the gate reads `blocking.concat(low)` -> killed by `low-does-not-widen-the-gate`.
- Mutation: `isLow` uses `Boolean` instead of `saysYes` -> killed by `low-read-strictly`.
- Mutation: `isLow` tests `low !== false` -> killed by `low-rides-the-fix-round` and `low-read-strictly`.
- Mutation: `isLow` ignores blocking -> killed by `blocking-outranks-low`.
- Mutation: `dropped` always set -> killed by `low-does-not-widen-the-gate`.
- Mutation: the `fixRequest.low` line deleted -> killed by `low-does-not-widen-the-gate`.
- Mutation: the context list keeps Low findings -> killed by `low-rides-the-fix-round`.
- 11474b0 "Hand a Low review finding to a fix run already happening, or drop it" changes `claude/coder-fleet/workflows/review-round.js` and `claude/evals/lib/workflow-logic.mjs`. The six tests are their own section, placed just before the cross-workflow block. Green: exit 0, 184 passed, 0 failed.
- d4597ff "Define a Low finding as a low: Done bullet, fixed in the round or dropped" changes the handoff skill (:44, the example, :99), the fixture, reviewer.md :31 and :42, refuter.md :48, lead.md :48 and board-conventions :21. Green: `handoff-parity.sh` exit 0, "matches ... byte for byte".
- c5c55b1 "Grade the Low rule in the reviewer and refuter rubrics and name it in the design" changes RV04c, ALLd, RF01c (now wants `survived:`, per open question 2), `docs/agent-contract.md:62` and `docs/fleet-design.md:57`.
- `bash claude/evals/lib/check-all.sh > scratchpad/cf-44/check-all.txt 2>&1` ran once and exited 0. The grep shows every sub-suite at 0 failed and "Every deterministic check passes." on line 364.
- Nothing was pushed, the version was not bumped, and the worktree is clean.
---

author: @SubagentStop
created: 2026-09-27 09:44
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups; no must-fix finding.
- Examined `git diff origin/main...HEAD` (9b1a239..c5c55b1) in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abe3f002efb6751a3`, against `docs/plans/CF-44.md` and its Done when.
- Read `review-round.js` around `gateFix`, `unresolvedFrom`, `survivorsOf`, every place that sets `fixRequest`, `NEXT_STEP` and the result shape.
- Checked each of the six new cases against origin/main.
- Checked line counts (42/48/48), the dash scan, the rubric changes against prompts 04 and 01, and the baselines (null).
- low: claude/coder-fleet/workflows/review-round.js:1177 - the `fix handoff required` next step (and `no approved plan` at :1183) never names `fixRequest.low`, so a lead building the coder prompt from `fixRequest.findings` quietly drops the Low findings.
- low: claude/coder-fleet/workflows/review-round.js:1160 - on a `refuted` stop the verdict's Low findings go to `dropped` although `NEXT_STEP.refuted` commissions a test fix; the comment at :1156-1158 says no fix run follows, which is wrong for that stop.
- low: claude/evals/lib/workflow-logic.mjs:1227 - no case pins `unresolvedFrom` to blocking only (the mutation `blocking.concat(low)` at review-round.js:1104 looks like it survives), and `fixRequest.low` is asserted only on the `unverified fix` path, not the default path.
- low: claude/coder-fleet/workflows/review-round.js:1137 - the fix prompt opens "Fix these and nothing else" and then adds a Low section saying "fix these in this run too".
---
<!-- COMMENTS:END -->
