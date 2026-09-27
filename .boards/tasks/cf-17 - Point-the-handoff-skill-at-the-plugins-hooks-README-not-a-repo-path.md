---
id: CF-17
title: 'Point the handoff skill at the plugin''s hooks README, not a repo path'
status: To Do
assignee: []
created_date: '2026-09-27 02:26'
labels: []
dependencies: []
references:
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/hooks/README.md
priority: Low
type: bug
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-8 fix-round-3 coder. claude/coder-fleet/skills/handoff/SKILL.md:57 cites the repo-relative `hooks/README.md` item 15. The skill is preloaded into every fleet agent in every project, where that path does not exist, so the pointer leads nowhere. Say "the plugin's hooks README" (or reference it through the plugin root) instead. Skill body only; check the OpenCode copy per its divergence register.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No sentence in the handoff skill names a repo-relative path an agent in another project cannot open
- [ ] #2 check-all.sh passes
<!-- AC:END -->
