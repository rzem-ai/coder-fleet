---
id: CF-154
title: Tidy the listings and wording that docs/board-config.md exposed
status: To Do
assignee: []
created_date: '2026-10-06 14:38'
labels:
  - docs
  - board
dependencies: []
priority: Low
type: docs
ordinal: 282000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the tech-writer on CF-151, 2026-10-07. Three loose ends from writing docs/board-config.md: (a) the page is not listed in the README repo map or the AGENTS.md docs tree, so the listings no longer match the directory; (b) the board refuses an item's `project` field until a `projects:` list exists in config.yml (backlog.ts about line 675), while the help-boards skill says "there is no list to be on", and the two could disagree for a monorepo user; (c) this repo's own .boards/config.yml says `zero_padded_ids: 00`, which parses to 0 and pads nothing, and the human should decide between a real width and dropping the key. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 README.md's repo map and AGENTS.md's docs tree both list docs/board-config.md
- [ ] #2 The help-boards skill's sentence on the project field says what the board does when no projects list is configured, matching docs/board-config.md
- [ ] #3 This repo's .boards/config.yml either sets zero_padded_ids to the width the human chose or drops the key, as the human decided on this card
- [ ] #4 bash claude/evals/lib/check-all.sh passes on the branch
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
