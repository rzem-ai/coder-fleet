---
id: CF-58
title: >-
  Drop plans from the fleet: build from the card, the human's order is the
  approval
status: In Progress
assignee: []
created_date: '2026-09-28 12:33'
updated_date: '2026-09-28 13:18'
labels: []
dependencies: []
priority: High
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decided by the human 2026-09-28, in this session, after asking where the docs require plans: drop the built-in Plan agent and every reference to plans. Decisions: (1) a coder builds from the board card - the human's words, its acceptance criteria and the decisions recorded as comments - and the lead writes the brief into the spawn prompt; a big item splits into sub-issues, not phases; (2) the human's order is the approval - an item the human filed, asked for or said go on - and the lead states in one line what it is about to build and what the human will see when it lands, then builds it; review-round's fix gate checks the card has acceptance criteria instead of a plan file; (3) specs stay: spec-writer shapes an unshaped idea into criteria, and spec-to-plan becomes a spec-only workflow; (4) docs/plans is deleted (the four never-committed plans are committed first so git history holds them). Tests first, independent review and the refuter tiering all stay. This supersedes: GitHub #20 whole (the fast path becomes the only path), the plan half of #23, CF-24's plan gate and numbered Done-when (its phase 4), and CF-53's plan-writing half; CF-51 and CF-53 shrink accordingly. Ports (opencode, codex) are not edited from this tree; a port-sync item is filed instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md: no Plan agent and no plan; step 3 builds from the card with the one-line notice; the Invariant is "never spawn a coder or scripter on work the human has not ordered"; still six steps, under 60 lines
- [ ] #2 coder.md, scripter.md, spec-writer.md, tech-writer.md, ui-designer.md and every other body and description: no plan; migration-checklist run over each changed body and frontmatter
- [ ] #3 glossary: no Plan row, Phase is a workflow stage only; the rule and this repo's copy regenerated
- [ ] #4 review-round.js: fix: true requires the card to have acceptance criteria, not an approved plan; spec-to-plan becomes a spec-only workflow; workflow-logic cases updated red first
- [ ] #5 commands, templates, skills, hooks (the scope rule about docs/plans), README, AGENTS.md, fleet-design.md, agent-contract.md and limits.md carry no plan
- [ ] #6 evals: every prompt, rubric and fixture that assumes a plan is rewritten to the card and the order; check-all green
- [ ] #7 docs/plans is gone from main, with every plan file in git history first
- [ ] #8 a port-sync item is filed for opencode and codex; the version is bumped, tagged and pushed
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @SubagentStop
created: 2026-09-28 13:00
---
Blocked by human. coder-fleet:reviewer raised 1 blocker(s). From "## Decisions needed" in its handoff:

- The CF-58 card says spec-to-plan "becomes a spec-only workflow" (description item 3 and criterion #4), but the brief and the diff make it spec-to-card, whose second run writes acceptance criteria onto the board card. Which did you decide, and should the card be updated to match?
---

author: lead
created: 2026-09-28 13:00
---
Answer to action #1, from the decision the human already made (2026-09-28): the option the human chose read "spec-writer stays for unshaped ideas and feeds the card's criteria (spec-to-plan becomes a spec-only workflow)". "Spec-only" meant no plan stage, and "feeds the card's criteria" is what spec-to-card's second run does. So spec-to-card, which files the approved spec's criteria onto the card, is the decision. Criterion #4's "spec-only workflow" means spec-to-card. No card change beyond this note.
---

author: @board
created: 2026-09-28 13:01
---
Actions for Human cleared: CF-58 moved from Blocked by human to In Progress.

- #1 (ticked) The CF-58 card says spec-to-plan "becomes a spec-only workflow" (description item 3 and criterion #4), but the brief and the diff make it spec-to-card, whose second run writes acceptance criteria onto the board card. Which did you decide, and should the card be updated to match?
---

author: @SubagentStop
created: 2026-09-28 13:18
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups; this round's findings are not a repeat of round 1's.
- Examined `git diff 1af7c70 HEAD` (ca4bb7a..faaa656) in the context of `origin/main...HEAD`: `claude/coder-fleet/workflows/review-round.js`, `claude/coder-fleet/workflows/spec-to-card.js`, `claude/evals/lib/workflow-logic.mjs`, `claude/coder-fleet/agents/lead.md`, `coder.md`, `scripter.md`, `README.md`, `claude/evals/lead/rubric.md`, `claude/coder-fleet/hooks/lib/board.sh`, `claude/scripts/install-home.sh`. Checked against `claude/coder-fleet/board/src/cli.ts`, `board/board.sh`, `board/src/markdown/structured-sections.ts` and the cached `0.25.0` and `0.27.11` plugin trees.
- Every round-1 must and low is implemented as asked.
- low: claude/evals/lib/workflow-logic.mjs:970 - `reviewer-reads-the-card` matches `\bx\b`, which the stub's `ran: ['x']` satisfies; it should check for `X-1`.
- low: claude/evals/lib/workflow-logic.mjs:310 - no case with a different card id for spec-to-card's `boardSaidNoTask`, and no sub-issue (`no task X-1.2`) case in either workflow, so the lookahead can be removed without a failure.
- low: claude/coder-fleet/workflows/spec-to-card.js:302 - the comment says the board drops a spec's leading `#<n> `; it drops only its own marker. The code is harmless and the reason is wrong.
- low: claude/coder-fleet/workflows/review-round.js:132 - `BOARD` is copied into spec-to-card.js:74 with no test that the two strings match.
---
<!-- COMMENTS:END -->
