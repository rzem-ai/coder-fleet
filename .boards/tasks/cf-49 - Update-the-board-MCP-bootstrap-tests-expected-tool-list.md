---
id: CF-49
title: Update the board MCP bootstrap test's expected tool list
status: To Do
assignee: []
created_date: '2026-09-27 07:44'
updated_date: '2026-09-30 14:03'
labels: []
dependencies: []
priority: Low
type: bug
ordinal: 235000
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

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->
