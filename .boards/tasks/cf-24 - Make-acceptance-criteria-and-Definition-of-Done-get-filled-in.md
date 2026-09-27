---
id: CF-24
title: Make acceptance criteria and Definition of Done get filled in
status: To Do
assignee: []
created_date: '2026-09-27 03:08'
updated_date: '2026-09-27 09:27'
labels: []
dependencies: []
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
- [ ] #1 fleet-design.md section 7, board-conventions, lead.md and agent-contract.md say only the lead ticks a criterion or DoD item, only with evidence (a criterion proven on main), naming it in a comment, and that a tick is a field edit, never a column write; agent-contract.md:80 names the board writes (spec: The agent-contract line)
- [ ] #2 Every plan ends with an exact `## Done when` section; lead.md step 3 says to write one and spec-to-plan's plan stage refuses a plan without it, proven by workflow-logic.mjs tests that fail first
- [ ] #3 lead.md says at plan approval the lead appends the plan's Done when to the card's DoD after the defaults (no duplicates), brings the card into line with the plan (each uncovered phase becomes a criterion or a sub-issue), and posts one comment saying which it did
- [ ] #4 lead.md says the lead posts exactly one comment at each phase start and each merge, first line in the agreed shape (Q6)
- [ ] #5 lead.md says the plan is authoritative (Q7) and the lead never judges an item done or not done on a ground the card does not show
- [ ] #6 TaskCompleted moves a [board:<id>] item to Done on a passing gate only with at least one criterion and every criterion and DoD item ticked; otherwise to Blocked with a comment listing each unticked item or saying there are none, exit 2. Contract cases fail first: unticked criterion, unticked DoD, no criteria; plus all-ticked reaches Done and a failing test gate still wins
- [ ] #7 When the gate cannot read criteria or DoD it follows CODER_FLEET_TEST_GATE: strict refuses with a could-not-read comment, lenient passes and logs; one dry-run contract case per mode
- [ ] #8 hooks/README.md and docs/limits.md state criterion 6's limits (depends on CF-20; cannot see a web-UI drag to Done), and the README states criterion 7 beside the CODER_FLEET_TEST_GATE description
- [ ] #9 Creating an item with no acceptance criteria is refused on the CLI, MCP task_create and web paths when the config requires criteria, and allowed when the key is absent or off; fork tests fail first
- [ ] #10 This repo's .boards/config.yml and templates/board.config.yml switch the requirement on; the template says how to turn it off, and /init step 2b says it is on and where to change it
- [ ] #11 fleet-steward.md requires criteria on every item it files, the steward smoke eval checks for them, and migration-checklist findings are in the PR
- [ ] #12 lead.md describes provisional criteria replaced at approval by the spec's, one card criterion per spec criterion with the same number (Q4b); plan extras numbered after them; a revised spec means rewriting the list (Q17); board-conventions names this as the exception to link-do-not-paste, spec wins on wording
- [ ] #13 This repo's .boards/config.yml carries the six-item default DoD from Q5 and a new item carries it, proven by a fork test or a recorded run
- [ ] #14 templates/board.config.yml carries a generic default DoD, and /init step 2b says it is there and how to change it
- [ ] #15 After the backfill every item not in Done or .boards/completed/ carries the default DoD, every open item without criteria carries provisional ones (Q14), and every closed item's file is byte-identical
- [ ] #16 board-conventions and lead.md say Implementation Notes is the human's field and the phase comments are the progress record
- [ ] #17 The first item planned after this merges is cited in the PR or a follow-up comment: its card shows the plan's Done when in its DoD, a phase comment per phase start and merge, and each tick naming its test or evidence
- [ ] #18 check-all.sh passes, new fork tests are in BOARD_TESTS, the PR records a local bun test run until CF-29, and the version is bumped in both manifests, tagged and pushed (CF-28)
- [ ] #19 The OpenCode divergence register has a Deferred row for the board, and the Codex docs carry a note
<!-- AC:END -->

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
<!-- COMMENTS:END -->
