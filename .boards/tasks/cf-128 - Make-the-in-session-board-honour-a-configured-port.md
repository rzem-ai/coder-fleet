---
id: CF-128
title: Make the in-session board honour a configured port
status: In Progress
assignee: []
created_date: '2026-10-05 03:35'
updated_date: '2026-10-05 03:56'
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

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-05 03:35
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-7.

Done: card filed from the human's ask, with the human's busy-port decision (increment and retry until free) recorded. Not done: the in-session board still ignores a configured port; nothing is built yet. A coder is being briefed now.
---

author: @SubagentStop
created: 2026-10-05 03:56
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-128-board-port`, cut from origin/main (fc5bd80) in worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a61e092d0a202ea23`; I checked first that the worktree was linked and clean.
- Commit `b0af7f7` "Board: board_serve and board serve share one port resolution, moving up from a busy configured port (CF-128)".
- Commit `e1d8784` "Document the configured board port, its precedence and the move-up rule; board 0.1.8 (CF-128)".
- Commit `5931826` "v0.33.0: the in-session board honours a configured port and moves up from a busy one (CF-128)".
- The fix: `board_serve` and `board serve` now pick the port with one shared function, `resolveBoardPort` in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a61e092d0a202ea23/claude/coder-fleet/board/src/server/port.ts`. The order is `--port`, then the env var, then `default_port`, then random; 0 means random, and a value that isn't a port is an error naming where it came from.
- Busy port: the loop is `BacklogServer.bindFrom` in `src/server/index.ts`. It tries to bind, and on EADDRINUSE asks `findNextAvailablePort` (now host-aware via an optional third argument) for the next free port and tries again. The bind decides, so a port taken between check and bind just moves up again.
- No more process exit: `start` used to call `process.exit(1)` on a busy port, which would have killed the session's MCP server. It now throws, and the CLI's existing top-level catch prints the message and exits 1.
- `--port` stays exact (your choice to make): a busy `--port` fails naming the port rather than moving up, because criterion 4 only covers env and config, and someone typing a flag wants that port.
- What `board_serve` returns: when running, it adds `portSource`, plus `configuredPort`, `configuredPortBusy` and a `note` naming both ports when it moved up. The not-running and `board_stop` shapes are unchanged, and `src/mcp/server.ts` now calls `start(undefined, ...)`.
- Criterion 1: `mcp-serve.test.ts` "configured port > (1)"; `board-port.test.ts` "binds default_port from the config when it is free".
- Criterion 2: `mcp-serve.test.ts` "(2)"; `board-port.test.ts` "binds the env port over default_port" and the "takes the env over the config" resolver case.
- Criterion 3: `mcp-serve.test.ts` "(3)" plus the existing random-port tests; `board-port.test.ts` "binds a random port with no flag, env or config".
- Criterion 4: `mcp-serve.test.ts` "(4)"; `board-port.test.ts` "moves up from a busy default_port…", "moves up from a busy env port too", and the CLI test "moves up from a busy CODER_FLEET_BOARD_PORT and says the configured port was busy".
- Criterion 5: `mcp-serve.test.ts` "(5)"; `board-port.test.ts` "fails naming the configured port when nothing from it up to 65535 is free, and binds nothing".
- Criterion 6: `board/src/mcp/tools/serve/index.ts` (tool descriptions and header comment), `claude/coder-fleet/commands/board.md`, and `claude/coder-fleet/skills/board-conventions/SKILL.md` (CLI table row and web UI paragraph).
- Criterion 7: `src/test/board-port.test.ts` added to `BOARD_TESTS` in `claude/evals/lib/check-all.sh`; check-all green.
- Also changed: `board/NOTICE.md` records the change from upstream under "Behaviour changed after import"; the board package went from 0.1.7 to 0.1.8 so `/board`'s version check flags an old binary; the plugin went to 0.33.0 in both `plugin.json` and `marketplace.json`.
- Test fixture: the `mcp-serve` fixture writes upstream's `default_port: 6420`, which production never writes. `beforeEach` now clears it so the old tests run against a real fleet config.
- Ran `bun install --frozen-lockfile` in the board directory. Baseline `bun test` on `mcp-serve`, `serve-board` and `server-port` gave 28 pass, 0 fail.
- Watched fail first: with a stub `port.ts`, all five new MCP tests failed for the right reasons (env and config ignored, random port instead of the error). `board-port.test.ts` failed on every resolver case, then the run crashed on the first busy-port case through the old `process.exit`.
- Final runs: `bunx tsc --noEmit` exit 0; `bun test` on the four port and serve files gave 48 pass, 0 fail; `biome format --write` on my three changed files; check-all run once and captured to `check-all.out` in the scratchpad.
- Mutation round: six mutants budgeted, six run, all killed, and the tree was clean after reverting.
- Mutant `--port` allowed to move up: killed by "keeps an explicit port exact" and the CLI "exits non-zero naming the port when an explicit --port is busy".
- Mutant `startWebUi` put back to `start(0)`: killed by MCP (1), (2), (4) and (5); (3) rightly survives, since 0 is still a random request.
- Mutant where running out of ports falls back to random: killed by both exhaustion tests.
- Mutant with env and config order swapped: killed by four tests.
- Mutant with `busy` forced to false: killed by four tests, including the CLI one.
- Mutant with the resolver's upper bound removed: killed by the "refuses a value that is not a port" resolver test.
---

created: 2026-10-05 03:56
---
Sub-issue 1 of 1: built, in review as PR #57 (branch cf-128-board-port, v0.33.0). Done still needs: criteria 1-7 proven on main.

Done: the coder reports that a configured port (default_port or CODER_FLEET_BOARD_PORT) is now used by /board and by `board serve`, that a busy one moves up to the next free port and says so, that it errors at 65535, and that check-all is green. Not done: not reviewed, not merged and not released, so /board still ignores a configured port. Even after merge, the installed ~/.local/bin/board must be rebuilt before sessions see it. Choice made by the coder: an explicit --port flag stays exact and fails if busy, rather than moving up. A garbage default_port is now an error instead of being ignored.
---
<!-- COMMENTS:END -->
