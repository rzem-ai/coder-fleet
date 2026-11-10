---
id: CF-189
title: Give the lead a rule for a project that gitignores .claude/agent-memory/
status: To Do
assignee: []
created_date: '2026-11-10 04:28'
labels: []
dependencies: []
references:
  - claude/coder-fleet/agents/lead.md
  - CF-187
  - CF-183.2
priority: Medium
type: enhancement
ordinal: 319000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 2026-11-10, from CF-187's review: lead.md step 5 tells the lead to commit what changed under `.claude/agent-memory/` with each item's work, but once /init's step 2a ignores that directory `git add` refuses those paths. Interacts with CF-183.2, which moves memory into the state worktree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md says what the lead does with agent memory when `.claude/agent-memory/` is ignored by a project `.gitignore`: it neither force-adds it nor reports the refusal as a failure
- [ ] #2 Where CF-183.2 has landed, the rule also covers memory written to the state worktree in an ignoring project
- [ ] #3 `migration-checklist` findings are in the PR, since an agent body changes
- [ ] #4 `bash claude/evals/lib/check-all.sh` passes
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
