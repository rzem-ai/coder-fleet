---
id: CF-128
title: Make the in-session board honour a configured port
status: In Progress
assignee: []
created_date: '2026-10-05 03:35'
updated_date: '2026-10-05 07:15'
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
- [ ] #8 An explicit `board serve --port <n>` that is busy also moves up to the next free port, the same as env and config, and says the requested port was busy; a test holds <n> and proves it
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
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

created: 2026-10-05 04:22
---
Sub-issue 1 of 1: ready to merge in PR #57. Done still needs: criteria 1-7 proven on main (merge), DoD 4 (release tag), and the installed ~/.local/bin/board rebuilt.

Done: review-round approved 48baf7a...5931826 with no blocking findings (verdict: approve with follow-ups). The tests lane ran board-port.test.ts and mcp-serve.test.ts (34 pass, 0 fail), and the types and build lane ran tsc and build.sh clean. The lead ran the full `bash claude/evals/lib/check-all.sh` independently in the PR worktree at 5931826: exit 0, board 252 pass 0 fail, versions 0.33.0. No refuter: no lead.md step 4 trigger (no auth, secrets or data writes; Medium; the reviewer found every new test would fail on revert). Two lows dropped as no fix round ran: the exhaustion branch below 65535 is untested (server/index.ts:652), and a stale header comment in mcp-serve.test.ts:15.

Not done: not merged, so /board in a session still ignores a configured port. After merging, ~/.local/bin/board must be rebuilt before sessions see it. 0.33.0 assumes #56 (0.31.0) and CF-127 (0.32.0) land first.
---

created: 2026-10-05 04:22
---
Definition of Done ticks, by the lead. #1: the lead's own `bash claude/evals/lib/check-all.sh` run on cf-128-board-port at 5931826 exited 0 (board 252 pass, 0 fail). #2: review-round verdict approve with follow-ups, no blocking findings; no refuter round, since lead.md step 4 sets no trigger (no auth, secrets or data writes, not High, and no revert-pass suspicion). #3 not applicable: no agent body and no skill frontmatter changed; the board-conventions edit is body-only. #5 not applicable: opencode/coder-fleet has no skills, commands or board serve code, so no ported artefact changed. #6 not applicable: no spec; the card's criteria came from the human's ask. Still open: #4 (merge, release tag and push).
---

created: 2026-10-05 07:03
---
Decisions from the human, 2026-10-05, in the session. (1) The --port flag: "Move up like config" - a busy explicit --port increments the same way a configured port does, replacing the coder's exact-port choice; criterion 8 added. (2) Merge order: "Wait for #56 + CF-127" - PR #57 merges after PR #56 (0.31.0) and CF-127 (0.32.0), keeping 0.33.0.

Sub-issue 1 of 1: back in a fix round on PR #57 for criterion 8. Done still needs: criteria 1-8 proven on main, DoD 4. The fix round also takes the two dropped lows, since a round is now running anyway.
---

author: @SubagentStop
created: 2026-10-05 07:15
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-128-board-port` in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a61e092d0a202ea23`, three commits on top of `5931826`, pushed as `5931826..1aff940`. I reread the card first, including the new criterion 8.
- Commit `d89e09b` "Board: a busy explicit --port moves up like env and config, and the probe-exhausted branch is tested (CF-128 fix round)". `bindFrom` in `src/server/index.ts` now moves up for every source except random. A new `askedPortWord` in `src/server/port.ts` makes the busy note and the out-of-ports error say "requested" for `--port` and "configured" for env or config. The `--port` help text in `src/cli.ts` and the comments that called `--port` exact are updated.
- Criterion 8 proof: in `src/test/board-port.test.ts`, "moves up from a busy explicit port too, and says the requested port was busy" holds the port and checks the move up. The CLI test "moves up from a busy --port and says the requested port was busy" holds the port and checks for the line "requested port <n> (--port) was busy, so the board is on <bound>". Both replace the old exact-port tests, and both failed before the change.
- New test for a busy `--port 65535`: "fails naming the requested port when nothing from a busy explicit 65535 up is free".
- Review low (a): `board-port.test.ts` "fails naming the configured port when the search above it finds nothing free" configures 65534 and holds 65534 and 65535, then expects a `BoardPortError` naming 65534 and `default_port`. A mutant that makes only that branch fall back to random (`?? 0` on the `findNextAvailablePort` result) fails this test and no other, so the older 65535 tests don't reach that branch.
- Mutant making a busy `--port` fail again (exact): killed by all three `--port` tests. Both mutants were reverted and the diff checked afterwards.
- Review low (b), commit `33e683a` "mcp-serve test header: the UI binds the configured port when there is one, not always a random one (CF-128 review low)": the header comment in `src/test/mcp-serve.test.ts` no longer says the UI is always on a random port.
- Commit `1aff940` "Document that a busy --port moves up like env and config (CF-128 fix round)": `claude/coder-fleet/commands/board.md`, `claude/coder-fleet/skills/board-conventions/SKILL.md` (CLI table row) and `claude/coder-fleet/board/NOTICE.md`.
- Commands run: `bunx tsc --noEmit` (exit 0); `bun test --timeout=10000` on `board-port`, `mcp-serve`, `serve-board` and `server-port` (50 pass, 0 fail); `biome format --write` on the changed files; `bash claude/evals/lib/check-all.sh` once, captured to `check-all-r2.out` in the scratchpad (exit 0, board 254 pass, 0 fail, plugin 0.33.0 in both files).
- PR #57 description updated with the criterion 8 mapping and the two lows.
---

created: 2026-10-05 07:15
---
Sub-issue 1 of 1: fix round 1 pushed to PR #57 (5931826..1aff940). Done still needs: criteria 1-8 proven on main, DoD 4, and a second review round.

Done, on the coder's word: a busy explicit `board serve --port <n>` now moves up like env and config, and prints "requested port <n> (--port) was busy, so the board is on <bound>" (d89e09b; tests "moves up from a busy explicit port too..." and the CLI "moves up from a busy --port..." replace the old exact-port tests). Review low (a): a new test configures 65534, holds 65534 and 65535, and expects BoardPortError; a mutant on that branch alone fails it. Low (b): the mcp-serve.test.ts header is fixed (33e683a). Docs are updated (1aff940). The coder's check-all exit 0, board 254/0.

Not done: review round 2 has not run, nothing is merged, and the lead has not rerun check-all. /board in a session still ignores a configured port. Changed behaviour to note: a script that relied on a busy --port exiting 1 now gets another port.
---
<!-- COMMENTS:END -->
