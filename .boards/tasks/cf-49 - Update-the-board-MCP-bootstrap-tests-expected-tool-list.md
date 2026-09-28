---
id: CF-49
title: Update the board MCP bootstrap test's expected tool list
status: To Do
assignee: []
created_date: '2026-09-27 07:44'
labels: []
dependencies: []
priority: Low
type: bug
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-27 and CF-43 coders, 2026-09-27. board/src/test/mcp-server.test.ts "McpServer bootstrap > createMcpServer wires stdio-ready instance" has been failing on main since board_serve, board_url and task_focus landed, because its expected tool list predates them; CF-43 adds board_stop. The test is not in BOARD_TESTS, so check-all and CI never saw it, and every full-suite baseline carries it as one of the four known failures. Update the list, then add the file to BOARD_TESTS so the next tool addition fails loudly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 mcp-server.test.ts bootstrap case lists every registered tool and passes
- [ ] #2 mcp-server.test.ts is in BOARD_TESTS in check-all.sh
<!-- AC:END -->
