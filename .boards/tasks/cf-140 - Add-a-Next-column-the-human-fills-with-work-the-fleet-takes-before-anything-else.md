---
id: CF-140
title: >-
  Add a Next column the human fills with work the fleet takes before anything
  else
status: In Progress
assignee: []
created_date: '2026-10-06 00:19'
updated_date: '2026-10-06 00:46'
labels: []
dependencies: []
priority: High
type: feature
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked (2026-10-06): "add a new column to the board. the new column is to be called "Next". this is a column for the human to add items to that the fleet should work on next in preference of anything else that is queued".

Decisions the human gave in the session (2026-10-06):
1. A card in Next is the human's order to build it. The lead may spawn on it without a further "go" in the session.
2. Several cards in Next are taken top of the column first (the card's ordinal, the human's drag order), not by priority.
3. Only the human moves cards into Next. The lead may suggest one, and the human confirms by moving it. The lead never sets the column.
4. New boards get Next from the template. /kickoff and /init detect a board without it and add it on the human's yes, the way the Doing rename works (CF-9).

Scout's map (2026-10-06): column order and validation come from `statuses` in `.boards/config.yml` (web Board.tsx, MCP schema-generators.ts, utils/status.ts), so the board binary needs no code change. Done is terminal by position (last entry). board-subagent-start.sh moves any non-Done, non-held status to In Progress, so a Next card moves on spawn. Five-column prose: glossary skill (generated rule), board-conventions, docs/fleet-design.md, README.md:90 (quoted by instruction-file-contract.sh:119), hooks/README.md:49, kickoff.md:29, init.md:40, lead.md step 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 This repo's .boards/config.yml and claude/coder-fleet/templates/board.config.yml list statuses in the order To Do, Next, In Progress, Blocked, Blocked by human, Done, and the web board shows Next between To Do and In Progress
- [ ] #2 A spawn on a focused card in Next moves it to In Progress, proven by a case in board-hook-contract.sh
- [ ] #3 /kickoff and /init detect a board whose statuses lack Next, and on the human's yes insert it after To Do in .boards/config.yml and commit that config alone; with no yes nothing changes; kickoff's status check accepts the six-status list
- [ ] #4 The lead body says a card in Next is the human's order, that the lead takes Next cards before any other queued work, top of the column first by ordinal, and that it may suggest a card for Next but never moves one
- [ ] #5 The glossary skill, its generated rules, board-conventions, docs/fleet-design.md, README.md and hooks/README.md describe six columns with Next defined as the human's ordered queue, and the deterministic suite (claude/evals/lib/check-all.sh) passes
- [ ] #6 The plugin version is bumped in plugin.json and marketplace.json
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
created: 2026-10-06 00:19
---
Decisions the human gave in the session, 2026-10-06, answering the lead's questions: (1) Next is the go - a card the human puts in Next is ordered work; (2) top of the column first, by ordinal; (3) lead may propose - the lead may suggest a card for Next, the human confirms by moving it, the lead never moves it; (4) kickoff/init offer it - new boards get Next from the template, existing boards get it on the human's yes.
---

author: lead
created: 2026-10-06 00:19
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-6.

Done: nothing yet - the board still shows five columns.
Not done: the Next column, the lead's rule for taking Next first, and the kickoff/init offer for other projects.
---

