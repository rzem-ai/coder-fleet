---
id: CF-25
title: Put an Actions for Human section at the top of a blocked card
status: In Progress
assignee: []
created_date: '2026-09-27 03:09'
updated_date: '2026-09-28 04:12'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/coder-fleet/board
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/skills/handoff/SKILL.md
  - docs/specs/CF-25.md
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - 'https://github.com/rzem-ai/coder-fleet/issues/8'
priority: High
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-09-27: "when a card is moved into 'Blocked by human', there needs to be a section called 'Actions for Human' or something to that effect which tells the human, near the top of the card, what exactly needs the human's attention or action."

Today the SubagentStop hook moves the item to Blocked by human and appends the Blocker: lines as a comment, which lands at the bottom of the card below the description, criteria and every earlier comment (see CF-8's and CF-12's cards). The human has to scroll to find what they are being asked.

Needs a spec: where the section lives (a new field in the carried board fork, rendered near the top in the file, CLI, MCP view and web UI; or a section the hook maintains in an existing field), its wording and format (one action per line, which agent asked, when); what clears it (the human's answer, the next spawn against the item, or the item leaving Blocked by human) without destroying history (board-conventions: add comments, do not rewrite descriptions); what a Blocker: line must contain to be actionable, and whether the handoff skill tightens that; and the hooks' contract tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When SubagentStop moves an item to Blocked by human, the section holds one unticked action per Blocker: line, each the ask alone with no agent name or time; a board-hook-contract.sh dry-run case fails before the change
- [ ] #2 An action whose text does not end in ? once right-trimmed is stored with the prefix `[not a question] `, one that does without it, whichever writer added it; for SubagentStop the item moves to Blocked by human in both cases (dry-run contract cases); the add operation proven by a fork test
- [ ] #3 A second Blocker: handoff against an item already in Blocked by human appends its actions numbered after the existing ones, existing actions and ticks unchanged; a contract case and a fork test
- [ ] #4 The lead can add an action through MCP task_edit; it appends after existing actions and the status is unchanged whatever the column; a fork test asserts status before and after, once in Blocked by human and once outside it
- [ ] #5 A move into Done from a column other than Blocked by human empties a non-empty section and posts the archive comment in the same write; any other status change outside Blocked by human leaves the section untouched; fork tests
- [ ] #6 The CLI view, MCP task_view and the web modal render the section before the Description with each action's number and ticked state, and nothing when it is empty; fork tests
- [ ] #7 The kanban card shows the first unticked action's text, truncated with the flag prefix intact, and no action text when none is open; a fork test
- [ ] #8 One action can be ticked and unticked by number through the CLI, MCP task_edit and the web modal, changing no other action and no status; a ticked action stays shown ticked; one fork test per path
- [ ] #9 Any status change out of Blocked by human empties the section in the same write and posts one archive comment listing every action with number, text and ticked state, via the CLI, MCP task_edit or the web update path (one fork test each); a write that stays in Blocked by human leaves it untouched
- [ ] #10 The lead's clear empties the section without a status change and posts the archive comment with the lead's reason; a fork test asserts the status is unchanged
- [ ] #11 lead.md says when the lead may add an action (the human's decision needed outside a handoff), that adding moves no column so it also asks in the session, when it may tick one (answered in the session) and comments when it does, and when it may clear the section (an action it knows is void); the column stays in every case
- [ ] #12 A task file with the section round-trips parse and serialise byte for byte, and one without is written back without it; fork tests
- [ ] #13 The SubagentStop blocker comment is posted unchanged, so CF-19's assertions still hold
- [ ] #14 board-conventions (with its CLI table), fleet-design.md section 7, agent-contract.md and hooks/README.md describe how both writers write, flag, tick and clear the section
- [ ] #15 check-all.sh passes, new fork test files are in BOARD_TESTS, the PR records a local bun test run until CF-29, the version is bumped in both manifests, board LICENSE and NOTICE.md unchanged, migration-checklist findings in the PR
- [ ] #16 The OpenCode divergence register has a Deferred row for the board, and the Codex docs carry a note
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 03:18
---
Draft spec at docs/specs/CF-25.md with GitHub issue #3 point 1 folded in. Root cause found: reviewer.md:42 and refuter.md:48 instruct those agents to raise must-fix findings as Blocker: lines, so the Fathom reviewer did exactly what it was told. CF-23 AC7 fixes the refuter half; this item now carries the reviewer half and the handoff skill's worked example. Awaiting the human's interview.
---

author: @SubagentStop
created: 2026-09-27 03:30
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Rewrote `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-25.md` with the interview answers.
- Checked that CF-26, CF-27, CF-29 and CF-31 exist on the board and match what the spec says about them, including that CF-31 takes over CF-23's criterion 7.
---

author: @lead
created: 2026-09-27 04:34
---
From the CF-31 build (2026-09-27): the scope hook's deny text at enforce-agent-scope.sh:1117-1119 still asks for a plain `Blocker:` line; reword it to ask for the Blocker as a question ending in `?`, so CF-25's not-a-question flag does not fire on it. CF-31 left it for this item on purpose.
---

author: @SubagentStop
created: 2026-09-27 05:50
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Updated `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-25.md`, Decisions: added Q12 (the lead ticks an action when the human answers it in the session, and says so in a comment), Q13 (ticked actions stay visible until the card leaves the column), Q14 (both `SubagentStop` and the lead add actions; against the drafter's lean) and Q15 (the fixed `[not a question] ` prefix).
- Updated CF-25's section, criteria, non-goals and overlaps. The section now covers a lead-facing add (MCP `task_edit` and the CLI), the flag applied by the binary's add operation, how ticking works and the clear on reaching Done. Criteria went from 13 to 16. CF-31's `must fix:` and `survived:` bullets are referenced, and CF-26 and CF-27 are noted as being planned.
- Updated `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-24.md`, Decisions: added Q13 (the lead ticks Definition of Done items with evidence, and the gate checks them too) and Q14 (an item with no criteria is refused, and the backfill gives open items provisional criteria first).
- Also added to CF-24's Decisions: Q15 (an unreadable card follows `CODER_FLEET_TEST_GATE`, confirmed at `hooks/board-task-completed.sh:30, 207-220`), Q16 (the template switches "never without criteria" on and a project can turn it off) and Q17 (numbering, marked **[lead's default]**).
- Updated CF-24's criteria from 17 to 19: a new gate-mode criterion and a template/config criterion, with criterion 6 rewritten. The agent-contract line now covers CF-25's add, tick and clear, and CF-31 is referenced as evidence for Definition of Done item 2.
- CF-25 card criterion 1: `SubagentStop` writes one unticked action per `Blocker:` line, the ask alone with no agent or time (contract case).
- CF-25 card criterion 2: an action not ending in `?` gets the `[not a question] ` prefix from either writer, and the item still moves on `Blocker:`.
- CF-25 card criterion 3: a second `Blocker:` handoff appends numbered actions and leaves existing actions and ticks unchanged.
- CF-25 card criterion 4: the lead adds an action through MCP `task_edit`; it appends and the status is unchanged in or out of Blocked by human.
- CF-25 card criterion 5: entering Done from any other column empties and archives a non-empty section; other changes outside the column leave it alone.
- CF-25 card criterion 6: the CLI, MCP `task_view` and the web modal render the section before Description, and nothing when it is empty.
- CF-25 card criterion 7: the kanban card shows the first unticked action, truncated with the flag intact.
- CF-25 card criterion 8: tick and untick by number on the CLI, MCP and web; no other action or status changes, and ticked actions stay shown.
- CF-25 card criterion 9: any change out of Blocked by human empties the section and posts one archive comment, on every write path.
- CF-25 card criterion 10: the lead's clear empties the section without a status change and archives with the reason.
- CF-25 card criterion 11: `lead.md` covers when the lead adds, ticks (with a comment) and clears actions, and that the column stays.
- CF-25 card criterion 12: the task file round-trips byte for byte with and without the section.
- CF-25 card criterion 13: the `SubagentStop` blocker comment is unchanged, so CF-19 still holds.
- CF-25 card criterion 14: board-conventions, design section 7, agent-contract and `hooks/README.md` describe both writers, the flag, ticking and clearing.
- CF-25 card criterion 15: `check-all.sh` passes, new tests are in `BOARD_TESTS`, a local `bun test` run is recorded until CF-29, the version is bumped, LICENSE and NOTICE are intact, and migration-checklist findings are in the PR.
- CF-25 card criterion 16: the OpenCode register has a Deferred row and the Codex docs have a note.
- CF-24 card criterion 1: four docs say only the lead ticks criteria and Definition of Done items, with evidence named in a comment, and agent-contract:80 names the board writes.
- CF-24 card criterion 2: every plan ends with `## Done when` and `spec-to-plan` refuses a plan without it.
- CF-24 card criterion 3: `lead.md` covers the plan-approval steps: append Done when, bring the card into line with the plan, post one comment.
- CF-24 card criterion 4: `lead.md` requires one comment per phase start and merge, in the Q6 shape.
- CF-24 card criterion 5: `lead.md` says the plan is authoritative, and the lead never judges an item not done on a ground the card doesn't show.
- CF-24 card criterion 6: `TaskCompleted` refuses Done for an unticked criterion, an unticked Definition of Done item or no criteria, and moves the item to Blocked with a list.
- CF-24 card criterion 7: an unreadable card follows `CODER_FLEET_TEST_GATE`: strict refuses, lenient passes and logs.
- CF-24 card criterion 8: `hooks/README.md` and `limits.md` state the CF-20 and web-drag limits and the gate-mode behaviour.
- CF-24 card criterion 9: creating an item with no criteria is refused on the CLI, MCP and web when the key is on, and allowed when it is absent or off.
- CF-24 card criterion 10: the repo config and the template switch the requirement on, and the template and `/init` say how to turn it off.
- CF-24 card criterion 11: `fleet-steward.md` requires criteria and the steward eval checks for them; migration-checklist findings are in the PR.
- CF-24 card criterion 12: `lead.md` covers provisional criteria and spec-numbered card criteria with the plan's extras after, and board-conventions names the paste exception.
- CF-24 card criterion 13: the repo config carries the six-item default Definition of Done and a new item gets it.
- CF-24 card criterion 14: the template carries a generic default Definition of Done and `/init` step 2b mentions it.
- CF-24 card criterion 15: the backfill gives every open item the defaults and gives provisional criteria to any open item without criteria; closed items are byte-identical.
- CF-24 card criterion 16: Implementation Notes is the human's field and phase comments are the progress record.
- CF-24 card criterion 17: the first item planned after merge shows all of this working, cited in the PR.
- CF-24 card criterion 18: `check-all.sh` passes, new tests are in `BOARD_TESTS` with a local `bun test` run until CF-29, and the version is bumped, tagged and pushed.
- CF-24 card criterion 19: the OpenCode register has a Deferred row and the Codex docs have a note.
---

