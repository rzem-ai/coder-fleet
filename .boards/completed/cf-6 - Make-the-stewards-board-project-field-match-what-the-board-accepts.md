---
id: CF-6
title: Make the steward's board project field match what the board accepts
status: Done
assignee: []
created_date: '2026-09-26 13:06'
updated_date: '2026-09-28 09:16'
labels:
  - outcome/shipped
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/pull/2'
priority: Low
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
claude/coder-fleet/agents/fleet-steward.md tells the steward to file items under the "Coder Fleet" project, but .boards/config.yml configures no projects, and the MCP task_create schema omits the project field when none are configured, so the instruction cannot be followed. Either configure projects in claude/coder-fleet/templates/board.config.yml and this repo's .boards/config.yml, or drop the instruction from the steward body.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The steward body's filing instruction and the board's accepted fields agree
- [x] #2 If the body changes, the migration-checklist skill has been run over it
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-26 14:28
---
Decided 2026-09-27 with the human: drop the instruction rather than configure projects - the project is the repository (design section 7, board-conventions). docs/fleet-design.md section 11 line 251 carries the same "Coder Fleet" project sentence and changes with it. Folded into CF-8's plan (docs/plans/CF-8.md); CF-6 closes when that phase lands.
---

author: @lead
created: 2026-09-27 02:29
---
Landed on CF-8's branch in commit 4d6031b (fleet-steward files board items without naming a project; design section 11 and rubric FS01c follow). PR #2: https://github.com/rzem-ai/coder-fleet/pull/2. Closes when it merges.
---

author: @lead
created: 2026-09-27 02:36
---
Merged with CF-8 in a84db3b (PR #2), v0.25.1. outcome/shipped. Same closing note as CF-8: no native task tools in the lead's session, so the human moves it to Done.
---

author: @lead
created: 2026-09-27 03:08
---
Both acceptance criteria ticked by the lead after merge: #1 fleet-steward.md no longer names a project (4d6031b); #2 migration-checklist run over it, table in PR #2.
---
<!-- COMMENTS:END -->
