---
id: CF-91
title: Decide whether the lead's size-floor build needs a tighter limit
status: To Do
assignee: []
created_date: '2026-09-30 08:46'
updated_date: '2026-09-30 14:03'
labels:
  - lead
dependencies:
  - CF-51
priority: Low
type: task
ordinal: 252000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-51 review, 2026-09-30. The human set the size floor's test as exactly three exclusions (no new endpoint, no schema change, no credential path), with "about a day of one agent" as guidance only. The only remaining limit on the lead building a change itself is "state completely in your step-3 notice", and a one-line notice can describe a 40-file refactor, a hook or CI change, or a data-only migration. The refuter's data-writes trigger and independent gates are the real guard rails, and no hook enforces the exception, since enforce-agent-scope.sh has no rule for the session agent. To decide once live runs show how the exception is used.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The human's decision on whether to add a limit (for example a file-count cap, or excluding auth, hook, CI and data-migration changes) is recorded here, with evidence from at least one live lead-built change
- [ ] #2 If a limit is added, lead.md step 4's floor definition states it and roster-contract and check-all pass
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
