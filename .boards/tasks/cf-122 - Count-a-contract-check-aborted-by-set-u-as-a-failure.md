---
id: CF-122
title: Count a contract check aborted by set -u as a failure
status: To Do
assignee: []
created_date: '2026-10-04 13:28'
labels: []
dependencies: []
priority: Low
type: bug
ordinal: 154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-53 fix-round-3 coder, 2026-10-04: in the `claude/evals/lib/*-contract.sh` scripts, a check function that expands an unset variable under `set -u` aborts before `check()` counts it, so the check silently drops out of the totals and the suite stays green. Not audited across the other contract scripts. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every contract script's `check()` counts a check that aborts (for example by running it in a subshell) as a failed check, with a self-test that plants an unset-variable check and sees it counted as failed
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
