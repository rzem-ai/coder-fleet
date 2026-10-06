---
id: CF-147
title: >-
  Rename the board-conventions skill to help-boards so /board no longer
  autocompletes to it
status: To Do
assignee: []
created_date: '2026-10-06 06:38'
labels: []
dependencies: []
references:
  - claude/coder-fleet/skills/board-conventions/SKILL.md
priority: High
type: chore
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked (2026-10-06): "please rename `board-conventions` to `help-boards`. Why? Because when I type `/board` it comes up first and it is selected by accident." Ordered.

The skill lives at claude/coder-fleet/skills/board-conventions/. Its name appears in agent frontmatter `skills:` lists (every agent that preloads it), in agent-pairs sources, in lead.md and other bodies, in commands, docs, hooks READMEs, evals (roster-contract, instruction-file-contract, next-column-contract) and the OpenCode port. A rename that misses one reference silently drops the skill from that agent, which is the migration-checklist's main silent failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The skill directory and its frontmatter name are help-boards, and a grep for board-conventions over the repo outside .boards/, docs/runs/ and git history finds nothing
- [ ] #2 Every agent that preloaded board-conventions preloads help-boards, with agent-pairs sources updated and regenerated, and the migration checklist run over every changed body
- [ ] #3 The OpenCode port's copy is renamed the same way, or the divergence register says why not
- [ ] #4 check-all is green and the version is bumped
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
