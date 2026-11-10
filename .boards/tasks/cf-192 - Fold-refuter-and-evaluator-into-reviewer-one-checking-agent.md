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

author: @SubagentStop
created: 2026-11-10 14:26
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. 2 must-fix, 3 low, 2 follow-ups.
- Examined: the full diff `main...e9ca5b1` (70 files), the CF-192 card (state worktree copy), a live subagent transcript's first line, and lead.md and reviewer.md read as prose.
- Criteria: #1 holds (the `evaluator-app` fixture stays on purpose for `coder/prompts/05-long-card.md`). #2 holds. #3 holds: no contract step or `Contract:` comment is left in lead, glossary, review-round or design. #4 holds: a readable review or use brief is never capped, break mode is capped and has tests, and an unreadable brief is capped per the lead's default. #5 holds: main's review-round never had an evaluation lane, and the refutation lane is now a `coder-fleet:reviewer` whose brief line 1 is exactly `Modes: review, break`, pinned by workflow-logic `break-lane-is-a-reviewer`. #6 holds for load and run (disabled-agents-contract lines 570 to 590), but the `/coder-fleet:agents` contract itself is the emptied file. #7: check-all exits 0, but one section is empty. #8 holds: 0.51.0 in plugin.json and marketplace.json. #9: the body and the hook carry it, there is one prose tension (low below), and it hasn't been run live.
- Q1, can a readable review-only brief be capped? No. Only an unread brief, a malformed header or a garbled record caps a non-break run.
- Q2, can break mode lose its cap other than by the recorded forgery? Every route I found is recorded in limits.md: deleting or corrupting the clock file, a named spawn, `--agent reviewer` as the main agent, an unwritable state dir. A header past line 5 makes hook, body and scope agree on review, so the lane fails loudly rather than running uncapped.
- Q3, does the progress-log exception allow more? No. One line of `date [-u] '+<fmt>' >> <abs path>`, with the name matching `<date>-reviewer-<slug>-progress.log`, the directory physically equal to the session project's main-checkout `docs/runs`, no symlink and a regular file; plus `mkdir -p` of exactly that directory. It applies in review mode only, since break and use Bash is already open.
- Q4, is any retired path reachable? No. A refuter or evaluator type is denied every governed tool (enforce-agent-scope.sh line 447). Both names are gone from the SubagentStop matcher, the clock table, the roster and the write-scope roles. review-round logs a stale `disabledAgents` entry and ignores it.
- Q5, would a new test pass with its rule reverted? Yes, the empty agents-command file. Two narrower cases are under low below. The mode, sticky, five-line window, fail-closed, workflow-depth, crafted-repo and retired-type tests would each fail if their rule were reverted.
- Prose: lead.md step 4 routes correctly with no contract step. It names break by its triggers under the build-phase limit, and use mode after the review round and before its fix round, graded against the card's criteria. reviewer.md agrees with the hooks on the header, the default and the malformed case.
- gate: bash claude/evals/lib/check-all.sh - exit 0 - counts printed per section, all 0 failed (scope-hook 890, board-hook 268, workflow-logic 753, disabled-agents 150, board bun 359; agents-command printed none, 0.0s); total 277.1s after a 101s lock wait
- gate: bash claude/evals/lib/scope-hook-contract.sh - exit 0 - 890 passed, 0 failed
- gate: bash claude/evals/lib/board-hook-contract.sh - exit 0 - 268 passed, 0 failed
- gate: bash claude/evals/lib/handoff-parity.sh - exit 0 - counts not printed (32 cases, every verdict ok)
- After the gates, `git status --porcelain --ignored` in the review worktree showed only `!! claude/coder-fleet/board/node_modules/`, which was there before the run. HEAD was still e9ca5b1.
- must fix: claude/evals/lib/agents-command-contract.sh:1 - 4ae5a51 emptied the file to 0 bytes but left it executable, and check-all.sh:387 still runs it, printing `agents-command: ok (0.0s)`. The 68 cases pinning `/coder-fleet:agents` are gone: disable and enable round trips, byte-for-byte refusals, phase toggling. commands/agents.md:12 still says "a contract test pins it", and the commit message says the case was moved to researcher. The human running `/coder-fleet:agents disable researcher` or `phase harden` after a later fleet-agents.sh change has no gate behind it, and the green Done gate hides that.
- must fix: claude/coder-fleet/hooks/enforce-agent-scope.sh:553-559 - in break mode, any command that pairs `cd`, `pushd`, a glob, `$` or `~` with case-folded `state`, `.local` or `coder-fleet` is denied. That catches `cd /tmp/mut && npx vitest run -t "rejects a mismatched state"`, `useState`, `.env.local` and `real-estate`. The deny at line 2356 doesn't name the matched fragment or the pairing. A break-mode review of an OAuth or session change, the one place break runs in the build phase, gets its mutant runs refused without saying why, and hands back under Not done instead of a refutation. limits.md records only the coder-fleet-path case.
- low: claude/coder-fleet/agents/reviewer.md:38 - the invariant forbids creating any file inside the project except memory, while step 2 (line 30) requires appending a progress log under the main checkout's docs/runs. Name the log as the one exception in the invariant.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:538-545 - the write-tool half of `reviewer_protected_denial` is never tested on its own. `check-write-scope.py --outside` refuses the same paths, so deny_write against the modes, clocks and transcripts dirs (scope-hook-contract.sh lines 1782-1785) passes with either half reverted. Likewise `deny_bash reviewer` at line 1795 passes through the review gate allowlist alone.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:546 - review mode now refuses any Bash command naming `.claude/projects`, so grepping a gate's persisted output under `tool-results/` is refused. The Grep and Read tools still work. reviewer.md doesn't say so.
- Memory updated in the main checkout (the worktree path was refused): `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/agent-memory/coder-fleet-reviewer/cf-192-reviewer-modes-settled.md`, an addition to `gate-run-quirks.md`, and the `MEMORY.md` index entry. The lead commits them.
- Run article: above this handoff, for the lead to save as docs/runs/2026-11-11-reviewer-CF-192.md
---
<!-- COMMENTS:END -->
