---
id: CF-164
title: Move the OpenCode port onto OpenCode 2.x
status: Next
assignee: []
created_date: '2026-10-18 08:15'
updated_date: '2026-10-18 08:55'
labels:
  - ports
dependencies: []
priority: High
type: feature
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-18, via AskUserQuestion: the port targets "v2.x (Recommended)". Background from research the same day: OpenCode 2.x docs say "V1 plugin implementations do not run in V2" (opencode.ai/v2/docs/build/plugins/migrate-v1/). The port pins 1.18.30 and its enforcement plugin opencode/coder-fleet/plugin/fleet.ts is a V1 plugin, while the human runs v2.0.32, so enforcement is probably inert on the human's machine. 2.x discovers the singular agent/, command/ and skill/ directories, reads AGENTS.md but not CLAUDE.md, renames the config key plugin to plugins, and has `opencode plugin add/check/update` with git specs (`github:owner/repo#ref::path:subdir`). Split into sub-issues.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every sub-issue is Done
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
