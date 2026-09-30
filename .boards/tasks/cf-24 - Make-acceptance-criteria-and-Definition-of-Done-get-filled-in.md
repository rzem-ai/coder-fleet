---
id: CF-24
title: Make acceptance criteria and Definition of Done get filled in
status: To Do
assignee: []
created_date: '2026-09-27 03:08'
updated_date: '2026-09-30 14:02'
labels: []
dependencies:
  - CF-20
references:
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/hooks/board-task-completed.sh
  - docs/specs/CF-24.md
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - 'https://github.com/rzem-ai/coder-fleet/issues/11'
priority: High
type: feature
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-09-27: "Acceptance Criteria and Definition of Done never appear to be filled in by the agents."

Cause, as the lead sees it: nobody owns either field. Most fleet agents have no board tools (design section 7 scopes the board server to spec-writer, fleet-steward and the lead), board-conventions says who writes columns but not who ticks acceptance criteria, and no project Definition of Done defaults exist, so every item is created with none. The only acceptance criteria ever ticked were CF-8's and CF-6's, by the lead by hand after merge (2026-09-27).

Needs a spec: who ticks an acceptance criterion and on what evidence (the lead after verification, an agent's handoff naming criteria met, a hook reading such a line, or TaskCompleted); what the project's default Definition of Done is and who checks it; whether items created by the lead or steward must carry acceptance criteria; how this interacts with columns being hook-owned (ticking a criterion is a field edit, not a column write).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 (was #1; folds CF-72) fleet-design.md section 7, board-conventions, lead.md and agent-contract.md say only the lead ticks an acceptance criterion or Definition of Done item, only with evidence (a criterion proven on main), naming it in a comment, and a tick is a field edit, never a column write; agent-contract.md:80 adds DoD ticks and edits and provisional-criteria replacement; lead.md judges done on criteria and DoD; no sentence says an agent makes no board write
- [ ] #2 (was #4) lead.md step 5 gives the first line of its comment at each sub-issue start and merge to main: Sub-issue <n> of <m>: <started | merged to main at <sha>>. Done still needs: <criteria numbers or sub-issues>. An unsplit item is sub-issue 1 of 1 (Q6 revised)
- [ ] #3 (was #6) On a passing test gate for a [board:<id>] task, TaskCompleted moves the item to Done only with at least one criterion and every criterion and DoD item ticked; otherwise to Blocked with a comment listing each unticked item (or saying there are no criteria), exit 2. board-hook-contract.sh cases fail first: unticked criterion, unticked DoD item, no criteria; all-ticked reaches Done; a failing test gate still wins
- [ ] #4 (was #7) When TaskCompleted cannot read the criteria or DoD it follows CODER_FLEET_TEST_GATE: strict refuses with a could-not-read comment, lenient passes and logs; one dry-run contract case per mode
- [ ] #5 (was #8) hooks/README.md and docs/limits.md state #3's limits: it runs only when a [board:<id>] task is completed with TaskUpdate (CLAUDE_CODE_ENABLE_TODO_TOOLS, CF-20), and it cannot see the human moving a card to Done in the web UI; the README states #4 beside the CODER_FLEET_TEST_GATE description
- [ ] #6 (was #9) With the config requiring criteria, creating an item with none is refused on the CLI, MCP task_create (as a tool error) and web UI paths, with a message naming the key; unchanged when the key is absent or off; fork tests fail first
- [ ] #7 (was #10) This repo's .boards/config.yml and templates/board.config.yml switch the require-criteria key on; the template says how to turn it off, and /init step 2b says it is on and where to change it
- [ ] #8 (was #11) fleet-steward.md requires criteria on every item it files, stating what closing it means; the steward smoke eval checks for them; migration-checklist findings are in the PR
- [ ] #9 (was #12; CF-53) lead.md: an item filed ahead of its spec carries provisional criteria, replaced at sign-off by one card criterion per spec criterion, same number; with a requirements source and no spec (CF-53), by the clauses it answers, in clause order; added criteria follow after; a revised spec means rewriting the list; board-conventions:115 adds that the spec wins on wording
- [ ] #10 (was #13; folds CF-71) This repo's .boards/config.yml carries the six-item default DoD (Q5 revised, no plan in it), and a new item carries it, proven by a fork test or board contract case written red first
- [ ] #11 (was #14; folds CF-71) templates/board.config.yml carries a generic default DoD with no plan in it, so /init gives a new project one; /init step 2b says it is there and how to change it
- [ ] #12 (was #15) After a one-time backfill every item not in Done or .boards/completed/ carries the default DoD, every open item without criteria carries provisional ones (Q14), and every closed item's file is byte-identical
- [ ] #13 (was #16) board-conventions and lead.md say Implementation Notes is the human's field and the lead's sub-issue comments (#2) are the progress record
- [ ] #14 (was #18) check-all.sh passes, new fork tests are in BOARD_TESTS, the PR records a local bun test run until CF-29, and the version is bumped in both manifests, tagged and pushed (CF-28)
- [ ] #15 (was #19) The OpenCode divergence register has a Deferred row for this item with the board, and the Codex docs carry a note
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
author: @SubagentStop
created: 2026-09-27 03:14
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Drafted `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-24.md`: problem, what the repo offers today, non-goals, 11 acceptance criteria, the contract tests that change, overlap with in-flight work, and questions Q1 to Q12.
- Drafted `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-25.md`: problem, what the board fork can show today, non-goals, 11 acceptance criteria, the contract tests that change, overlap with in-flight work, and questions Q1 to Q11.
- Checked against the repo: every agent's tools line; the lead's board tools; `board.sh` making only status and comment writes; the CLI having no Definition of Done flag; the fork applying Definition of Done defaults only when an item is created; the order sections render in each view; and `check-all.sh` skipping the board tests when bun is missing.
---

author: @lead
created: 2026-09-27 03:18
---
Draft spec at docs/specs/CF-24.md with GitHub issue #3 points 3 and 4 folded in (the lead keeps the card current at plan approval, phase start and merge, and when a criterion is proven). Awaiting the human's interview. Related: CF-26 and CF-27 (issue #3 points 5 and 6).
---

author: @SubagentStop
created: 2026-09-27 04:18
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Rewrote `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-24.md` with the interview decisions.
- Read CF-28 and used it for the Definition of Done release item.
- Read CF-9's amended `agent-contract.md:80` in its worktree.
- Checked that MCP `task_create` requires only `title` (`schema-generators.ts:271`).
---

author: @lead
created: 2026-09-27 05:50
---
All interview questions answered 2026-09-27; docs/specs/CF-24.md is awaiting the human's edit and approval (19 criteria). Check the two [lead's reading] lines (Q4 never without criteria, Q7 the plan wins) and Q17's [lead's default] numbering first. On approval the lead files the spec's 19 criteria on this card, one line each, same numbers.
---

