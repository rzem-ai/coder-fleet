---
id: CF-192
title: 'Fold refuter and evaluator into reviewer, one checking agent'
status: In Progress
assignee: []
created_date: '2026-11-10 13:15'
updated_date: '2026-11-10 14:26'
labels: []
dependencies: []
priority: High
type: enhancement
ordinal: 322000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-11-11: "ther is a reviewer agent, a refuter agent, and an evaluator agent - it is too much. fold into one"

Decisions the human gave in the session (AskUserQuestion, 2026-11-11):
- Name: keep `reviewer`; `refuter` and `evaluator` go.
- Shape: one agent, one body; the lead's brief picks which modes a spawn runs (review the diff and run the gates always; break the change; use the running product).
- Mutation testing: kept only for authentication and credential paths and the harden phase, as today's build-phase rule already does.
- Contract: dropped. No contract-before-build step; the product check grades straight against the card's acceptance criteria.

Names reach 79 files across both ports, including agent-clock.sh, enforce-agent-scope.sh, the disabledAgents switch, the build/harden phase rule, review-round's lanes, the glossary, evals and fixtures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Claude Code plugin ships one checking agent, `reviewer`; the `refuter` and `evaluator` definitions, evals and fixtures are gone, and the roster (claude/README.md table, SubagentStop matcher, evals, docs/fleet-design.md) agrees on the smaller fleet
- [ ] #2 The reviewer body has modes the lead's brief selects: review (read the diff, run the declared gates read-only) on every spawn; break (mutation testing) only on an authentication or credential path, or in the harden phase; use (run the product against the card's acceptance criteria) where AGENTS.md has an App start: line
- [ ] #3 No contract step remains: the lead, glossary, review-round and docs carry no `Contract: <n> checks` comment or contract-mode spawn, and a product check grades against the card's acceptance criteria
- [ ] #4 A break-mode reviewer run keeps a hard wall-clock cap enforced by a hook, with a contract test for it, and review-mode runs are not capped by it
- [ ] #5 review-round spawns the merged reviewer instead of separate refutation and evaluation lanes, and its workflow logic tests pass
- [ ] #6 A project whose .claude/coder-fleet.json lists refuter or evaluator under disabledAgents still loads and runs without error, and /coder-fleet:agents offers neither name
- [ ] #7 bash claude/evals/lib/check-all.sh passes, and the migration-checklist skill has been run over every changed agent body and skill
- [ ] #8 The release bumps the version in plugin.json and marketplace.json
- [ ] #9 The reviewer records how long each step takes: as each step (each gate, each mutant, each acceptance criterion checked in use mode) starts and finishes, it appends a timestamped line to a progress log under docs/runs/ in the main checkout, so a long run shows which step it is on; its handoff ends Done with a per-step duration summary
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
author: lead
created: 2026-11-10 13:16
---
Sub-issue 1 of 2: started. Done still needs: criteria 1-8, and CF-192.1 (OpenCode port).

Done: nothing yet - the human can't see any change.
Not done: the plugin still ships reviewer, refuter and evaluator as three agents. A coder is building the fold on the Claude Code side; the OpenCode port follows in CF-192.1 once that merges.

Lead defaults the coder needs that no criterion says: the lead's own body (claude/coder-fleet/agents/lead.md) is rewritten to route to the one reviewer; `disabledAgents` entries naming refuter or evaluator are ignored quietly rather than erroring; disabling `reviewer` is not offered, since every change needs an independent gate run.
---

author: lead
created: 2026-11-10 13:31
---
Security review findings on the in-progress branch, passed to the coder mid-run. The lead's default: the break-mode clock fails closed when the brief can't be read; the mode is recorded once at clock start and never re-read; the mode signal comes only from a fixed header in the spawn prompt, or from hook-owned state written at spawn time, never from a free-text match anywhere in the transcript.

