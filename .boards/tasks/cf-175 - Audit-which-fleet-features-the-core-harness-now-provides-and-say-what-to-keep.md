---
id: CF-175
title: 'Audit which fleet features the core harness now provides, and say what to keep'
status: To Do
assignee: []
created_date: '2026-10-22 08:55'
labels:
  - lead
  - docs
dependencies: []
priority: Medium
ordinal: 299000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, after asking whether the plugin held the work back on Fathom FTH-285: "create cards for all those issues in coder-fleet please".

Alex, the same day: "There have been updates to the core Claude Code harness and I want to know whether to continue work on the plugin". The lead's answer from the FTH-285 session: the independent review and the card discipline earned their keep (two user-facing defects caught that both coders' green tests missed), while worktree isolation for subagents, the Workflow tool, the artifact canvas and code review now exist in the harness itself. Narrow the plugin to what only it does.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A document under docs/ lists each fleet feature (agent definitions, worktree isolation, the board and its hooks, review-round, spec-to-card, deep-research, agent memory, run articles, the scope and worktree guards, prune-worktrees) against what the current harness provides natively, with keep, thin or drop for each and the reason
- [ ] #2 Each drop or thin recommendation names the cards it would close or make moot
- [ ] #3 Alex decides from the document; nothing is removed by this card
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
