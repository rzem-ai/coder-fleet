---
id: CF-113
title: Warn in --check on a disabledAgents name that matches no fleet agent
status: To Do
assignee: []
created_date: '2026-10-04 09:23'
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
