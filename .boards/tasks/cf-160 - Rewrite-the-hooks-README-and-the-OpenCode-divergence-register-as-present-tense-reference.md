---
id: CF-160
title: >-
  Rewrite the hooks README and the OpenCode divergence register as present-tense
  reference
status: In Progress
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-18 13:42'
labels: []
dependencies: []
type: docs
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word, 2026-10-18, following CF-158's rule that live docs carry no history. claude/coder-fleet/hooks/README.md items 16 to 27 and opencode/docs/divergence-register.md still read partly as a change log.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claude/coder-fleet/hooks/README.md states what each hook does now, with no dated anecdotes, CF citations or 'was / used to' history
- [ ] #2 opencode/docs/divergence-register.md rows state the current divergence and its reason only
- [ ] #3 A reason that materially matters moves to a doc under docs/decisions/ and is linked
- [ ] #4 bash claude/evals/lib/check-all.sh passes
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
created: 2026-10-18 13:09
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-4.

Done: nothing yet; a coder is rewriting claude/coder-fleet/hooks/README.md and opencode/docs/divergence-register.md as present-tense reference. Not done: both still read partly as a change log.
---

created: 2026-10-18 13:29
---
Sub-issue 1 of 1: ready to merge in PR #103, pending review. Done still needs: criteria 1-4 proven on main, review.

Done (coder's word): hooks README items keep their numbers and state each hook as it is now; observed behaviour is stated with its probe, not its date; drifted facts corrected (gate timeout 480, matcher covers every fleet agent but the lead, line references replaced by function names). Register rows state the current divergence and reason only; the 2.x tables keep their facts. New docs/decisions/denial-tests-name-the-denial.md carries the one reason the history held. check-all exit 0 (282.5 s). Not done: review; merge.
---

created: 2026-10-18 13:38
---
Review round 1 on PR #103 (0f3278c): request changes. Done: the drifted-fact corrections check out against the code (gate timeout 480, matcher covers 15 of 16 agents, transcript_final_block, prefix stripping, item 18's observation, title hook, skills/board row, scout ruleset, item numbers unchanged and every reference still resolves); no reason lost. Not done: hooks/README.md:626 says the gate never reads stop_hook_active, which the hook does read (false on main too); register line 111 misdescribes rulesets.test.ts. Reviewer's suite run: exit 1, board-hook-contract 12 live-backend cases failed in a 370 s run under load, every other section ok; unsettled until a rerun. Fix round 1 sent: those two, item 24's 'the human accepts', older register wording (migration-checklist deferral, lead 'not ported', 'Plan decision'), the hooks.json 'was never sufficient', and stating the probe-worker observation without the inferred cause.
---

author: @SubagentStop
created: 2026-10-18 13:42
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes, for one false clause in the hooks README. The red suite run is an intermittent failure, settled by a passing rerun.
- Examined: the PR #103 diff (hooks README, divergence register, new decisions doc) against CF-160 criteria 1-4, plus hooks.json, board-subagent-stop.sh, agent-clock.sh, enforce-agent-scope.sh, fleet.ts, scout.md, rulesets.test.ts, scope.test.ts, help-boards SKILL.md, claude-code-behaviours.md and limits.md.
- gate: bash claude/evals/lib/check-all.sh - exit 1 - board-hook-contract 253 passed, 12 failed (live backend); every other section ok
- gate: bash claude/evals/lib/board-hook-contract.sh (rerun) - exit 0 - 265 passed, 0 failed
- must fix: claude/coder-fleet/hooks/README.md:626 - says the gate never reads `stop_hook_active`; board-subagent-stop.sh:297 and :538 read it, and item 27 says so
- low: opencode/docs/divergence-register.md:111 - wrong mechanism for rulesets.test.ts (`opencode serve` plus `opencode api` agent.list, not `opencode debug agent`)
- low: claude/coder-fleet/hooks/README.md:647 - item 24 no longer says the human made the call on the late-lane start move
- Intermittent failure: board-hook-contract live section, run 1 exit 1 (12 failed) and run 2 exit 0 (0 failed) on 0f3278c.
- git status --porcelain --ignored after the runs: only `claude/coder-fleet/board/node_modules/`, which was there before the runs started.
---
<!-- COMMENTS:END -->
