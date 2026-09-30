---
id: CF-53
title: Skip the spec step when the project names a requirements source
status: To Do
assignee: []
created_date: '2026-09-28 01:38'
updated_date: '2026-09-30 14:01'
labels: []
dependencies:
  - CF-24
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/26'
  - claude/coder-fleet/templates/AGENTS.md
  - claude/coder-fleet/workflows/spec-to-card.js
  - docs/specs/CF-24.md
priority: Medium
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub issue #26, decided for fathom on 2026-09-28 after the Models post-mortem. In a project with approved requirements, the spec restates requirement clauses behind a second approval gate: fathom wrote twelve, and the decisions they should have closed reopened anyway. Triage on 2026-09-28: the project declares its source with a fixed line, "Requirements source: <path>", in AGENTS.md, which scripts can grep and the human can read. If the line is absent, the current spec path applies. This item depends on CF-24, whose criterion #9 (sub-issue CF-24.1) says that where there is no spec, card criteria come from the requirement clauses the item answers, in clause order. Related tension, not resolved here: CF-12 adds spec machinery (editor pairs and a challenge gate); under CF-12 Q21, a project with no editor record skips it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates/AGENTS.md carries a "Requirements source: <path>" line in Where work lives, and /init asks whether the project has one
- [ ] #2 spec-writer.md's description says when it is used, so the lead does not spawn it by habit
- [ ] #3 check-all green, migration-checklist run on lead.md and spec-writer.md, version bumped and tagged
- [ ] #4 spec-to-card.js and /kickoff read that line: with it, intake goes from brain dump to a card whose criteria are the requirement clauses the item answers, in clause order, with spec-writer skipped; without it, the current flow is unchanged; workflow-logic cases cover both
- [ ] #5 lead.md routes to spec-writer only for an unshaped idea in a project with no requirements source; otherwise each open decision becomes an Actions for Human question on the card, answered before the first build spawn
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-28 12:35
---
Scope change 2026-09-28 from CF-58 (drop plans, by the human): spec-to-plan becomes spec-to-card, and no plans are written anywhere. What is left for this item (GitHub #26): a project that names a requirements source skips spec-writer, and its card criteria come from the requirement clauses the item answers. The "plan written from the requirement clauses" half is gone.
---

author: lead
created: 2026-09-29 14:14
---
On 2026-09-30, at the human's word, criteria #2 and #3 were rewritten for a fleet without plans. They were removed and re-added, so they now appear as #4 and #5. Old #2 said "spec-to-plan ... the plan written from the requirement clauses". It now names spec-to-card, and the card's criteria are the requirement clauses in clause order, matching CF-24 criterion #9. Old #3 said "open decisions are questions in the plan, answered at approval". Its replacement, "an Actions for Human question on the card, answered before the first build spawn", is the lead's reading. The human has not decided it, so edit it if it is wrong. The spec-to-plan.js reference is replaced with spec-to-card.js.
---

created: 2026-09-30 14:01
---
Sub-issue 1 of 1: started. Done still needs: #1 to #5. The human ordered this built on 2026-10-01 ("finish the last 4 github issues", #26). It's first in the serial lead.md track; CF-52 #4 and CF-90 #5 follow after it merges. CF-24.1 already put the clause-criteria rule in lead.md step 5 and agent-contract.md, so this item reuses that text rather than restating it. The version bump is batched into one release at the end. This coder spawn is also CF-52 #3's live run: `worktree.baseRef: head` is set in .claude/settings.local.json, and local main is ahead of origin/main.
---
<!-- COMMENTS:END -->
