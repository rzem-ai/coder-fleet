---
id: CF-193
title: >-
  Review every agent and skill in both ports against what Sonnet 5.5, Opus 5.5
  and Fable 5.2 want, and cut test bloat and other drag
status: In Progress
assignee: []
created_date: '2026-11-11 12:19'
updated_date: '2026-11-11 15:31'
labels: []
dependencies: []
priority: High
type: enhancement
ordinal: 324000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked on 2026-11-11, in the session: "I need you to do a comprehensive review of the agents and skills for the claude and opencode implementations of this plugin. I need for you to research what the latest Sonnet 5.5, Opus 5.5, and Fable 5.2 models want, and then apply this knowledge. I would also like you to ensure that the coding agents do not create excessive tests for TDD as this slows down developemnt unnecessaryily. Anything else I may have missed that will speed up development without cutting too many corners?"

Shape: cited research on the three models, then an audit of every agent body and skill under claude/coder-fleet/ and opencode/coder-fleet/ against it, then the changes applied in both ports. The criteria below are provisional until the audit's findings are in; the apply work is split into sub-issues then, each with its own criteria.

Overlap: CF-192 (fold refuter and evaluator into reviewer) is In Progress and edits the same agent bodies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A cited report says what Sonnet 5.5, Opus 5.5 and Fable 5.2 each want from an agent definition and a skill, every claim carrying its source, and what the sources do not say is marked as such
- [x] #2 An audit lists every agent and skill in the Claude Code plugin and the OpenCode port against that report, each finding naming its file and line and the change it proposes
- [x] #3 The coder and scripter in both ports write only the tests that prove a card's acceptance criteria or pin a bug, and their bodies say what a test must earn to be written
- [x] #4 The audit lists every other change that would speed up a build, each with what it costs in safety, and the human chooses which are applied
- [x] #5 Every finding the human accepts is applied in both ports, each OpenCode artefact still tracing to its Claude Code counterpart, with check-all.sh green
- [ ] #6 The changes ship as a release: version bump in plugin.json and marketplace.json, tagged and pushed
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
created: 2026-11-11 12:23
---
Decisions from the human in the session, 11 Nov 2026, that the builders of this card need:
1. From triage of CF-180 action 1, on how a builder with no browser tools produces the screenshot a design-led UI change needs: "they can use playwright directly". The coder and scripter bodies in both ports say so.
2. "without using the plugin I was able to get a fair amount of work done in the Fathom project, just ask" - pointing at the Fathom session unify-lane-row-model (cwd /Users/alex/Dev/Work/fathom/fathom). The lead asks that session how it worked without the plugin, and its answer is evidence for criterion 4 (what else would speed up a build).
---

author: lead
created: 2026-11-11 12:26
---
Evidence from the Fathom session unify-lane-row-model, 11 Nov 2026, asked at the human's word (its own account, not checked against the Fathom repo). Without the plugin it shipped three pull requests in about five hours (#941, #942, #943; v1.105.0 to v1.107.0), all built in the main session with no subagents, on a branch in the main checkout, with no board card. Tests were mostly written after the code; its rule was that a change to a server rule or a wire gets a test and a pure removal or layout change does not. It ran typechecks, lint, targeted tests, then the full suites once per change, then CI, and checked the UI with Playwright against the running dev app. Nothing reviewed a diff independently.

What it says the plugin would have cost: on a 10 to 60 minute change with the human answering in minutes, the spec, the card criteria, a separate coder starting from a brief, and a review and fix round are each a hand-off, and the hand-offs are a large share of the time; an evaluator would have repeated its own Playwright check.

What it says the absence cost: it shipped a drag-to-reorder without weighing a server rule that refused the move, which the human hit as a toast and which the requirement clause stated plainly; it lifted a data invariant and rewrote the tests in the same diff with nobody else checking; none of the work is on the board. Its own recommendation: keep the independent review and criteria from requirement clauses on a larger change, and drop the spec step and the separate coder for small asks with the human present.
---

author: lead
created: 2026-11-11 12:26
---
Scout inventory, 11 Nov 2026 (facts the audit builds on). Claude Code port: 16 agents; coder is opus at medium effort, scripter sonnet at medium, scout sonnet at low, lead opus at high. OpenCode port: 9 agents, every one on a local Qwen model (trillian/qwen3-coder-next, ui-designer on qwen3.8-27b), with no effort field and no evaluator, scripter, fleet-steward or editors - so what the three Claude models want applies to the Claude Code port directly and to the OpenCode port only where the port is run on a Claude model.

Tests: coder.md:32 and scripter.md:32 say "Test-first, always: a failing test first, then the smallest change that passes it", coder.md:49 "Never mark a test passing that you have not watched fail", and the handoff asks "for each test you added, the change that makes it fail" (coder.md:55). The OpenCode coder says the same (coder.md:104, :120). No instruction anywhere limits how many tests are written.

Repeated suite runs on one change: the builder (coder.md:34), review-round's tests and types-and-build lanes (review-round.js:1221-1242), the reviewer's own gate run (reviewer.md:31), the refuter's baseline (lead.md:32), and the TaskCompleted close (hooks.json:55-62) - up to five runs of the same suite.

