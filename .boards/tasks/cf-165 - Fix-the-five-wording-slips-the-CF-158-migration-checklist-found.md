---
id: CF-165
title: Fix the five wording slips the CF-158 migration checklist found
status: In Progress
assignee: []
created_date: '2026-10-18 08:22'
updated_date: '2026-10-18 08:40'
labels: []
dependencies: []
type: docs
ordinal: 302000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-18: "fix the wording slips". These are the five lows from the migration-checklist review recorded in CF-158 comment #9.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claude/coder-fleet/agents/lead.md and opencode/coder-fleet/agent/lead.md tell the lead to save an article returned above a handoff by any read-only agent that returns one (reviewer, researcher, refuter, evaluator where it exists)
- [ ] #2 run-article SKILL.md (both copies) states accurately which agents preload it and which return articles rather than writing them, without claiming their frontmatter forbids file creation
- [ ] #3 The comment at claude/coder-fleet/agents/lead.md lines 9-10 names only the board server
- [ ] #4 opencode compound and run-article skills no longer name a memory destination the port lacks
- [ ] #5 opencode/coder-fleet/agent/researcher.md says where durable findings go (a heading the OpenCode lead acts on), or drops the instruction
- [ ] #6 Vendored copies stay in sync, and bash claude/evals/lib/check-all.sh passes
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
created: 2026-10-18 08:40
---
Sub-issue 1 of 1: ready to merge in PR #98 (v0.41.4). Done still needs: the human to merge #98, after #97 (CF-159, v0.41.3), with a rebase on the version lines; then the tag.

Evidence:
- Review round 1 asked for changes: the OpenCode run-article description said 'Preloaded'; the researcher's register row said 'Ported'.
- Fix commit 833fc77 changes exactly those 3 lines, read by the lead. Prose only, so no refuter.
- CI 'deterministic' passed in 3m35s on 833fc77.
- opencode unit: 56 pass, 0 fail.

Not done: nothing merged yet.
---
<!-- COMMENTS:END -->
