---
id: CF-164
title: Move the OpenCode port onto OpenCode 2.x
status: Done
assignee: []
created_date: '2026-10-18 08:15'
updated_date: '2026-10-19 10:04'
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
- [x] #1 Every sub-issue is Done
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-19 10:00
---
All 3 sub-issues are Done: CF-164.1 (v0.41.7), CF-164.2 (v0.41.8) and CF-164.3 (v0.42.4, PRs #110 and #111).

Done: the OpenCode port runs on OpenCode 2.x. Its enforcement plugin loads as a V2 plugin and refuses credential and scope breaches on 2.0.32, as the 23 live tests against the real binary show. It installs from a release tag with a version stamp. Missing skills show in the session.

Criterion 1 is ticked on the sub-issues' closes. Definition of Done items are ticked on the sub-issues' evidence: each passed the suite and review, and was bumped, tagged and given register rows. Items 3 and 6 are not applicable: no agent body or skill frontmatter changed in the sub-issues' PRs, and there is no spec.

Not done: the human's own OpenCode install of the plugin from a tag (`opencode plugin add 'github:rzem-ai/coder-fleet#v0.42.4::path:opencode/coder-fleet'`), which the human chose to do.
---
<!-- COMMENTS:END -->
