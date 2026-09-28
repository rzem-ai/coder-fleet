---
id: CF-51
title: Apply the Models post-mortem to the lead body
status: To Do
assignee: []
created_date: '2026-09-28 01:21'
updated_date: '2026-09-28 01:29'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/20'
  - 'https://github.com/rzem-ai/coder-fleet/issues/21'
  - 'https://github.com/rzem-ai/coder-fleet/issues/22'
  - 'https://github.com/rzem-ai/coder-fleet/issues/23'
  - 'https://github.com/rzem-ai/coder-fleet/issues/24'
  - claude/coder-fleet/agents/lead.md
priority: High
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the Fathom Models pages post-mortem (fathom docs/runs/2026-09-28-lead-models-live.md), GitHub issues #20 to #24, tracked as one item by the human decision in triage on 2026-09-28: all five edit agents/lead.md (How you work 2 and 3, Scope, Invariants) and the body is 48 of the 60 lines roster-contract.sh allows, so they are written together as one coherent pass. #22 also carries the size floor moved there from #9, defined once and used for both the review tier and the lead-builds exception. CF-24 (#11) and CF-42 (#14) also add lines to lead.md; the plan budgets the lines across all three. Triage decision on #20: the fast path fires on an explicit order OR a repeated request, as the issue proposes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #20: a design or build list the human ordered, or an outcome the human has asked for more than once, is the approval; the lead states in one line what it will spawn and spawns it, and lead.md How you work 3 and the Invariants line agree
- [ ] #2 #22: the size floor is named in lead.md (no new endpoint, no schema change, no credential path, under about a day of one agent), gives one agent and one review with no refuter, and under it the lead may build a design it wrote and spawn only the reviewer
- [ ] #3 #24: the lead's progress messages state Done and Not done in the human's terms, and never describe a phase by the item's title
- [ ] #4 lead eval rubric covers each rule, roster-contract passes, migration-checklist run on lead.md, check-all green, version bumped and tagged
- [ ] #5 #21: when the human asks again for something that already has an item, the lead comments the date and the human's words on it and raises it to High; a repeated request goes ahead of any sweep and any phase of another item at the next spawn, never by stopping a running phase, and the lead names what it moved back in one line
- [ ] #6 #22 guard-rails: when the lead builds, it calls task_focus and leaves the phase comment as it starts (no SubagentStart fires for its own build); it builds on a branch in the checkout and lands it through a PR, never on main; the gates come from review-round's tests and types-and-build lanes (gates, gatesMissing), not from the lead that wrote the code
- [ ] #7 #23: a plan opens with the human's words for the item, quoted from the card; each plan phase and each phase brief carries one sentence saying what the human will see or be able to do when it lands (spec-to-plan.js asks for it in the plan shape); before any phase spawn the lead rereads those words, and a mismatch stops the spawn
<!-- AC:END -->
