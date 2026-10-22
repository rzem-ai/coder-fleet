---
id: CF-176
title: Remove Codex from the supported harnesses
status: To Do
assignee: []
created_date: '2026-10-22 08:58'
labels: []
dependencies: []
priority: Medium
type: chore
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked on 2026-10-22: "remove `codex` from the supported harneses".

The human chose to delete the `codex/` tree outright (git history keeps it), with a short decisions note saying why it went and which commit to recover it from.

In scope: `codex/` (all 24 files); the README harness table and install line; AGENTS.md's intro, tree and ports paragraph; docs/fleet-design.md's repo paragraph and tree; the codex roots in claude/evals/lib/instruction-file-contract.sh and claude/evals/lib/requirements-source-contract.sh; the provenance comments in claude/scripts/spike/cf-12.1/lib/guard.sh and selftest.sh.

Out of scope: the `@codex` assignee fixtures in the board's search tests (just a test name, unrelated to the harness), and completed cards under .boards/ (history).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The codex/ directory no longer exists on main
- [ ] #2 README.md, AGENTS.md and docs/fleet-design.md list only Claude Code and OpenCode as harnesses, with no Codex row, tree entry or prose (the intro says two harnesses, not three)
- [ ] #3 No eval script or spike script on main refers to a codex/ path, and `git grep -in codex -- ':!.boards' ':!claude/coder-fleet/board/src/test'` returns only the new decisions note
- [ ] #4 docs/decisions/ has a short note saying Codex was dropped as a harness on 2026-10-22, and naming the last commit that has codex/ in it
- [ ] #5 bash claude/evals/lib/check-all.sh passes on the branch
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
