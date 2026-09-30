---
id: CF-13
title: Name scripter in kickoff's preflight agent list
status: To Do
assignee: []
created_date: '2026-09-27 01:52'
updated_date: '2026-09-30 14:02'
labels: []
dependencies: []
references:
  - claude/coder-fleet/commands/kickoff.md
  - claude/evals/lib/roster-contract.sh
priority: Low
type: bug
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-12 spec-writer and seen in the 2026-09-27 kickoff. claude/coder-fleet/commands/kickoff.md:12 lists the agents preflight expects as coder-fleet: types and names ten, leaving out scripter, so a missing scripter passes preflight. CF-9 and CF-12 both edit kickoff.md; land this with or after them, and check whether a contract should pin the list against the roster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kickoff.md's preflight names every agent in the roster, scripter included
- [ ] #2 The roster contract or a new check fails if the list and the roster disagree, or the item says why not
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
