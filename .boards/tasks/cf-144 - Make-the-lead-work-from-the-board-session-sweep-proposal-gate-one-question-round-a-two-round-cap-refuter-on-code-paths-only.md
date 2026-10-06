---
id: CF-144
title: >-
  Make the lead work from the board: session sweep, proposal gate, one question
  round, a two-round cap, refuter on code paths only
status: In Progress
assignee: []
created_date: '2026-10-06 04:24'
updated_date: '2026-10-06 07:20'
labels: []
dependencies:
  - CF-140
references:
  - claude/coder-fleet/agents/lead.md
  - docs/fleet-design.md
  - CF-52
  - CF-90
priority: High
type: enhancement
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human on 2026-10-06 after the lead's session review. The human's words: "please review this session in how you have gone about picking up work to do, outside of what I have explicitly asked of you ... and make suggestions on how to keep you and the agents on track. this also means leaving working on edge cases and polishing code until the end, and not when the bulk of development should be the focus." The human then adopted, by AskUserQuestion: session-start board sweep; proposals need the human's go to be filed; one question round per item; cap at one review plus one fix round; refute code paths only.

Evidence from the session: CF-139 (High, security, ordered the day before) was dropped because the lead worked from its handover note and not the board; CF-142 was filed as a duplicate of CF-92 because step 5 files every Propose item without a search; a refuter ran on CF-140 (a column added to config.yml plus prose) because 'board or state files' counts config, and its five prose survivors forced a fix round that built a sentence parser; six follow-up questions went to the human on one item.

All edits are to claude/coder-fleet/agents/lead.md (and docs/fleet-design.md where it states the same rule). CF-52 criterion 4 and CF-90 criterion 5 ride in this change because they are the other open lead.md clauses. The lead.md track is serial: this starts after PR #60 (CF-140) is merged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md step 1 says the first action of a session is a board sweep: list Next, In Progress and every card carrying the human's order with work undelivered, and work from that list before any recall or handover note
- [ ] #2 lead.md step 5: a Propose item line gets a board search first; a match becomes a comment on the matched card; no match becomes one line under Decisions needed in the lead's handoff, and a card is filed only when the human says so
- [ ] #3 lead.md step 3: an item's design questions are asked once, in one AskUserQuestion before the first spawn; a reviewer's or refuter's follow-up gets the lead's default recorded on the card instead of a question, unless the default is hard to reverse
- [ ] #4 lead.md step 4: during build an item gets at most one review round and one fix round; whatever is still open after that becomes one Polish sub-issue filed at the end, never a further round
- [ ] #5 lead.md step 4: the refuter triggers name code paths - hooks, the board binary, scripts, authentication and credential paths; a change to config or prose alone gets no refuter; a surviving prose mutant is recorded as a low on the card and dropped
- [ ] #6 lead.md step 3's repeat-ask rule says a repeat ask wins over Next also when the card is already in Next but not at the top
- [ ] #7 CF-52 criterion 4: lead.md says in one clause that agent worktrees cut from the lead's current HEAD
- [ ] #8 CF-90 criterion 5: lead.md step 4 and docs/fleet-design.md say the reviewer runs the declared gates read-only
- [ ] #9 lead.md keeps six steps, roster-contract and lead-rules-contract pass or are updated to the new text, the migration checklist is run over lead.md, check-all is green and the version is bumped
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
created: 2026-10-06 07:05
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-9, plus the riders from CF-141 (criteria 1-2), CF-52 (criteria 3-4) and CF-90 (criterion 5), all in this one lead.md change. Version 0.36.0 assumed; CF-146 (0.35.3) and CF-56 (0.35.4) run in parallel on other files.

Done: nothing yet; the lead still starts a session from its handover note and files every proposal.
Not done: all nine rules.
---

