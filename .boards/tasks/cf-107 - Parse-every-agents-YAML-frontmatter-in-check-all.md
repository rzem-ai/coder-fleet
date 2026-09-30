---
id: CF-107
title: Parse every agent's YAML frontmatter in check-all
status: To Do
assignee: []
created_date: '2026-09-30 14:20'
labels:
  - evals
dependencies: []
priority: Medium
ordinal: 138000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-53 (2026-10-01): an unquoted `Requirements source: <path>` in spec-writer.md's description put a colon-space in a YAML value, and the frontmatter stopped parsing. roster-contract passed anyway, so the agent would have shipped with a broken description. check-all should fail when any agent's or skill's frontmatter doesn't parse as YAML.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-all fails, naming the file, when any file under claude/coder-fleet/agents/ or a skill's SKILL.md has frontmatter that does not parse as YAML, shown by a case seen failing first
- [ ] #2 Every current agent and skill passes
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
