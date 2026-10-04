---
id: CF-113
title: Warn in --check on a disabledAgents name that matches no fleet agent
status: To Do
assignee: []
created_date: '2026-10-04 09:23'
updated_date: '2026-10-04 09:58'
labels: []
dependencies:
  - CF-111
priority: Low
type: enhancement
ordinal: 145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 reviewer, 2026-10-04. A hand-edited misspelling in `.claude/coder-fleet.json` (e.g. `refutor`) silently disables nothing. CF-111.1's command refuses unknown names, but only for edits made through the command. `enforce-disabled-agents.sh --check`, and so check-all, should warn on a name that matches no file under the plugin's `agents/` directory. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `enforce-disabled-agents.sh --check` reports a `disabledAgents` entry that names no agent under the plugin's agents/ directory, naming the entry, and a contract test covers it
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

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-04 09:58
---
The human ordered this, 2026-10-04 ('go ahead with CF-113 too'). Plan: it starts when CF-111's fix round (`cf-111-fix-1`) hands back, on a branch from that tip, because it edits the same `hooks/lib/fleet-config.sh` and `enforce-disabled-agents.sh --check` the fix round has open. It ships in the same 0.30.0 PR and is covered by CF-111's round 2 review and refuter. Lead decisions for the build: (1) an unknown name is a warning, not an error: `--check` prints a line naming the entry and still exits 0, and the file stays valid. Its entry was already harmless, because it disables nothing; failing would break a project that lists an agent a newer plugin version adds. (2) The roster comes from the same source as CF-111.1's `fleet-agents.sh` (the plugin's `agents/*.md` with `-fable` folded in), moved into `fleet-config.sh` so the command and `--check` share one roster function.
---
<!-- COMMENTS:END -->
