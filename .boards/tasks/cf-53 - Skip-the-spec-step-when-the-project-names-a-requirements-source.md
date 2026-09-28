---
id: CF-53
title: Skip the spec step when the project names a requirements source
status: To Do
assignee: []
created_date: '2026-09-28 01:38'
labels: []
dependencies:
  - CF-24
priority: Medium
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub issue #26, decided for fathom on 2026-09-28 after the Models post-mortem. In a project with approved requirements the spec restates requirement clauses behind a second approval gate: fathom wrote twelve and the decisions they should have closed reopened at plan approval anyway. Triage on 2026-09-28: the project declares its source with a fixed line, "Requirements source: <path>", in AGENTS.md, which scripts can grep and the human can read; absent means the current spec path. Depends on CF-24, whose plan is amended so card criteria come from the requirement clauses an item answers when there is no spec. Nothing changes the plan gate. Related tension, not resolved here: CF-12.x adds spec machinery (editor pairs, a challenge gate) that this item makes optional in such projects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates/AGENTS.md carries a "Requirements source: <path>" line in Where work lives, and /init asks whether the project has one
- [ ] #2 spec-to-plan.js and /kickoff read that line: with it, intake goes brain dump to plan with spec-writer skipped and the plan written from the requirement clauses; without it, the current flow is unchanged; workflow-logic cases cover both
- [ ] #3 lead.md routes to spec-writer only for an unshaped idea in a project with no requirements source; otherwise open decisions are questions in the plan, answered at approval
- [ ] #4 spec-writer.md's description says when it is used, so the lead does not spawn it by habit
- [ ] #5 check-all green, migration-checklist run on lead.md and spec-writer.md, version bumped and tagged
<!-- AC:END -->
