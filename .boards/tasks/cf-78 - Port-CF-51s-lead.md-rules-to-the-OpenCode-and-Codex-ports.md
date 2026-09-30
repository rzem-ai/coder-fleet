---
id: CF-78
title: Port CF-51's lead.md rules to the OpenCode and Codex ports
status: To Do
assignee: []
created_date: '2026-09-30 03:05'
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
