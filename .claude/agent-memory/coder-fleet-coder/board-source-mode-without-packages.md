---
name: board-source-mode-without-packages
description: How to reproduce the board running from source with no node_modules (plugin cache shape); test temp dirs must sit outside the board dir
metadata:
  type: project
---

Bun auto-installs runtime imports when no node_modules is found above the entry or cwd, so `bun src/cli.ts mcp` from a copy of the board's src with no packages answers every task tool, but Bun's HTML bundler cannot build `../web/index.html`, so `/` answers 500. Reproduce by copying src, package.json, bunfig.toml, tsconfig.json and bun.lock to an `os.tmpdir()` dir.

**Why:** `createUniqueTestDir` in test-utils puts dirs under `<board>/tmp`, where the board's own node_modules is visible above, so the bug never shows there.

**How to apply:** any test of the plugin-cache shape uses `mkdtempSync(join(tmpdir(), ...))`; `src/test/board-page-source-mode.test.ts` (CF-204) is the worked example, driving the MCP over stdio with the SDK's StdioClientTransport. Scratch scripts that import the SDK must live inside the board dir to resolve it; delete them before committing.
