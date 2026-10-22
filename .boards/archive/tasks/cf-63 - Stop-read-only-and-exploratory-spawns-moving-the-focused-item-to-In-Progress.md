---
id: CF-63
title: Stop read-only and exploratory spawns moving the focused item to In Progress
status: To Do
assignee: []
created_date: '2026-09-28 13:59'
updated_date: '2026-09-30 14:03'
labels: []
dependencies: []
priority: Medium
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen 2026-09-28: CF-12.3 sat in In Progress for a day with nothing built, moved there on 2026-09-27 by SubagentStart when an agent was spawned to draft its plan while the checkout was focused on it. board-conventions says a scout or exploratory spawn is not board work and the lead should clear the focus first, but nothing enforces that, so any spawn in a focused checkout pulls the item into In Progress. Make SubagentStart move the item only for agent types that build (coder, scripter, and any others the design names), and only bind, log and never move for scout, researcher and similar read-only agents. Record the choice in the hooks README and board-conventions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a scout or researcher spawned in a focused checkout leaves the card in its column and logs why, and a coder spawn still moves it, proven by contract cases that failed first
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
