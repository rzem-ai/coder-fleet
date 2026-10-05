---
id: CF-128
title: Make the in-session board honour a configured port
status: To Do
assignee: []
created_date: '2026-10-05 03:35'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board/src/mcp/server.ts
  - claude/coder-fleet/board/src/server/index.ts
  - claude/coder-fleet/board/src/cli.ts
  - claude/coder-fleet/board/src/mcp/tools/serve/index.ts
  - claude/coder-fleet/commands/board.md
priority: Medium
type: feature
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-05: "can you implement a feature which allows defining a port in config for the board feature".

Today `.boards/config.yml` already parses and validates `default_port`, and the CLI `board serve` honours `--port`, then `CODER_FLEET_BOARD_PORT`, then `default_port`, then a random port (board/src/cli.ts:306-316). The in-session board does not: `board_serve` (what `/board` calls) goes through `startWebUi` in board/src/mcp/server.ts:146, which calls `ui.start(0, ...)`, and the explicit 0 short-circuits `port ?? config.defaultPort ?? 0` in board/src/server/index.ts:410. So a configured port is ignored inside a session.

Decision the human gave in the session: when the configured port is in use, increment the port number and try again, looping until a free port is found. `findNextAvailablePort` in the server-port helpers already exists and should be reused.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With `default_port: <n>` in .boards/config.yml and <n> free, `board_serve` (and so `/board`) binds 127.0.0.1:<n> and returns that URL; a test proves it
- [ ] #2 `board_serve` honours `CODER_FLEET_BOARD_PORT` over `default_port`, the same precedence as `board serve`; a test proves it
- [ ] #3 With neither set, `board_serve` still binds a random loopback port, as today
- [ ] #4 When the configured port (from env or config) is in use, both `board_serve` and `board serve` try the next port up, looping until one is free, and the result names the port actually bound and that the configured one was busy; a test holds the configured port and proves the increment
- [ ] #5 If no port from the configured one up to 65535 is free, the board fails with an error naming the configured port, never binds a random one silently
- [ ] #6 The board_serve tool description, commands/board.md and the board-conventions skill describe the configured port, its precedence and the increment behaviour
- [ ] #7 The new tests are in BOARD_TESTS in claude/evals/lib/check-all.sh and check-all.sh is green
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