Done: nothing merged; the plugin still ships three checking agents.
Not done: the fold itself, still with the coder.
---

author: lead
created: 2026-11-10 13:43
---
The human, 2026-11-11: "the new combined reviewer agent needs to record somewhere how long each step takes - namely when testing the criteria it has in the past taken a very long time and it looks like it is doing nothing"

Added as criterion 9. The lead's default for 'somewhere': a progress log appended live under docs/runs/ (git-ignored, so it is never committed), plus a duration summary in the handoff. Criterion checks in use mode are the case that matters most.

Done: nothing merged.
Not done: the fold and the timing log, both with the coder.
---

author: lead
created: 2026-11-10 13:44
---
The human, 2026-11-11, on the self-forged mode record: "I think I have come across that third finding - very annoying". The human may have seen it in practice, so a capped agent outliving its clock is a real failure, not a theoretical one. The fix must come with a contract test that fails on today's code.
---

author: lead
created: 2026-11-10 13:55
---
A third security review flagged the mode record again. The lead's default, sent to the coder: anchor the progress-log exception to the trusted project instead of cwd; compare protected paths case-insensitively on APFS; make the mode decision fail closed (a missing or garbled record means break mode, with the cap); deny the obvious Bash routes round the state directory. The residual gap goes in docs/limits.md: a same-user agent can still forge a well-formed record, which no hook running as the same user can prevent. No further security review rounds on this one record; anything left open is decided at the reviewer's review.

Done: nothing merged.
Not done: the fold, the timing log and these fixes, all with the coder.
---

author: lead
created: 2026-11-10 14:14
---
Coder handoff, 2026-11-11: branch cf-192-fold-refuter-and-evaluator-into-reviewer, nine commits ending e9ca5b1 (v0.51.0), check-all green at the head (exit 0, 37 sections).

Proposed by the coder (not filed; the human decides):
- Reword this repo's Definition of Done default (.boards/config.yml and board/src/test/dod-defaults-config.test.ts) from 'a refuter round ran' to the break-mode reviewer, with no disabled-refuter clause. Until then, CF-192's own DoD item 2 reads stale.
- Give the reviewer's smoke eval a break prompt and a use prompt, swapping out two of its five.
- Run the live probe in hooks README item 20 with a 'Modes: review, break' brief, to confirm the cap and the transcript timing end to end.

The lead's default on the tension the coder raised: a review-only run is capped only when its brief can't be read or is malformed. Any review run with a readable brief is uncapped, so criterion 4 holds as written. Fail-closed on an unreadable brief stays, because the alternative is the uncapped run the human has already been bitten by.

Done: the fold is built and the suite passes on the branch.
Not done: independent review (deeper, plus a second round, because the hooks are the fleet's authorisation layer); push and PR; CF-192.1 port.
---

author: lead
created: 2026-11-10 14:26
---
Refuter round on e9ca5b1, 2026-11-11: baseline check-all exit 0; 8 mutants, 2 killed, 6 survived.

For the fix round:
- survived: header window size not pinned. Nothing tests a Modes: line on brief lines 3 to 6, so shrinking the window to 2 reads a line-4 'Modes: review, break' as review, uncapped.
- survived: break-over-use precedence in enforce-agent-scope.sh has no scope test (only the clock tests 'Modes: review, break, use').
- survived: the column-0 anchor is unpinned. An indented '  Modes: review, break' should fail closed, and no test covers it; the existing near-miss also has the wrong case.
- low (rides the fix round): progress-log symlink check untested; log-path-is-a-directory check untested; dead direct-path branch in reviewer-modes.sh.
- usability: the session scratchpad path contains 'coder-fleet', so a break-mode reviewer is refused cd plus a script there by the indirect-path rule. docs/limits.md covers the repo path, not the scratchpad.

Done: the fold is built; the suite passes; three real test gaps found.
Not done: reviewer verdict (running), then one fix round.
---
<!-- COMMENTS:END -->
