---
id: CF-78
title: Port CF-51's lead.md rules to the OpenCode and Codex ports
status: To Do
assignee: []
created_date: '2026-09-30 03:05'
updated_date: '2026-09-30 14:03'
labels: []
dependencies:
  - CF-51
priority: Low
type: task
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's non-goal for CF-51 (2026-09-30, card CF-51 comment #8, answer 12): the ports are out of CF-51's scope and filed as their own item. Once CF-51 lands, carry its lead.md rules (repeat asks, the size floor and lead-builds exception, the reread, Done and Not done in the human's terms) into opencode/coder-fleet and, where the Codex port has a lead, codex/coder-fleet, with any divergence recorded in that port's docs/divergence-register.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of CF-51's lead.md rules appears in the OpenCode port's lead, or has a divergence-register row with its reason
- [ ] #2 The Codex port has the same, or a divergence-register row saying it has no lead yet
- [ ] #3 The OpenCode invariant tests under opencode/test/ pass
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
