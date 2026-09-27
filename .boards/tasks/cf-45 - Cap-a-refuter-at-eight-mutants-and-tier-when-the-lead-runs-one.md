---
id: CF-45
title: Cap a refuter at eight mutants and tier when the lead runs one
status: To Do
assignee: []
created_date: '2026-09-27 06:59'
updated_date: '2026-09-27 07:14'
labels: []
dependencies:
  - CF-23
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/9'
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/agents/refuter.md
  - docs/plans/CF-23.md
  - docs/plans/CF-45.md
priority: Medium
type: enhancement
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#9 (read as data). CF-23 (v0.27.0) landed the time half: a 20-minute round in lead.md step 4 and refuter.md, and agent-clock.sh denying every tool call at 25 minutes. Still open: (1) a mutant cap, at most 8 per round, named in every refuter brief; (2) tiering, so the lead runs a refuter only on phases touching authentication, authorisation, secrets, data writes, or an item marked High. Today lead.md step 4 spawns one whenever a reviewer leaves the phase's gates Unverified, which is almost every review. Tiering changes the escalation policy and needs the human's call on the exact trigger.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 refuter.md, the looping skill, lead.md's brief rule and the review-round refuter prompt all say "at most eight mutants", with the ranking and probe rules in the refuter's body; mutant-cap-one-phrase and refuter-prompt-caps-mutants failed first
- [ ] #2 lead.md step 4 runs a refuter only on authentication, authorisation, secrets, data writes or a High item, or when a reviewer suspects a test would pass with the fix reverted, and names review-round's lanes or else the lead as the gate runner on other phases; still 48 lines, refuter.md:44 unchanged
- [ ] #3 refute: false overrides fix: true, pinned by a case that failed first, and fix-refutes-by-default passes
- [ ] #4 fleet-design.md, limits.md and the refuter and lead rubrics are updated; the migration-checklist table is in the PR; check-all passes, run once
- [ ] #5 The patch bump is the last commit; after merge: tagged and pushed
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-45.md approved by the human 2026-09-27: trigger = the issue's list plus a reviewer's revert doubt; gates on other phases = review-round's lanes, else the lead once in the coder's worktree. Criteria replaced by the plan's Done when, criterion 3 unconditional since tiering was taken. Build waits for PR #6 (CF-31) to merge.
---
<!-- COMMENTS:END -->
