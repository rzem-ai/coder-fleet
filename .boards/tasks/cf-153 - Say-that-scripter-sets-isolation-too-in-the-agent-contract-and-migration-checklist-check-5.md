---
id: CF-153
title: >-
  Say that scripter sets isolation too, in the agent contract and
  migration-checklist check 5
status: To Do
assignee: []
created_date: '2026-10-06 14:37'
updated_date: '2026-10-07 03:54'
labels:
  - docs
dependencies: []
priority: Low
type: docs
ordinal: 281000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the coder on CF-12.3, 2026-10-07. docs/agent-contract.md and the migration-checklist skill's check 5 both say only `coder` sets `isolation` in its frontmatter, but `scripter` sets it too (it gets its own worktree, as observed live). The text was already wrong before CF-12.3 and the pass over both new bodies had to read around it. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/agent-contract.md names every agent whose frontmatter sets isolation, read from the agent files rather than from memory, and the migration-checklist skill's check 5 says the same list
- [ ] #2 bash claude/evals/lib/check-all.sh passes on the branch
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-07 03:54
---
Triage 2026-10-07 against main, recorded on the human's word: partly met, nothing ticked. docs/agent-contract.md:25 and :40 already say coder and scripter set isolation (the only two agent files that do). Still open: claude/coder-fleet/skills/migration-checklist/SKILL.md:60 still says only coder sets isolation.
---
<!-- COMMENTS:END -->
