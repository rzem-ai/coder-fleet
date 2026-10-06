---
id: CF-141
title: Check the lead can read the Next column top card first
status: To Do
assignee: []
created_date: '2026-10-06 02:08'
labels: []
dependencies:
  - CF-140
priority: Medium
type: task
ordinal: 177000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-140 coder (2026-10-06). CF-140 tells the lead to take Next cards top of the column first, by ordinal. Nobody has checked that task_list --status Next (MCP or CLI) returns cards in ordinal order, so the rule may not work in practice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test shows task_list filtered to Next returns cards in ascending ordinal order, or the lead body names the call that does
- [ ] #2 The lead's Next rule in lead.md names how it reads the order
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
