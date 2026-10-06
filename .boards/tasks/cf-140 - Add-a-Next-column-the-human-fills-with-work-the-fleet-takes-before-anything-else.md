---
id: CF-140
title: >-
  Add a Next column the human fills with work the fleet takes before anything
  else
status: To Do
assignee: []
created_date: '2026-10-06 00:19'
updated_date: '2026-10-06 00:19'
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
<!-- COMMENTS:END -->
