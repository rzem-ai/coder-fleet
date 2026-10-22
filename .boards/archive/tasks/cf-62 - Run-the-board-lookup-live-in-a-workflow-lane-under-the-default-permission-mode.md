---
id: CF-62
title: Run the board lookup live in a workflow lane under the default permission mode
status: To Do
assignee: []
created_date: '2026-09-28 13:18'
updated_date: '2026-09-30 14:03'
labels: []
dependencies:
  - CF-58
priority: Medium
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-58 review round 2, 2026-09-28: the card gate (review-round fix: true) and spec-to-card's second run find the board binary with a command using $(...) and find -exec. Stubbed agents prove the logic, but nobody has run it in a real agentType-less workflow lane. Under the human's default permission mode it may prompt, and a background lane cannot answer, so the denial reads as "could not read the board" and both features would be unusable. If so, move the lookup into a small script shipped with the plugin.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 one live review-round run with fix: true on a real card reaches its card gate without a prompt, or the lookup moves into a shipped script that does
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