Style: no capitalised emphasis anywhere, but lead.md carries 60 uses of "never" and its steps 3, 4 and 5 are single paragraphs of 1170, 1238 and 1297 words. spec-writer.md preloads a `brainstorming` skill that has no directory in the plugin.

CF-192's branch (unpushed fix round pending) changes lead.md, reviewer.md, deletes refuter.md and evaluator.md, and touches the glossary, looping and run-article skills; nothing under opencode/.
---

author: lead
created: 2026-11-11 12:26
---
Proposed by the lead, not filed (spotted during triage): `instruction-file-contract.sh` scans git-ignored run articles under docs/runs/ in the main checkout, so a run article that mentions CLAUDE.md turns the suite red locally and refuses every card close, while CI stays green. The check could skip ignored paths.
---

author: lead
created: 2026-11-11 12:34
---
Sub-issue 1 of 1: started (research in, audit running). Done still needs: criteria 2 to 6.

Criterion 1 ticked on evidence: the researcher's cited report is saved at docs/runs/2026-11-11-researcher-CF-193.md (6450 words, every claim sourced to the bundled migration and prompt-audit guides or a live Anthropic, Claude Code or OpenCode page, with what the sources do not say marked per model). Not independently reviewed; the audit agents read it against the sources as they use it.

What it found that shapes the audit: all three models default to medium effort in Claude Code, and a subagent on a different model from the lead does not inherit the lead's level; Sonnet 5.5 adds unrequested tests, docs and files at every effort level and Anthropic publishes a stop-and-report line for it; Fable 5.1's guidance, which 5.2 builds on, says commit tests only where the task asks or the repo already keeps tests for that kind of change, roughly one focused test per stated behaviour; prompts written as long prescriptive step lists reduce output quality on Fable and are flagged as dated for all current models, while reasons, exact scripts for fragile operations and prohibitions against demonstrated failures are on the keep list; absolute 'never' rules work better rewritten with their scope and reason; Opus 5.5 at low effort solves about what Sonnet 5.5 does at high for similar cost, and Fable as orchestrator cost 19% more than Opus 5.5 for similar scores.

Proposed by the researcher (not filed): decide which agents get an explicit effort and model; add the live-only Sonnet 5.5 and Opus 5.5 snippets to the audit's reference set (done: they are in the article); check OpenCode's catalog variant names before the port translates effort.

Done for the human: a cited report on what the three models want exists as a file. Not done: nothing in the plugin has changed yet.
---

author: lead
created: 2026-11-11 12:44
---
Audit in, 11 Nov 2026. Criterion 2 ticked on evidence: three audits, each finding with file, line and proposed change, saved (git-ignored) as docs/runs/2026-11-11-audit-agents-CF-193.md (agent definitions, both ports), docs/runs/2026-11-11-audit-skills-CF-193.md (skills, workflow prompts, commands) and docs/runs/2026-11-11-audit-pipeline-CF-193.md (where a build's time goes, a replacement test policy, ranked speed-ups). Criterion 4's list exists in the pipeline audit; it is ticked once the human has chosen.

Headlines. The wording of the bodies and skills is already clean of old-model habits (no capitals, hedges, think-harder prose); the problems are structure, preload cost, stale facts and pipeline repetition.
- Pipeline, measured on 7 cards: median 32 minutes from order to a ready pull request; the builder is about 4 minutes of it and review rounds 66 to 84%; an item with one fix round runs the full suite about 7 times behind one machine-wide lock; the human's merge then waits a median 1.6 hours.
- Test policy: a strict replacement for 'test-first, always' (test-first only for a bug fix or a rule change, about one test per criterion, none for prose, config, renames, removals or layout, every kept test seen failing with the change reverted) and a lighter one; the audit recommends strict.
- Agents: lead.md steps 3 to 5 are 1066 to 1298 words on one line each, forced by roster-contract.sh's 60-line cap and requirements-source-contract.sh's six-step rule; spec-writer's body tells a subagent to run an interview it has no tool for; fleet-steward is told to edit generated files; scripter (Sonnet) lacks a stop-and-report line.
- Skills: run-article is preloaded into five agents and looping into two that do not use them; help-boards is 5072 words with about 3000 of mechanism; spec-writer preloads a `brainstorming` skill that resolves nowhere; migration-checklist is stale for these models and its check 10 adds the numeric caps current guidance removes.

Proposed by the audits, not filed: make the TaskCompleted gate check the card before running the suite and run in the main checkout (board-task-completed.sh:69, :103, :234); fix the stale refuter line in the handoff example (handoff SKILL.md:89), which CF-192 does not cover. Open card CF-172 already covers one suite run per review round.

Done for the human: the review exists as four files and its choices are being put to him. Not done: no agent, skill or workflow has changed.
---

author: lead
created: 2026-11-11 13:06
---
Decisions from the human, 12 Nov 2026, in the session (AskUserQuestion), which also tick criterion 4 (the audit listed the speed-ups with their costs and he chose):
1. Test policy: "Lighter". A bug fix gets one test that reproduces the bug, written first and watched failing. A change to a rule, a guard, a hook's decision, a schema or a wire format gets one test that pins it, before or after the code. Anything else, prose, config, renames, removals and layout included, gets no new test unless a criterion asks for one. Scratch checks are not committed. Narrowest tests while working, the full suite once at the end. Invariant: never commit a bug-fix test you have not watched fail. Handoff: for each test added, the criterion or bug it pins, and for a bug-fix test the edit that makes it fail. Reviewer: checks only that bug fixes and rule changes carry a test; any other test is at most Low. (Text from docs/runs/2026-11-11-audit-pipeline-CF-193.md, 'Lighter variant'.)
2. Speed-ups: "One suite run per round, Narrow second round, Lead merges when green". Not chosen: the card close checking the card and CI instead of rerunning the suite, so the close gate stays as it is.
3. Prompts: "Restructure the lead, Cut preloads, Add model-specific text, Effort changes" - all four, with the plain defects fixed regardless.
4. Order: "Both at once". Changes that do not touch lead.md, reviewer.md or review-round.js start now on main; the rest stack on CF-192's branch, whose outstanding fix round runs now.

Lead defaults, not asked: the audit's lower-ranked options (the reviewer running only the whole-suite gate, the lead building small prose changes itself, trimming the lead's card comments) are applied only where the lead restructure touches them anyway; the rest stay proposals in the pipeline audit. The release bump and tag stay the human's, as his 'Lead merges when green' answer keeps them.