author: @lead
created: 2026-09-27 09:27
---
Spec docs/specs/CF-24.md approved by the human 2026-09-27. Criteria filed from the spec, one per spec criterion with the same numbers (the rule this item introduces); #1 and #6 shortened to fit a card line, the spec's wording wins. Planning next.
---

author: lead
created: 2026-09-28 01:38
---
Triage 2026-09-28, two amendments to the plan before it goes for approval. (1) GitHub #11: pull the three lead.md upkeep sentences (Done-when into the Definition of Done at plan approval, a phase comment at each start and merge, tick a criterion naming its test when proven on main) plus the lead rubric line out as a small first PR that depends on nothing in the fork; phase 6 keeps only what that PR did not cover. (2) GitHub #26 / CF-53: in a project with no spec (one naming a requirements source), card criteria come from the requirement clauses the item answers, numbered in that order with the plan's extras after; the spec-numbered rule applies only where a spec exists.
---

author: lead
created: 2026-09-28 03:27
---
Plan amended 2026-09-28 (docs/plans/CF-24.md, Amendments from triage): part 1 shipped as #30 (v0.27.9, closes GitHub #11); no step 7, since the contract allows six How you work steps, so every lead.md rule goes into steps 3 and 5; and a project with no spec (CF-53) takes its criteria from the requirement clauses the item answers. All its dependencies are merged. Still awaiting the human's approval.
---

author: lead
created: 2026-09-28 04:02
---
Plan approved by the human 2026-09-28, with the recommended answer to all twelve open questions and three more amendments: CF-20 lands first, so the TaskCompleted gate is live when this merges; CF-25 goes before this item; and each criterion is ticked once (the Definition of Done gets the defaults plus only the Done when lines that are not already criteria, and lead.md step 3 is corrected to match). Build order: CF-25, then CF-20, then CF-24, then CF-53.
---

author: lead
created: 2026-09-28 12:35
---
Scope change 2026-09-28 from CF-58 (drop plans, by the human): the approved plan (docs/plans/CF-24.md) is deleted with every other plan, and is in git history at 3b8bf1b. Its decisions stand and are on this card and in docs/specs/CF-24.md. Dropped from scope: phase 4 (the spec-to-plan gate requiring a numbered Done when) and the "Done when copied to the Definition of Done" step. With no plan, the Definition of Done gets the project defaults, and what finishes the item is its own criteria. Kept: the TaskCompleted checklist gate, the create refusal, the defaults and the backfill script.
---

