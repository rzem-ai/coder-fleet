---
id: CF-2
title: Sweep the port docs for present-tense old names
status: To Do
assignee: []
created_date: '2026-09-26 12:21'
updated_date: '2026-09-30 14:02'
labels: []
dependencies: []
priority: Low
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
opencode/docs and codex/docs still say claudecode-agents and Alex in lines describing the present rather than history, for example codex/docs/specs/GPTA-1.md lines 61 and 238 and divergence-register rows 19 and 69; lines that record history stay.
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
