---
id: CF-191
title: 'Polish: three wording fixes left in triage, springclean and /init after review'
status: To Do
assignee: []
created_date: '2026-11-10 04:28'
labels: []
dependencies: []
references:
  - CF-185
  - CF-186
  - CF-187.1
priority: Low
type: bug
ordinal: 321000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 2026-11-10: the Low findings left under the round cap on CF-185, CF-186 and CF-187.1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 triage.md says each close runs the project's TaskCompleted gate, which may run the whole suite, rather than saying every close takes several minutes; and its leave-it skip holds per action, not only when the leave-it is the card's latest comment
- [ ] #2 springclean.md holds a candidate for a Draft only when the Draft names it as a direct dependency (the first level of its Depends on tree), matching the direct Dependents rule; and after any task_complete error it re-lists Done to report what was cleared
- [ ] #3 init.md step 2b's report does not say board writes are committed when the board is ignored, whether step 2a chose the ignore this run or found it already in place
- [ ] #4 `bash claude/evals/lib/check-all.sh` passes
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
