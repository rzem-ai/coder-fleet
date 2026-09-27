---
id: CF-43
title: Add a board_stop tool and /board stop
status: To Do
assignee: []
created_date: '2026-09-27 06:56'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/15'
  - claude/coder-fleet/board/src/mcp/tools/serve/index.ts
priority: Low
type: feature
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#15 (read as data). The board MCP server registers board_serve and board_url only, so the web UI can end only with the session and `/board stop` has nothing to call. Add a board_stop tool and handle `/board stop` in the command.
<!-- SECTION:DESCRIPTION:END -->
