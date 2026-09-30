---
id: CF-103
title: Enforce that only the lead ticks criteria and Definition of Done items
status: To Do
assignee: []
created_date: '2026-09-30 10:00'
updated_date: '2026-09-30 14:03'
labels:
  - hooks
dependencies:
  - CF-24.1
priority: Medium
type: enhancement
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-24.1 review, 2026-09-30. CF-24.1 writes 'only the lead ticks' into the rules, but it is prose only: fleet-steward holds task_edit (and Bash, so the board CLI) and could tick. A scope-hook rule could deny acceptanceCriteriaCheck and definitionOfDoneCheck on task_edit, and the matching CLI flags, to every agent but the lead. Also from the same review: add lead-rules-contract guards for CF-24.1's step-5 fixed first line and tick rule, as CF-51 did for its phrases.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 enforce-agent-scope.sh denies ticking (MCP task_edit acceptanceCriteriaCheck / definitionOfDoneCheck, and the board CLI's check flags) to every agent but the lead, with contract cases
- [ ] #2 lead-rules-contract.sh guards step 5's fixed first line and the only-the-lead-ticks rule, with self-test mutants
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 10:17
---
From CF-24.1's review round 2 (2026-09-30): also pin fleet-steward.md step 2's sentence 'Every item you file carries acceptance criteria ...' in a deterministic check, with the step 5 guards. The refuter's round-1 survivor shows it can be deleted with no check failing.
---
<!-- COMMENTS:END -->
