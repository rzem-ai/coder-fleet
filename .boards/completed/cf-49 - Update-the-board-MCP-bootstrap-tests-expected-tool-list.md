---
id: CF-49
title: Update the board MCP bootstrap test's expected tool list
status: Done
assignee: []
created_date: '2026-09-27 07:44'
updated_date: '2026-10-07 03:56'
labels:
  - outcome/superseded
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
- [x] #1 mcp-server.test.ts bootstrap case lists every registered tool and passes
- [x] #2 mcp-server.test.ts is in BOARD_TESTS in check-all.sh
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-07 03:54
---
Closed 2026-10-07 on the human's word after a sweep of To Do against main: fixed by CF-129 (PR #79, v0.39.2), which filed the same fault later. Evidence: 1, mcp-server.test.ts:114-117 lists board_serve, board_url, board_stop and task_focus, and `bun test src/test/mcp-server.test.ts` passed 4 of 4 on CF-129's branch; 2, check-all.sh:201 has mcp-server.test.ts in BOARD_TESTS. Definition of Done: met by CF-129's release (CI SUCCESS on 14692cc, v0.39.2 tagged and pushed); 3, 5, 6 not applicable.
---
<!-- COMMENTS:END -->
