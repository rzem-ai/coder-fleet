---
id: CF-11
title: Re-sync the OpenCode glossary's Board meaning with its source
status: To Do
assignee: []
created_date: '2026-09-27 01:34'
labels: []
dependencies: []
references:
  - opencode/coder-fleet/skill/glossary/SKILL.md
  - claude/coder-fleet/skills/glossary/SKILL.md
  - opencode/docs/divergence-register.md
priority: Low
type: docs
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-9 planner. `opencode/coder-fleet/skill/glossary/SKILL.md` gives the Board term's meaning as "The Tasks database" where the source skill `claude/coder-fleet/skills/glossary/SKILL.md` says "The tracked items". `opencode/docs/divergence-register.md:18` claims the port keeps every term and every meaning verbatim, so the register is currently false. Older drift, out of CF-9's scope; CF-9 touches the same row only to change "doing" to "in progress".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every meaning in the OpenCode glossary matches the source verbatim, or the register row records the divergence and its reason
- [ ] #2 opencode/test invariant tests pass
<!-- AC:END -->
