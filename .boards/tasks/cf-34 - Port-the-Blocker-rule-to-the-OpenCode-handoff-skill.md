---
id: CF-34
title: Port the Blocker rule to the OpenCode handoff skill
status: To Do
assignee: []
created_date: '2026-09-27 04:26'
updated_date: '2026-09-30 14:02'
labels: []
dependencies:
  - CF-31
references:
  - opencode/coder-fleet/skill/handoff/SKILL.md
  - docs/plans/CF-31.md
priority: Low
type: enhancement
ordinal: 227000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CF-31 plan open question 8, approved 2026-09-27. CF-31 changes the Claude Code handoff skill (Blocker: only for a question only the human can answer, with a worked example of a must-fix finding that is not a blocker). `opencode/coder-fleet/skill/handoff/SKILL.md` is the port's copy and drifts until it follows. Port work traces to the Claude tree (AGENTS.md "The ports"); a deliberate difference is a divergence-register row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 opencode/coder-fleet/skill/handoff/SKILL.md carries the CF-31 Blocker rule and worked example, or a divergence-register row says why not
- [ ] #2 The OpenCode invariant tests pass
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
