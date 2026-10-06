---
id: CF-133
title: Unit-test worktreeLaneStop and give failure tables a known-good row
status: To Do
assignee: []
created_date: '2026-10-05 09:50'
updated_date: '2026-10-06 00:00'
labels: []
dependencies: []
references:
  - CF-127
priority: Low
type: chore
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the coder on CF-127. workflow-logic covers worktreeLaneStop only through whole-workflow runs, and a failure table with gitDir missing from most rows masked two mutants until 1fb6524. A direct unit test, plus a shared good-row pattern in which each failure row breaks exactly one field, would stop this happening again in the other failure tables. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 workflow-logic.mjs has direct cases for worktreeLaneStop, each breaking one field of a known-good report
- [ ] #2 The failure tables in workflow-logic.mjs build each row from a shared good row with one field changed, and a control row passes
- [ ] #3 check-all.sh is green
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->