author: @SubagentStop
created: 2026-10-06 00:46
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- I worked in worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-aa2109494ffdf752e` on branch `cf-140-next-column`, cut from origin/main. It is pushed and the worktree is clean.
- AC1: `.boards/config.yml:5` and `claude/coder-fleet/templates/board.config.yml:5` now list `To Do, Next, In Progress, Blocked, Blocked by human, Done`. Commit: "Add Next between To Do and In Progress on the template and this board (CF-140)".
- AC1 evidence: `claude/evals/lib/next-column-contract.sh` checks both configs and is new in `check-all.sh`, so CI runs it. `claude/coder-fleet/board/src/test/next-column.test.ts` serves each config, checks that `/api/statuses` (the order the web board draws its columns in) returns the six, and checks Done is still the terminal status. Both tests failed against the five-status configs before the change.
- AC2: new case `start-col-next` in `claude/evals/lib/board-hook-contract.sh`. To see it fail, I made `board-subagent-start.sh` skip a card in Next; it went red (204 passed, 1 failed). I reverted that and it went green (205 passed). The hook itself is unchanged. Commit: "Prove a spawn on a card in Next moves it to In Progress (CF-140)".
- AC3: `claude/coder-fleet/commands/kickoff.md` has a new Next paragraph. It asks with AskUserQuestion and says which branch the commit lands on. On a yes it inserts `Next` directly after `To Do` and commits `.boards/config.yml` alone; on a no nothing changes; no card moves either way. Kickoff's status check now names the six statuses and does not fail a board without Next.
- AC3: `claude/coder-fleet/commands/init.md` step 2b follows the same paragraph and says a new board gets Next from the template. Twelve contract checks cover AC3; all failed first. Commit: "Offer Next from /kickoff and /init on a board without it (CF-140)".
- AC4: `claude/coder-fleet/agents/lead.md` step 3 now says a card in Next is the human's order to build it, to take Next ahead of any other queued work, top of the column first by ordinal and never by priority, and that the lead may suggest a card for Next but never moves one there itself. Five contract checks cover it; all failed first.
- AC4: I did not widen the lead's column-write exception, because adding Next edits the config and moves no card. Commit: "Take Next cards first in the lead, and never move one there (CF-140)".
- AC5: these now say six columns and define Next as the human's ordered queue: the glossary skill (Board row, a new Next row, and the description) with both generated rules regenerated by `gen-glossary-rule.sh`; `board-conventions/SKILL.md` (description, heading, a table row, and a note that the lead suggesting a card for Next is the one exception to "never ask for a move"); `docs/fleet-design.md` (table row and hook paragraph); `README.md` lines 39 and 90, with the quoted line in `instruction-file-contract.sh` updated to match; and `claude/coder-fleet/hooks/README.md:49`.
- AC5 evidence: contract checks in `next-column-contract.sh` also assert that none of these files still says "five". Commits: "Describe six columns, with Next the human's ordered queue (CF-140)" and "Name Next in the glossary skill's description (CF-140)".
- AC6: the version is 0.34.0 in `claude/coder-fleet/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. Commit: "v0.34.0: add the Next column the human fills with work the fleet takes first (CF-140)".
- OpenCode port: its glossary still has five columns and the board is deferred there as a whole, so I added a Deferred row for the Next column to `opencode/docs/divergence-register.md` instead of porting it. Commit: "Record the Next column as deferred in the OpenCode port (CF-140)".
- Migration checklist: I ran it over `lead.md` and the frontmatter of the two skills I changed, and the findings table is in the PR body. One real finding: the glossary description lists every term and was missing Next. That is fixed and has a check.
- Suite: `bash claude/evals/lib/check-all.sh` ran twice, on different code: exit 0 before the last fix commit, and exit 0 on the final branch ("Every deterministic check passes.", 256 board bun tests passing).
---

author: lead
created: 2026-10-06 00:46
---
Sub-issue 1 of 1: ready to merge in PR #60, after review. Done still needs: criteria 1-6 proven on main (all six built on branch cf-140-next-column, v0.34.0); reviewer approval; refuter round (card is High, change writes board config); tag and push.

Done: the coder built the Next column on the branch, along with the test proving a spawn on a Next card moves it to In Progress, the kickoff/init offer, the lead rule (Next first, top card first, lead only suggests), the six-column prose, and the OpenCode deferral row. check-all.sh is green on the coder's own run.
Not done: you still can't see Next on your board, because nothing is merged. Work is PAUSED on the human's order (2026-10-06, "pause all work once the coder has finished its current work"). No review, refuter or merge until the human says go.
Held for the human: two proposed items (check whether task_list returns Next cards in ordinal order; add a Worktree setup section to AGENTS.md for board node_modules) and one proposed memory line, all not filed yet.
---
<!-- COMMENTS:END -->
