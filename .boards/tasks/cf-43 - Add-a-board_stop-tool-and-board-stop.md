---
id: CF-43
title: Add a board_stop tool and /board stop
status: In Progress
assignee: []
created_date: '2026-09-27 06:56'
updated_date: '2026-09-27 07:15'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/15'
  - claude/coder-fleet/board/src/mcp/tools/serve/index.ts
  - docs/plans/CF-43.md
priority: Low
type: feature
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#15 (read as data). The board MCP server registers board_serve and board_url only, so the web UI can end only with the session and `/board stop` has nothing to call. Add a board_stop tool and handle `/board stop` in the command.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 board_stop stops the running UI and returns {running:false,url:null,host:null,port:null,stopped}; idempotent when nothing runs; a later board_serve starts a fresh UI on a new random port; a stop during a start wins
- [ ] #2 Stopping writes nothing to stdout and closes open WebSockets
- [ ] #3 The new mcp-serve.test.ts cases failed first and now pass, and check-all passes locally
- [ ] #4 /board stop is handled in commands/board.md, and board-conventions, README.md and the serve tool's comments say the UI ends on board_stop or with the session
- [ ] #5 NOTICE.md records the change, and the board and plugin patches are bumped, both picked at merge
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-43.md approved by the human 2026-09-27, every open question on the recommended answer. Criteria replaced by the plan's Done when. Phase 1 of 3 starting: one coder. Expect trivial NOTICE.md and board/package.json conflicts with the CF-26/27 branch, resolved at merge.
---
<!-- COMMENTS:END -->
