---
id: CF-21
title: Surface board commits that fail instead of dropping them silently
status: In Progress
assignee: []
created_date: '2026-09-27 02:36'
updated_date: '2026-10-07 00:21'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/coder-fleet/commands/kickoff.md
priority: High
type: bug
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-09-27: a stale .git/index.lock (mtime 11:39 AEST, no git process holding it) made every board commit fail from about 01:24 UTC. The MCP server's writes stayed on disk - CF-12 to CF-19 untracked, CF-6 and CF-8 edits unstaged, one CF-9 write staged but never committed - and nothing in ~/.local/state/coder-fleet/log/hooks.log said so (zero "commit skipped" lines). It surfaced only when `git pull` refused to run after PR #2 merged. The lead removed the lock and committed the writes (66f1e0f before rebase). Make a failed or skipped board commit visible: log it from the MCP server path too, and consider a check (kickoff, or the next board write) that notices uncommitted .boards changes or a stale lock and says so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board write whose commit fails or is skipped leaves a log line the human can find, from both the hook path and the MCP server path
- [ ] #2 Kickoff (or another routine check) reports uncommitted .boards changes and a stale .git/index.lock
- [ ] #3 A test covers the skipped-commit log line
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
created: 2026-10-07 00:17
---
Ordered: the human moved this card to the top of Next on 2026-10-07. Sub-issue 1 of 1: started. Done still needs: criteria 1 to 3.

Done: nothing yet; a coder is being spawned. It writes board state (the commit path), so a refuter runs before merge (lead.md step 4).

Not done: a failed or skipped board commit still leaves no trace.
---

