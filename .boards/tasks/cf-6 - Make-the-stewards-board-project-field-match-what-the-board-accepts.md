---
id: CF-6
title: Make the steward's board project field match what the board accepts
status: To Do
assignee: []
created_date: '2026-09-26 13:06'
labels: []
dependencies: []
priority: Low
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
claude/coder-fleet/agents/fleet-steward.md tells the steward to file items under the "Coder Fleet" project, but .boards/config.yml configures no projects, and the MCP task_create schema omits the project field when none are configured, so the instruction cannot be followed. Either configure projects in claude/coder-fleet/templates/board.config.yml and this repo's .boards/config.yml, or drop the instruction from the steward body.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The steward body's filing instruction and the board's accepted fields agree
- [ ] #2 If the body changes, the migration-checklist skill has been run over it
<!-- AC:END -->
