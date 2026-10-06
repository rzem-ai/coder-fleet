# Notice

This package carries source from Backlog.md, https://github.com/MrLesk/Backlog.md,
copyright (c) 2025 Backlog.md, under the MIT licence in `LICENSE`.

Imported once at commit `aded8e254e6a0205b878cf07e631d1a592782040` (the 1.52.0
line, 17 September 2026). It is a fork at a pin, not a subtree: upstream changes
after that commit are ported by hand if wanted.

Upstream's test suite at the pin, on marvin (Bun 1.3.10, macOS), 17 September 2026:
2862 pass, 8 skip, 26 fail, 1 error, across 290 files. Twenty-two of the
failures were in tests of the commander CLI, which is replaced rather than
carried; the rest are recorded, not fixed. Task 1 re-runs the suite and
replaces this line if the numbers differ on the importing machine.

Run in this package (not the full upstream clone), same machine, same day:
2833 pass, 8 skip, 31 fail, 2 errors, across 290 files, 2872 tests. The extra
failures and errors exercise upstream's root-level `scripts/` and `tools/`
directories and its dogfooded `backlog/` project directory, none of which
this package carries; they go away with the modules later tasks remove.

Removed, in the order the plan removed them:

- root discovery by walking up and by git (`src/utils/find-backlog-root.ts`, `src/utils/runtime-cwd.ts`)
- upstream's commander CLI and its command tree (`src/cli.ts`, `src/commands/`)
- the git layer (`src/git/`, `src/core/cross-branch-tasks.ts`, auto-commit and remote operations). On 18 September 2026 `src/git/operations.ts` regained add and commit, pathspec-limited to the board directory, and `src/git/branch-ids.ts` was written fresh for cross-ref id allocation; cross-branch task loading and remote operations stay out.
- the terminal UI (`src/ui/`, `src/types/neo-neo-bblessed.d.ts`, `Core.editTaskInTui`, `Core.openEditor`, `src/board.ts`'s terminal format and layout types, `neo-neo-bblessed`, `@clack/core`, `@clack/prompts`)
- shell completions (`src/completions/`)
- project initialisation and instruction injection (`src/core/init.ts`, `src/agent-instructions.ts`, `src/guidelines/`, `src/readme.ts`, the server's `/api/init` endpoint)
- duplicate-ID repair (`src/core/duplicate-task-repair.ts`, `Core.previewDuplicateTaskIdRepair`, `Core.repairDuplicateTaskIds`, the server's `/api/tasks/duplicates` endpoint, `DuplicateIdRepairModal`, `DuplicateIdWarning`)
- the terminal-status cleanup endpoints (`/api/tasks/cleanup`, `/api/tasks/cleanup/execute`)
- the prefix and config migrations (`src/core/prefix-migration.ts`, `src/core/config-migration.ts`, `Core.ensureConfigMigrated` and the legacy-milestone helpers under it)
- the identity diagnostics the removed `doctor` command reached (`Core.diagnoseDraftIdentity`, `Core.diagnoseContentIdentity`)
- the editor, clipboard, browser-launch, browser loading state, MCP client setup, agent selection and config watcher helper modules (`src/utils/{editor,clipboard,browser-launch,browser-loading-state,mcp-client-setup,config-watcher,agent-selection}.ts`); the two whose behaviour the board still reaches were moved into their only caller (the config watcher into `src/core/content-store.ts`, the loading-state parser into `src/web/App.tsx`)
- the MCP workflow tools and resources, the init-required resource, and roots discovery with its fallback mode (`src/mcp/tools/workflow/`, `src/mcp/resources/`, `src/mcp/workflow-guides.ts`, `McpServer.enableRootsDiscovery` and the `pinned` option)
- the repository tooling upstream's package.json carried (`husky`, `lint-staged`, `install`)

## Adjusted at import

- `src/guidelines/project-manager-backlog.md` was a symlink into upstream's `.claude/agents/`; it was a plain copy here until `src/guidelines/` was removed with the instruction machinery.

## Adjusted after import

Prose and copy changed in the carried source, recorded here so a future port
against upstream knows these lines were ours rather than drifted.

- The web UI says "Board" rather than "Backlog.md": the `<title>` in
  `src/web/index.html`, the `data-version` string in `src/web/App.tsx`, the
  version line in `src/web/components/SideNavigation.tsx`, and the server
  banner in `src/server/index.ts`. The "powered by" link to backlog.md in
  `src/web/components/Navigation.tsx` was removed. The `backlog.md:` and
  `backlog-theme` browser-storage key prefixes are deliberately left alone, so
  viewers keep the flags they already hold. Both of `src/board.ts`'s markdown
  export headers, the board and the by-milestone one, say "powered by Board"
  too.
- Two JSX header comments, in `src/web/components/DecisionDetail.tsx` and
  `src/web/components/DocumentationDetail.tsx`, were trimmed to
  `{/* Header Section */}`. Upstream's version ended with a clause naming two
  third-party trackers as the style reference, and the fleet does not name
  either in code it ships. Nothing the comments describe changed.

### Behaviour changed after import

Behaviour the carried source had at the pin and this package changed on purpose, so a port against upstream keeps the change rather than restoring upstream's.

- A card in the completed folder takes edits (CF-26). Upstream let `Core.updateTaskFromInput` reach only active cards and pinned that with "reads a completed-only task while keeping it unavailable to mutations" in `src/test/core.test.ts`. Here an edit that finds no active card falls back to `Core.loadCompletedTaskForMutation` and `Core.updateCompletedTaskFromInput`, which rewrite the completed file in place without firing the status callback, and a status other than the card's own, Draft included, is refused with `CompletedTaskStatusError`. That upstream test was rewritten to "edits a completed-only task in place while refusing a status change", and `src/test/task-edit-completed.test.ts` covers the core, CLI, MCP and web paths. `resolveForMutation`, which every lifecycle move uses, still answers not-found for a completed card.
- The MCP `task_edit` schema lists no default on `status` (CF-27). Upstream's `generateStatusFieldSchema` gave both `task_create` and `task_edit` the first configured status as a default, and `src/test/mcp-tasks.test.ts` asserted it for both; here `task_edit` passes `includeDefault: false`, its description says to omit status to leave it unchanged, and that assertion expects no edit default. `task_create` keeps upstream's default, and `src/test/mcp-task-edit-status.test.ts` covers the rest.
- `BacklogServer.stop` stays quiet when it was started quiet and closes active connections (CF-43), so the MCP process can stop the web UI mid-session. Upstream always logged "Server stopped", which inside the MCP process lands on stdout, the JSON-RPC stream, and called `server.stop()` without `closeActiveConnections`, which left kept-alive clients served after the stop. `board_stop`, in `src/mcp/tools/serve/index.ts`, is the fleet tool that calls it, and `src/test/mcp-serve.test.ts` covers both.
- A task file can carry an Actions for Human section (CF-25), which upstream does not have. It is a marked checklist at the very top of the body, `## Actions for Human` between `<!-- ACTIONS:BEGIN -->` and `<!-- ACTIONS:END -->`, a marker family the sentinel tokeniser in `src/markdown/structured-sections.ts` now knows, so every other checklist masks it and it masks them; only the marked form is read. `task edit` takes `--action`, `--check-action`, `--uncheck-action` and `--clear-actions`, MCP `task_edit` takes `actionsAdd`, `actionsCheck`, `actionsUncheck` and `actionsClear`, the web PUT takes `actionsCheck` and `actionsUncheck`, and none of them moves a column. Every status write settles the section through `src/core/actions-for-human.ts`: a move out of Blocked by human, or into the terminal status from another, empties it and archives it as one `@board` comment in the same write, on the edit path, the drag, the batch move, both demote paths and completion. An add on a completed card or a draft is refused. The task plain and JSON views and the web modal and card show the section. `src/test/actions-for-human-markdown.test.ts`, `actions-for-human-core.test.ts`, `actions-for-human-cli.test.ts`, `mcp-actions-for-human.test.ts`, `server-actions-for-human.test.ts` and `web-actions-for-human.test.tsx` cover it.
- `BacklogServer.start` resolves its port through `resolveBoardPort` in `src/server/port.ts` and throws instead of exiting (CF-128). Upstream bound the argument, else `default_port`, and on a busy port printed an error and called `process.exit(1)`, which inside the MCP process would end the session's board tools. Here the argument comes first, then `CODER_FLEET_BOARD_PORT`, then `default_port`, then a random port; a busy port from any of the first three moves up through `findNextAvailablePort`, which now takes the bound host, with the bind as the arbiter, until one binds, and with nothing free up to 65535 a `BoardPortError` names the port asked for. `board_serve` uses the same path, so the in-session board honours a configured port, and `portBinding` reports where the port came from and whether it was busy. `src/test/board-port.test.ts` and `src/test/mcp-serve.test.ts` cover it.
- The web server refuses DNS-rebinding requests (CF-139). Upstream answered any Host header and served its write routes to any Origin, so a page that rebound its own hostname to 127.0.0.1 could read and edit the board same-origin. Here every request, WebSocket upgrades included, passes `refuseForeignRequest` in `src/server/request-guard.ts` first: a Host other than `127.0.0.1`, `localhost` or `[::1]` - with the bound port or none, or the interface given to `board serve --host` - gets a 403, and so does a POST, PUT, PATCH or DELETE whose Origin is present but not the board's own, and a WebSocket upgrade whose Origin is missing or not the board's own, since the socket carries the board's broadcasts and CORS never covers it. Bun.serve runs a matching `routes` entry, the page's bundled assets included, without calling `fetch`, so `BacklogServer.start` now binds the routes to a Unix socket in a fresh private directory and the TCP port to a gate that runs the guard and forwards the rest through `src/server/unix-forward.ts`, a small HTTP/1.0 client over `node:net`, because Bun's `fetch` and `node:http` send a proxy's absolute-form request line down a Unix socket when `HTTP_PROXY` is set. The socket's directory carries its process's pid, and each start removes those whose process is gone, since a board ended by a signal never runs `stop`. `board_serve` starts the server through the same method. `src/test/server-host-guard.test.ts` covers it.
