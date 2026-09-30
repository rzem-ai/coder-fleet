---
id: CF-96
title: Consolidate the lead's own-build rules in lead.md
status: To Do
assignee: []
created_date: '2026-09-30 09:18'
updated_date: '2026-09-30 09:37'
labels:
  - lead
dependencies:
  - CF-51
priority: Low
type: task
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-51 round-2 review, 2026-09-30. After CF-51, the rules for the lead building a change itself are spread across step 3 (file a card, focus, cut a worktree, land by PR) and step 4 (review-round without fix, a refuter for missing gates, a re-check of the fix commit, review depth). Step 4 is now about 13 sentences on one line, holding three branches (auth, own build, everyone else's build) that don't name each other. The CF-51 spec's placements were approved, so moving them needs the human's decision on placement under the six-step and 60-line limits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The human's decision on where the own-build rules live is recorded here
- [ ] #2 If moved, lead.md states every CF-51 own-build rule in one passage, lead-rules-contract and roster-contract pass, and bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 09:37
---
From CF-51 review round 3, 2026-09-30: fold two more rules into the consolidation: the fix-commit review (the second review-round or a refuter on the lead's own fix commit) and the override of review-round's nextStep advice on the lead's own build. Step 4 now carries two long own-build sentences plus a clause in step 3. The round-3 wording lows ('one agent and one review' next to the second review-round; 'as you ignore its gates note' pointing at a sentence that replaces the note with a refuter) belong here too.
---
<!-- COMMENTS:END -->