author: lead
created: 2026-09-29 13:59
---
Archived on 2026-09-29 at the human's word, as superseded by CF-58. Of issue #3's three requirements, (a), copying the plan's Done when at approval, went away with plans. (b), a progress comment at each sub-issue start and merge, and (c), ticking a criterion with the test that proves it once it is on main, are in lead.md step 5 and ran on CF-3 on 2026-09-29. Q7, "the plan wins", has nothing left to apply to. The two parts nothing covers are filed as CF-71 (project Definition of Done defaults) and CF-72 (the agent-contract.md:80 line). docs/specs/CF-24.md is marked superseded in b30eef7.
---

author: lead
created: 2026-09-29 14:05
---
Correction, 2026-09-30. Comment #10 and the archive were the lead's error. The lead summarised CF-24 from the spec's introduction, not from this card. It told the human only two parts were left, when comment #9 records much more that is still live: the TaskCompleted criteria gate (#6 to #8), the create refusal (#9, #10), the defaults and the backfill (#13 to #15), steward criteria (#11), provisional numbering (#12), Implementation Notes (#16) and the OpenCode row (#19). The human's decision rested on that summary. Once corrected, the human chose to restore and re-scope. The archive (3cb8d2c) and the superseded status on the spec (b30eef7) are reverted in f9e85b6 and 6145f26, and CF-53's dependency is back. Next, under CF-59: spec-writer revises docs/specs/CF-24.md for a fleet without plans. It drops criteria 2, 3, 5 and 17 and folds in CF-71 and CF-72, which were filed as leftovers and duplicate criteria 13, 14 and 1.
---

author: lead
created: 2026-09-29 14:12
---
The human's decisions from the deleted plan, carried forward on 2026-09-30. On 2026-09-28 the human approved the recommended answer to all twelve of the plan's open questions (comment #8). Comment #9 said those decisions were on this card and in the spec, but most were not. The lead read `git show 3b8bf1b:docs/plans/CF-24.md` and records the ones that still apply, so the builder has them:

- OQ3: the criteria gate also governs the lenient no-result path to Done, which is this repo's normal path.
- OQ4: when the board is disabled, skip the gate and log it. A dry run still reads the card, so the exit code matches a live run.
- OQ5: the create refusal covers Drafts too.
- OQ6: the backfill is a shipped, tested script, and uses one generic provisional criterion that the spec's criteria replace at sign-off.
- OQ7: the human moves merged items to Done before the backfill runs.
- OQ9: a Definition of Done item that does not apply is ticked, with `not applicable: <reason>` in the ticking comment.
- OQ10 (design decision 12): this repo's defaults are Q5's six. The template's are generic: checks pass on the branch; a reviewer approved; the docs for the changed behaviour are updated; the spec is linked as a reference. The plan's sixth repo item and fourth template item said "spec and plan". With plans dropped, both now read "the spec, where there is one". Repo item 2 now reads "a refuter round ran where lead.md step 4 calls for one".
- OQ11: run the steward smoke eval once on the PR.
- OQ12: the Codex note goes in a new "Fleet changes after this spec" section of codex/docs/specs/GPTA-1.md, before Sources.

The others are settled. OQ1 (no split) is reopened by the revision's proposed four-way split. OQ2 is done, since CF-25 is Done. OQ8 is void, because there is no plan gate. Plan findings 1 to 8 (hook lines, the single `Core.createTaskFromInput` create path, `serializeConfig` dropping unknown keys, the CLI having no DoD flags) are build inputs. Re-read them against main before building, because the line numbers are from v0.27.1.
---

author: lead
created: 2026-09-29 14:14
---
The human approved docs/specs/CF-24.md as revised on 2026-09-30 (c4ec107). These 15 criteria replace the 19 and are copied word for word from the spec. The human also accepted open questions 1 and 2 as recommended: keep #11 (the old #14) and keep the fixed first line in #2. The item is split into four sub-issues, CF-24.1 to CF-24.4, each carrying the text of its criteria. Criterion numbers here are the spec's, and a tick here follows the sub-issue that proves it. The gate sub-issue (CF-24.4) lands last, after the backfill, so it does not block every open card that has no criteria yet. Decisions carried from the deleted plan are in comment #12. The item has not been ordered to build yet.
---
<!-- COMMENTS:END -->