Split into five sub-issues: .1 builders (test policy, scripter tuning, Shipping line), .2 spec-writer, fleet-steward and editors, .3 skills, .4 review-round and reviewer (stacked on CF-192), .5 the lead (stacked on .4).
---

author: lead
created: 2026-11-11 13:13
---
Order from the human, 12 Nov 2026, in the session: "once you have finished all the cards In Progress and those in Next, can you commit, push, open a PR, merge it, and tag with a new version number". This is his go on every card In Progress and in Next, and his grant, for this release, of the merge, the version bump and the tag, which the repo's AGENTS.md otherwise keeps for him. The lead's reading: each card's own pull request is merged once its review approved and CI is green; when the last one is in, one release pull request bumps plugin.json and marketplace.json (the next minor, since the changes are ones a person sees), is merged, the annotated tag goes on the bump commit CI proved and is pushed, and the board is flushed, as AGENTS.md's Releasing section says. In Progress at the time of the order: CF-179, CF-183, CF-183.2, CF-183.2.1, CF-192, CF-193 and its sub-issues, CF-194. Next was read at the same time.
---

author: lead
created: 2026-11-11 13:24
---
Orders from the human, 12 Nov 2026, in the session. After merging PR #140 himself: "any further PRs you are to merge yourself." Then: "I'm going to bed now, so please have all this done by the time I awake - that means you do the merging of the PRs". The lead runs the rest unattended: each card's review, at most one fix round, its pull request, the merge once the review approved and CI is green, then the release he ordered (bump, merge, tag, flush). Questions that only the human can answer go on the card as Actions for Human and the card is parked rather than guessed at. If Claude Code's classifier refuses a merge again, as it did on #140, the pull request is left green and ready and the refusal is reported.
---

author: lead
created: 2026-11-11 15:31
---
Sub-issue 5 of 5: merged to main at bcec78a (PR #147). All five sub-issues are on main: CF-193.1 at 49a00df (#141), CF-193.2 at faff9f4 (#142), CF-193.3 at aa969fd (#143), CF-193.4 at 250b4ab (#146), CF-193.5 at bcec78a (#147). Done still needs: criterion 6, the release the human ordered (version bump, tag, push, flush).

Ticked on evidence: criterion 3 (coder.md and scripter.md carry the lighter policy the human chose and say what earns a test - one for a bug fix, written first and watched failing; one for a changed rule, guard, hook decision, schema or wire format; none for prose, config, renames, removals or layout - and the OpenCode coder says the same; CF-193.1's review found the text matching his decision word for word), 5 (every finding the human accepted is applied: the lighter test policy, one suite run per round, the narrow second round, the lead merging when green, the lead restructure, the preload cuts, the model-specific text and the effort changes, plus the plain defects; each sub-issue's review and CI are on its card, and each OpenCode artefact either mirrors its source or has a register row saying why not).

Not applied, as the human chose: the card close checking the card and CI instead of rerunning the suite. Not applied to the port: the lead-procedures skill, which the port cannot preload for one agent.

For the human, left unmeasured or undecided across the sub-issues: no smoke eval was run on any changed agent, so the coder, scripter and spec-writer baselines need re-running and the lead's behaviour after the restructure is untested; Playwright from a builder's worktree is not proven by a run; reviewer.md's three-must-fix cap and humanize's per-piece caps each want a reason or removal.

Done: on main, the fleet's agents and skills are reviewed against the three models and changed where he chose. Not done: not released.
---
<!-- COMMENTS:END -->
