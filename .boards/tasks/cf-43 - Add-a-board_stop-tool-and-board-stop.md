---
id: CF-43
title: Add a board_stop tool and /board stop
status: In Progress
assignee: []
created_date: '2026-09-27 06:56'
updated_date: '2026-09-27 07:40'
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

author: @SubagentStop
created: 2026-09-27 07:40
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-ac35e081825e5df5e` is a linked worktree. I switched it from the harness branch to a new `cf-43-board-stop`, cut with `git switch --no-track -c cf-43-board-stop origin/main` after `git fetch origin main`. It starts at 32e995e, and `@{u}` reports no upstream.
- `bb9b104 Add the approved CF-43 plan`: `docs/plans/CF-43.md` is byte-identical to the main checkout's copy (`cmp` printed "identical").
- `dd3dc6d Add board_stop to end the session's web UI mid-session`: `claude/coder-fleet/board/src/test/mcp-serve.test.ts` has the ten new cases, (a) to (h) plus (f') and (g').
- `dd3dc6d`, `src/server/index.ts`: `start` remembers `quiet`, and `stop` skips "Server stopped" when it is set and calls `serverRef.stop(true)`.
- `dd3dc6d`, `src/mcp/server.ts`: `stopWebUi()` now returns `Promise<string | null>`, and the comments are updated.
- `dd3dc6d`, `src/mcp/tools/serve/index.ts`: registers `board_stop` with the planned annotations and return value, and updates the header comment and `board_serve`'s description.
- `18cd5ba Add /board stop and record the board_stop divergence`: `commands/board.md` gains `argument-hint: [stop]`, the new description, and the no-argument, `stop` and other-argument branches.
- `18cd5ba`: `skills/board-conventions/SKILL.md:139` and `README.md:43` are worded as the plan says.
- `18cd5ba`: `board/NOTICE.md` has a new `### Behaviour changed after import` section holding the CF-43 bullet. Its heading and intro line are copied from branch `cf-26-27-completed-edit` so the later merge conflict stays trivial.
- Red run: `bun --cwd=<wt>/claude/coder-fleet/board test --timeout=10000 src/test/mcp-serve.test.ts` exited 1 with 4 pass, 10 fail.
- Red, (a) to (f), (g) and (h): they failed because `board_stop` did not exist yet (`McpError -32602: Tool not found: board_stop`; for (h), `find` returned undefined).
- Red, (f'): it failed because the UI was still running (`running` was true).
- Red, (g'): it failed on the "Server stopped" line, with counts `{log: 1, write: 0}`. That confirms the plan's risk that Bun's `console.log` bypasses `process.stdout.write`, so the `console.log` spy is the one that catches it.
- Green run: same command, exit 0, 14 pass, 0 fail.
- Mutations, since most cases were red only on the missing tool. I set a budget of three, one per behaviour the red run left unproven. All three were killed, each reverted, and a rerun afterwards was green (14/0).
- M1, `stop(true)` back to `stop()`: killed by (b). Without it, a kept-alive connection is still served after the stop.
- M2, quiet guard removed: killed by (g) and (g').
- M3, queue bypassed (`op()` instead of `webUiQueue.then(op)`): killed by (f) and (f').
- Full-suite baseline, taken in a detached scratch worktree at bb9b104 (explained under Unverified): `bun test --timeout=10000` exited 1 with 1455 pass, 4 fail, 3 errors, 1459 tests across 146 files.
- Baseline failure: `McpServer bootstrap > createMcpServer wires stdio-ready instance`.
- Baseline failure: `package bin wrapper > points to scripts/cli.cjs to own .bin/backlog`.
- Baseline failures: `cli-launcher.test.ts` and `resolveBinary.test.ts` cannot load `../../scripts/resolveBinary.cjs`.
- Baseline errors: the 3 errors between tests are those two load failures plus a jsdom `is not of type 'Event'` TypeError.
- Full suite after the change: exited 1 with 1466 pass, 5 fail, 3 errors, 1471 tests. The failures are the same as the baseline plus `ContentStore > retries initialization when the root changes after a coherent load resolves`.
- Run on its own (`bun --cwd=<board> test --timeout=10000 src/test/content-store.test.ts`), that content-store file exited 0 with 67 pass, 0 fail. The failing assertion compared two different test directories (`...muji25yc.../root-b` against `...muji2638.../root-b`), and the file imports neither `mcp/` nor `server/`.
- `bun --cwd=<board> test --timeout=10000 src/test/serve-board.test.ts src/test/mcp-server.test.ts` exited 1 with 9 pass, 1 fail. The failure is the same bootstrap test, which already fails on main because its expected tool list is out of date: it lacks `board_serve`, `board_url` and `task_focus` on main, and now `board_stop` too.
- `bun --cwd=<board> run check:types` exited 0.
- Lint: `bun run check` is broken (CF-39), so I ran `bun --cwd=<board> run node_modules/@biomejs/biome/bin/biome check --vcs-enabled=false` on the four changed source files. It found one formatter problem in my test, which I fixed. One remains: a trailing blank line at `src/server/index.ts:1919`, far from my three hunks and not mine.
- Build: `bash <board>/build.sh <board>/bin/board` exited 0, and `bin/board --version` prints `0.1.4`. No bump, as instructed. `strings` shows the `board_stop` description is in the binary.
- check-all: `bash claude/evals/lib/check-all.sh` ran once, captured to `scratchpad/cf43/checkall/out.txt`. Exit 0, every section `ok`, `board` section 78 pass 0 fail, "Every deterministic check passes."
- Clean-up: I removed `board/tmp/` (one directory the failing content-store test left behind) and my scratch worktree. `git status --short` is empty.
---
<!-- COMMENTS:END -->
