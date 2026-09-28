---
id: CF-51
title: Apply the Models post-mortem to the lead body
status: To Do
assignee: []
created_date: '2026-09-28 01:21'
labels: []
dependencies: []
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
- [ ] #2 #21: a request the human has repeated goes ahead of any sweep and any phase of another item, and the lead names what it moved back in one line
- [ ] #3 #22: the size floor is named in lead.md (no new endpoint, no schema change, no credential path, under about a day of one agent), gives one agent and one review with no refuter, and under it the lead may build a design it wrote and spawn only the reviewer
- [ ] #4 #23: before any phase spawn the lead rereads the human's words and the brief and each plan phase carry one sentence saying what the human will see when it lands; a mismatch stops the spawn
- [ ] #5 #24: the lead's progress messages state Done and Not done in the human's terms, and never describe a phase by the item's title
- [ ] #6 lead eval rubric covers each rule, roster-contract passes, migration-checklist run on lead.md, check-all green, version bumped and tagged
<!-- AC:END -->
