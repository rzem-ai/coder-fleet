---
id: CF-101
title: Harden the board fork's boolean config parsing
status: To Do
assignee: []
created_date: '2026-09-30 09:55'
updated_date: '2026-09-30 14:03'
labels:
  - board
dependencies:
  - CF-24.3
priority: Medium
type: bug
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-24.3 review, 2026-09-30. file-system/operations.ts parseConfig tests `value.toLowerCase() === "true"` on the raw value, so `require_acceptance_criteria: "true"` or `true # on` parses as false. On CF-24.3's key, a typo silently turns off the whole criteria requirement; the same applies to every boolean key. Also from the review: when require_acceptance_criteria is on, the MCP task_create schema (mcp/utils/schema-generators.ts:170, which already receives the config) could mark acceptanceCriteria required with at least one item, so agents learn the rule before their first refusal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every boolean config key accepts true, false, a quoted "true"/"false" and a trailing comment, and anything else is refused at load with a message naming the key, with fork tests
- [ ] #2 With require_acceptance_criteria on, the MCP task_create schema marks acceptanceCriteria required with minItems 1, with a test
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
