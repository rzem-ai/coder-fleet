---
id: CF-58
title: >-
  Drop plans from the fleet: build from the card, the human's order is the
  approval
status: To Do
assignee: []
created_date: '2026-09-28 12:33'
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