author: @lead
created: 2026-09-27 05:50
---
All interview questions answered 2026-09-27; docs/specs/CF-25.md is awaiting the human's edit and approval (16 criteria). Check the [supplied] lines first, above all: a lead-added action never moves a column. On approval the lead files the spec's 16 criteria on this card, one line each, same numbers (CF-24's rule).
---

author: @lead
created: 2026-09-27 09:27
---
Spec docs/specs/CF-25.md approved by the human 2026-09-27. Criteria filed from the spec, one per spec criterion with the same numbers (CF-24's rule). Note for the plan: criterion 15 says NOTICE.md unchanged, but CF-26/27 and CF-43 add a behaviour-divergence section to NOTICE.md and a board-fork change here will add to it too; the plan should resolve that against the spec. Planning next.
---

author: lead
created: 2026-09-28 03:55
---
Plan docs/plans/CF-25.md approved by the human 2026-09-28, with the recommended answer to all ten open questions and one amendment: SubagentStart leaves a card in Blocked by human while its Actions for Human section has an unticked action, and the lead ticks each as the human answers, so a scout spawned mid-wait no longer archives the questions off the card. All its dependencies are merged (v0.27.9). Ready to build: Run A (fork, review and refuter), then Run B (hooks, docs, version).
---

author: lead
created: 2026-09-28 04:12
---
Phase 1 of 5 starting (Run A: fork failing tests, then fork implementation). Not on main. Done still needs all 16 criteria, plus the hold-while-open amendment. Branch cf-25-actions-for-human.
---
<!-- COMMENTS:END -->
