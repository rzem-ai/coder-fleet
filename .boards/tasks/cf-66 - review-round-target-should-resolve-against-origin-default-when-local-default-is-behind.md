---
id: CF-66
title: >-
  review-round target should resolve against origin/<default> when local default
  is behind
status: To Do
assignee: []
created_date: '2026-09-29 12:28'
updated_date: '2026-09-30 14:03'
labels: []
dependencies: []
references:
  - CF-3
priority: Low
type: enhancement
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-3 reviewer (2026-09-29). With CF-3, `target: <branch>` resolves to `<local default>...<branch>`. If local `main` is behind `origin/main`, the merge-base is older, so the diff picks up upstream commits that the branch merged in. Decide whether `target` should resolve against `origin/<default>`, and how to behave when there is no remote.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provisional: the spec settles what done means here, and its criteria replace this one
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
