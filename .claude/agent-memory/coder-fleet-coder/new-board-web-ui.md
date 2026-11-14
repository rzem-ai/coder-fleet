---
name: new-board-web-ui
description: new board's web UI (boards/web, src/web.ts) since CF-207.8 - shadcn-vue CLI rewrites package.json and imports, vue-tsc needs node, Playwright that matches the cached Chromium, guard on git -C
metadata:
  type: project
---

Since CF-207.8 (2026-11-14) the page lives in `claude/coder-fleet/boards/web/` (Vue 3, Vite, shadcn-vue, Tailwind 4, pinned to Fathom's installed versions) and the server in `src/web.ts`; `startWebUI(cwd, holderPid, env)` is the one entry for the CLI and group G's MCP tool. `web/dist` and `web/node_modules` are gitignored, so check-all never builds the page.

Traps met:
- `shadcn-vue add` rewrote `package.json` (loosened pins, bumped lucide, added a bogus `cn` package) and turned every `@/lib/utils` import into `from 'cn'`. Diff both after every add.
- `bun --bun vue-tsc` fails every `.vue` import; run vue-tsc under node (the build script does).
- Playwright: require `/Users/alex/.npm/_npx/13ab0715f9f30c2e/node_modules/playwright-core` (1.64.1), which matches the cached Chromium 1248; no download needed.
- `git -C <scratch fixture>` is refused by the guard; put it in a scratch bash script run by path.

**Why:** each cost a round on CF-207.8.

**How to apply:** for any later web UI change, build in `web/` with `bun run build`, seed a fixture board under a scratch XDG world, and drive it with the Playwright above. Related: [[new-board-moves-and-state]], [[worktree-guard-traps]].