author: @SubagentStop
created: 2026-10-06 07:20
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree check: `git rev-parse --git-common-dir` showed the main checkout's `.git` as the shared store, with the toplevel at `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a9885c89cbb7f526b`. The tree was clean. Branch `cf-144-lead-works-from-board` was cut from `origin/main` (5370625), and the PR diff has no `.boards/` files.
- Commit ba597f5 `Pin that task_list returns a Next status in ascending ordinal order (CF-141)`.
- Commit 940a80f `Record the live cut from local HEAD in limits.md and hooks README item 18 (CF-52)`.
- Commit eb769f5 `Make the lead work from the board: sweep, proposal gate, one question round, round cap, refuter on code paths (CF-144)`.
- Commit 81ca7ce `v0.36.0: the lead works from the board (CF-144, with CF-141, CF-52 #3-4 and CF-90 #5)`.
- PR: https://github.com/rzem-ai/coder-fleet/pull/64. The migration-checklist table is in its body.
- Criterion 1 (board sweep): step 1 is now "Sweep the board, then recall and scout". The first action of a session lists Next, In Progress and every ordered card with work undelivered, before any recall or handover note.
- Criterion 2 (proposal gate): step 5 searches the board for each `Propose item:` line. A match becomes a comment on that card. No match becomes one Decisions needed line, and a card is filed only when the human says so. This replaces "becomes a board item you file".
- Criterion 3 (one question round): step 3 asks an item's design questions once, in one AskUserQuestion before its first spawn. A reviewer's or refuter's follow-up gets the lead's default recorded on the card, unless that default is hard to reverse.
- Criterion 4 (round cap): step 4 allows at most one review round and one fix round during build. Whatever is still open becomes one Polish sub-issue filed at the end. The Handoff section now routes findings "within step 4's cap".
- Criterion 5 (refuter on code paths): the trigger sentence now starts "Spawn `refuter` only against a change to a code path - a hook, the board binary, a script, an authentication or credential path, or code that writes data ...". Config or prose alone gets no refuter, and a surviving prose mutant is a low on the card, then dropped. "When the item is High" stays inside that code-path sentence.
- Criterion 6 (repeat ask inside Next): a repeat ask for a card already in Next but not at the top takes it ahead of the cards above it. The existing pinned phrases are kept word for word.
- Criterion 7 (CF-52 #4): step 6 says "agent worktrees are cut from your current HEAD, so a spawn from a feature branch stacks on it".
- Criterion 8 (CF-90 #5): step 4 says the reviewer runs the project's declared gates read-only. `docs/fleet-design.md` now says the same in the reviewer roster row, the reviewer paragraph and the lead paragraph. The lead paragraph also gained the board sweep, the proposal gate, the code-path refuter and the round cap, and the To do row says the lead files a proposal "you said to file".
- Criterion 9: six steps confirmed. None of the lead.md checks needed changing, because every pinned phrase was kept, and no new phrase checks were added. Version 0.36.0 is in `plugin.json` and `marketplace.json`.
- Criterion 9 checks run on their own: `lead-rules-contract.sh` 13 passed, `next-column-contract.sh` 52 passed, `requirements-source-contract.sh` 33 passed, `roster-contract.sh` 155 passed.
- Criterion 9 migration checklist over lead.md: everything passed or was not applicable, except check 11 (not run).
- CF-141 rider: the Next rule names the MCP `task_list` (sorts a status by ordinal) and says the `board.sh` fallback lists by id, not ordinal.
- CF-141 test: "lists a Next status in ascending ordinal order, not by id or priority" in `claude/coder-fleet/board/src/test/mcp-tasks.test.ts`. It passed against the existing sort, so I broke the sort to watch it fail: with the ordinal comparison at `task-sorting.ts:167` turned into `if (false)` it failed (0 pass, 1 fail). After restoring it, the whole file gave 39 pass, 0 fail, and Biome lint/format is clean (run with `--vcs-enabled=false`).
- CF-52 #3 rider: `docs/limits.md` and hooks README item 18 now cite comment #11 (coder spawn cut at local HEAD fc1b90e, 2026-10-01) and CF-127 / PR #58.
- CF-52 #3 cost sentence in limits.md: a PR branch cut from local HEAD must not carry `.boards/` commits, which is why the CF-147 coder branched from `origin/main`.
- CF-52 #3 checks: in `worktree-base-contract.sh`, the three "pending" checks became six "recorded" checks. Before the docs changed: 24 passed, 6 failed. After: 30 passed.
- CF-90 rider: covered by criterion 8.
- `opencode/docs/divergence-register.md`: one Deferred row, because the port has no lead body yet.
- `bash claude/evals/lib/check-all.sh`, run once in the background with output captured: exit 0, "Every deterministic check passes". The board section showed 291 pass, 0 fail. The board `node_modules` symlink was removed before the version commit.
---
<!-- COMMENTS:END -->
