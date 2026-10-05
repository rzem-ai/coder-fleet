---
id: CF-127
title: Give review-round's fix lane its own worktree cut from local HEAD
status: In Progress
assignee: []
created_date: '2026-10-04 21:44'
updated_date: '2026-10-05 03:33'
labels: []
dependencies: []
references:
  - claude/coder-fleet/workflows/review-round.js
  - docs/limits.md
priority: High
type: bug
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human ordered this on 2026-10-05, choosing to fix review-round before closing CF-52 #3. The CF-52 #3 live run (review-round wf_1297e8b7-cb8 with fix: true on CF-53) showed that a workflow `agent({agentType: 'coder-fleet:coder'})` spawn gets no worktree isolation: the fix-lane coder started in the main checkout (`git rev-parse --git-dir` = `.git`), and only the coder's own scope guard stopped it writing to main. Workflow spawns don't receive the type's `isolation: worktree`, so review-round has to create the worktree itself. CF-52 #3 is re-run as the proof once this lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before review-round's fix lane spawns its coder, a git lane creates a linked worktree under .claude/worktrees/ on a new branch at the pinned head commit, and the coder's prompt tells it to work only there; the coder is never started with the main checkout as its only place to work
- [ ] #2 The fix lane verifies from git that the coder's commit is on that worktree's branch, as today's git-state check does, and a coder that reports the main checkout stops the run as now
- [ ] #3 workflow-logic.mjs covers: the worktree lane runs before the coder, the coder prompt names the worktree path, and a failed worktree creation stops the run without spawning a coder
- [ ] #4 docs/limits.md and hooks README item 18 state that workflow-spawned agents get no harness isolation and how review-round compensates
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
author: @SubagentStop
created: 2026-10-05 03:33
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- `board/src/server/index.ts:409-410` - port precedence: `// The argument, then the config's default_port, then a random free port.` then `const finalPort = port ?? config?.defaultPort ?? 0;`
- `board/src/server/index.ts:397` - signature: `async start(port?: number, _openBrowser = true, options: { host?: string; quiet?: boolean } = {})`
- `board/src/mcp/server.ts:135-147` - `startWebUi` calls `await ui.start(0, false, { quiet: true });`. Port `0` is passed explicitly, so `??` does not fall through to `defaultPort`.
- `board/src/mcp/tools/serve/index.ts:23-30` - `board_serve`: description "on a random loopback port", empty input schema, calls `server.startWebUi()`.
- `commands/board.md:6` - "binds `127.0.0.1` on a port the kernel picks". Its last paragraph names `board serve --host <interface> --port <n>` as the human's override outside a session.
- `board/board.sh:7-11` - only resolves the binary (`~/.local/bin/board`, then `bin/board`, then `bun src/cli.ts`). It has no port logic. `.mcp.json` runs `board.sh` with `"args": ["mcp"]`.
- `board/src/constants/index.ts:76` - `defaultPort: 6420,` in the init defaults. `board/src/test/test-utils.ts:301` reads it as `defaultPort: DEFAULT_INIT_CONFIG.defaultPort`.
- `board/src/constants/index.ts:36,40` - `CONFIG: "config.yml"` and `ROOT_CONFIG: "backlog.config.yml"`. The board reads `.boards/config.yml`.
- `/Users/alex/Dev/Work/extensions/coder-fleet/.boards/config.yml` - has no `default_port`. Keys set: `project_name`, `task_prefix`, `statuses`, `default_status`, `labels`, `priorities`, `definition_of_done`, `require_acceptance_criteria`, `auto_commit`.
- `board/src/file-system/operations.ts:2111,2164-2165` - the parser is hand-written and splits lines on the first `:`. The port case is `case "default_port":` then `config.defaultPort = Number.parseInt(value, 10);`. Write-back is at `:2224` and `:2267`.
- `board/src/types/index.ts:352` - `defaultPort?: number;`
- `board/src/core/content-store.ts:77,121` - `INTEGER_CONFIG_KEYS = new Set(["max_column_width", "default_port", "zero_padded_ids", "active_branch_days"])` and `if (key === "default_port" && (number < 1 || number > 65_535)) return false;`. The recognised key list is at lines 70-100.
- `board/src/server/index.ts:1529` - the settings endpoint also validates: `if (updatedConfig.defaultPort && (updatedConfig.defaultPort < 1 || updatedConfig.defaultPort > 65535))`.
- `.claude/coder-fleet.json` is read by the hooks and scripts, not the board binary: `hooks/lib/fleet-config.sh`, `hooks/lib/fleet-config.py`, `hooks/hooks.json`, `hooks/enforce-disabled-agents.sh`, `scripts/fleet-agents.sh`, `workflows/review-round.js`.
- `board/src/cli.ts:306-316` - `serve` command: `.option("--port <n>", "port; else CODER_FLEET_BOARD_PORT, else default_port in config, else random")`, `.option("--host <h>", ... CODER_FLEET_BOARD_HOST ...)`, `const portArg = o.port ?? process.env.CODER_FLEET_BOARD_PORT;`.
- `skills/board-conventions/SKILL.md:142` documents the same precedence. The `mcp` command reads neither the flag nor the env var.
- `board/src/test/mcp-serve.test.ts:69` - "board_serve starts the web UI on a random loopback port and returns its URL". The file also covers idempotence and `board_stop` cases (a) to (h).
- `board/src/test/serve-board.test.ts:53` - `describe("board serve on a random port"`. It uses `unusedLoopbackPort()` from `board/src/test/test-ports.ts:4`.
- `board/src/test/server-port.test.ts` covers `isPortAvailable` and `findNextAvailablePort`. `board/src/test/server-hostname.test.ts` covers the host. Neither is in `BOARD_TESTS`.
- Config tests: `board/src/test/dod-defaults-config.test.ts`, `cli-dod-config.test.ts`, `require-acceptance-criteria.test.ts`, `task-type-config.test.ts`, `prefix-config.test.ts`. The first three are in `BOARD_TESTS`.
- `claude/evals/lib/check-all.sh:113-165` runs `bunx tsc --noEmit`, then `bun build --target=bun src/cli.ts --outdir "$BOARD_TMP"`, then `bun test --timeout=10000 "${BOARD_TESTS[@]}"`. `CHECK_ALL_BOARD_FULL=1` runs the whole `bun test` suite. The step is skipped when bun is absent.
- No test sets `CODER_FLEET_BOARD_PORT`, `--port` or `default_port` and checks the bound port. I grepped `cli-board.test.ts`, `cli-board-behaviour.test.ts` and `serve-board.test.ts` for these and found nothing.
- Runtime: TypeScript on Bun, `board/package.json` has `"type": "module"` and `"module": "src/cli.ts"`. Scripts: `"test": "bun test --timeout=10000"`, `"check:types": "bunx tsc --noEmit"`, `"check": "biome check ."`, `"build": "./build.sh"`.
- `board/build.sh:12-14` - `bun install --frozen-lockfile`, then `bun scripts/build.ts`. Output is `bin/board`. The installed binary at `~/.local/bin/board` comes from `claude/scripts/install-home.sh`.
---
<!-- COMMENTS:END -->