author: @SubagentStop
created: 2026-10-07 00:21
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- Scope: all quotes below were read on main at `/Users/alex/Dev/Work/extensions/coder-fleet`. Sub-issue PRs: CF-24.1 = PR #53 (merge b1707b9), CF-24.2 = PR #48 (9bf1b3e), CF-24.3 = PR #52 (0dddb3f), CF-24.4 = PR #56 (275941c, v0.31.0). CF-24.1 to .3 were released in v0.29.0 (1afb9a6, PR #54). Plugin and marketplace are now both 0.39.2.
- C1 met (who ticks; design s7, help-boards, lead.md, agent-contract.md): `docs/fleet-design.md:144` "Only the lead ticks an acceptance criterion or a Definition of Done item, and only on evidence ... A tick is a field edit through `task_edit`, never a column write".
- C1 `claude/coder-fleet/agents/lead.md:33` (step 5) "Only you tick an acceptance criterion or a Definition of Done item, and only on evidence ... Judge done against the card's criteria and Definition of Done ... never a column."
- C1 `docs/agent-contract.md:82` (the card says `:80`, moved) "ticks acceptance criteria and Definition of Done items, edits the Definition of Done, replaces provisional criteria with the spec's ... A tick is a field edit, and none of them moves a column."
- C1 `claude/coder-fleet/skills/help-boards/SKILL.md:48` "Ticks are field edits, never column writes. Only the lead ticks ...".
- C1 no sentence says an agent makes no board write: `rg 'no board write|makes no board'` over `claude`, `docs` and `README.md` finds only spec text in `docs/specs/CF-24.md`, `hooks/README.md:107` (the "disabled" file) and `migration-checklist/SKILL.md:90` (about status writes).
- C1 test: none; prose is not covered by a contract case. Landed by CF-24.1: 3c1f5db (lead.md), 328cef1 (agent-contract and design s7), 187e538 (board-conventions, now help-boards), 45f88f5 (not-applicable tick).
- C2 met: `lead.md:33` "`Sub-issue <n> of <m>: <started | ready to merge in PR #<n> | merged to main at <sha>>. Done still needs: <criteria numbers or sub-issues>.`, an item not split being sub-issue 1 of 1". It adds a `ready to merge in PR #<n>` state the criterion text does not list (316ba3b, b755810). Test: none. Landed by CF-24.1: 3c1f5db.
- C3 met: `claude/coder-fleet/hooks/board-task-completed.sh:277` `if [ "$BOARD_ITEM_AC_COUNT" -gt 0 ] && [ "$BOARD_ITEM_OPEN_COUNT" -eq 0 ]; then`, and the else at line 283 logs "unticked item(s); moving to "$BOARD_COL_BLOCKED" and blocking completion". `hooks/README.md:275` describes it.
- C3 tests in `claude/evals/lib/board-hook-contract.sh`: `cg-unticked-criterion` (1945), `cg-unticked-dod` (1951), `cg-no-criteria`, `cg-all-ticked` (1965), `cg-test-fail-wins` (1976), plus `cg-no-dod-ticked`, `cg-comment-lists-unticked`, `cg-no-criteria-no-tick-advice` and the `cg-checked-*` cases. Refuter round 2 killed 8 of 8 mutants; baseline 204 passed, 0 failed. Landed by CF-24.4: c6a0610, 92d9697, 52400e1, ad130fc (v0.31.0); docs 123e184, 067107c, 9998121.
- C4 met: `board-task-completed.sh:308` (strict) "could not read the criteria and Definition of Done of $page_id, and the gate is strict; blocking completion"; `:313` (lenient) "CODER_FLEET_TEST_GATE is lenient, so it goes through unchecked". `hooks/README.md:271` states it beside the gate description.
- C4 tests: `cg-unreadable-strict` (1996), `cg-unreadable-lenient` (2002), `cg-unreadable-shape-strict`, `cg-unreadable-item-strict`, `cg-unreadable-shape-lenient`, `cg-unreadable-comment`. Landed by CF-24.4: ad130fc.
- C5 met: `docs/limits.md:9` "The card gate sees only a `[board:<id>]` task completed with `TaskUpdate` ... needs `CLAUDE_CODE_ENABLE_TODO_TOOLS` (CF-20, above) ... the gate cannot see the human moving a card to Done in the web UI". `hooks/README.md:282` "It cannot see the human moving a card to Done in the web UI." Landed by CF-24.4: 123e184, 067107c, 9998121.
- C6 met: tests in `claude/coder-fleet/board/src/test/require-acceptance-criteria.test.ts`: "the require_acceptance_criteria config key" (76), "Core.createTaskFromInput with the key on" (97), "...with the key absent or off" (124), "board task create (CLI)" (145), "MCP task_create" (167, tool error), "POST /api/tasks (web UI)" (216, 400), "promoting a Draft counts as a create" (297), "a live config reload with a malformed value" (375).
- C6 also `claude/coder-fleet/board/src/test/web-drafts-promote-error.test.tsx`; both files are in `BOARD_TESTS` in `claude/evals/lib/check-all.sh`. Landed by CF-24.3: daa4b5d, 7c29052, ac88544, 4407f78, 2c89eb1.
- C7 met: `.boards/config.yml:22` and `claude/coder-fleet/templates/board.config.yml:20` both `require_acceptance_criteria: true`. Template line 19 "Set require_acceptance_criteria: false to turn this off." `claude/coder-fleet/commands/init.md:45` (step 2b) says it is on and how to turn it off.
- C7 test: `require-acceptance-criteria.test.ts:260` "the shipped configs switch the requirement on (CF-24 criterion 7)" and `:272` "the template says how to turn the requirement off". Landed by CF-24.3: 51e97fb.
- C8 met: `claude/coder-fleet/agents/fleet-steward.md:28` "Every item you file carries acceptance criteria that state what closing it means ... an item with none is one nobody can close."
- C8 eval: `claude/evals/fleet-steward/checks.sh:34` and `:102` "PASS FS-criteria the items it files carry acceptance criteria"; rubric `claude/evals/fleet-steward/rubric.md:16` (FS01f) and `:38` (FS04e); contract `claude/evals/lib/steward-checks-contract.sh` (35 cases, 13 mutants).
- C8 migration-checklist: the CF-24.1 comment cites "PR #53 (comment 5912223980)", which I did not open. Landed by CF-24.1: 3b5bb09, 80f9151, fe87510, f2a9421, 11ce214, 331a833.
- C9 met: `lead.md:33` "one filed ahead of its spec carries provisional ones ... at sign-off you replace them with one card criterion per spec criterion, same number; in a project that names a requirements source and has no spec, an item's criteria are the requirement clauses it answers, in clause order ... a revised spec means rewriting the list."
- C9 `help-boards/SKILL.md:118` (card says `:115`) "Where the card and the spec disagree on wording, the spec wins." Test: none. Landed by CF-24.1: 3c1f5db, 316ba3b (clause case), 187e538.
- C10 met: `.boards/config.yml:12-18` `definition_of_done:` six items, none containing "plan". Item 2 now reads "The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round ... when .claude/coder-fleet.json disables the refuter", longer than the original.
- C10 test: `claude/coder-fleet/board/src/test/dod-defaults-config.test.ts:44`, `:61` "carries the default Definition of Done, with no plan in it", `:68` "gives a newly created item every default, unticked and in order"; `REPO_DEFAULTS` at line 17 matches the config. Landed by CF-24.2: 16df40e.
- C11 met: `claude/coder-fleet/templates/board.config.yml:12-16` four items (checks pass, reviewer approved, docs updated, "The spec, where there is one, is linked as a reference"), no plan. `claude/coder-fleet/commands/init.md:44` says it is there and that the human edits it in `.boards/config.yml`. Test: same `dod-defaults-config.test.ts` (`TEMPLATE_DEFAULTS`, line 26). Landed by CF-24.2: 16df40e.
- C12 met: commit 61aa4d5 "Backfill the Definition of Done defaults and provisional criteria". The CF-24.2 comment says "87 added, 12 provisional (all To Do backlog cards), 28 skipped, no failures. `shasum -c` over the 28 closed files' checksums ... all OK, byte-identical".
- C12 state on main now: `grep -L 'DOD:BEGIN'` over `.boards/tasks/*.md` gives 28 files, none of them among the 105 files with status To Do, Next, In Progress or Blocked; `grep -L 'AC:BEGIN'` gives no files.
- C12 test: `claude/evals/lib/board-backfill-contract.sh` (B02, B03, B12, B16, B17, B20 and others) in `check-all.sh`; script `claude/coder-fleet/scripts/board-backfill.sh`. Landed by CF-24.2: d0e022a, 91a1031, c0ec47f, run at 61aa4d5.
- C13 met: `lead.md:33` "Those comments are the progress record, and Implementation Notes is the human's field, never yours." `help-

[Cut to fit a board comment. The other 1339 characters, and this text in full, are in /Users/alex/.local/state/coder-fleet/archives/b60f21ed-bab8-46da-b450-232af096a73a/20261007T002141Z-coder-fleet_scout.md]
---
<!-- COMMENTS:END -->
