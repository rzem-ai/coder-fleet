---
id: CF-171
title: >-
  Seed a project's Definition of Done from the project, not from coder-fleet's
  release list
status: To Do
assignee: []
created_date: '2026-10-22 08:55'
labels:
  - board
  - lead
dependencies: []
priority: Medium
ordinal: 295000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, after asking whether the plugin held the work back on Fathom FTH-285: "create cards for all those issues in coder-fleet please".

Seen on Fathom, 22 Oct 2026: /init seeded Fathom's .boards/config.yml definition_of_done with coder-fleet's own release list - check-all.sh, a migration-checklist run, the plugin.json and marketplace.json version bump and tag, the port divergence register. None exists in Fathom. Every card carries them, and the TaskCompleted hook blocked FTH-285.7's close, moved the card to Blocked and listed six unticked items, until the lead ticked each as not applicable.

The list is right for this repository and wrong for every project /init sets up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /init and /kickoff write a project-neutral definition_of_done (reviewer approved; refuter where lead step 4 calls for one; the project's declared gates green; spec linked where there is one) and never coder-fleet's own release steps
- [ ] #2 /init offers the project's gates block from AGENTS.md as the gates item when one exists
- [ ] #3 /kickoff on a project whose board already carries coder-fleet's release items says so and offers to replace them, changing nothing without the human's yes
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
