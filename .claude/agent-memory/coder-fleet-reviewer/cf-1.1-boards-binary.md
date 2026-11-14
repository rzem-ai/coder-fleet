---
name: cf-1.1-boards-binary
description: CF-1.1 (CF-207 group G part 1) - src/mcp.ts MCP_TOOLS, src/main.ts compiled entry, self.ts selfArgv, embedded page via boards:page plugin; what later sub-issues still owe
metadata:
  type: project
---

CF-1.1 round 1 (2026-11-15, PR #212, base 1a01d54a): one `boards` binary from `scripts/build.ts` (Bun.build compile, `boards:page` virtual module embedding web/dist files, host build uses the running Bun so the suite needs no fetch). `src/main.ts` is the binary's entry only; `cli.ts` from source. `src/self.ts` `COMPILED = import.meta.path.startsWith("/$bunfs/")`, `selfArgv` re-execs the binary with hidden `test-runner`/`web-server` subcommands, closing the CF-207.8 note that startWebUI spawned a .ts path. MCP tools: 16 in `MCP_TOOLS`, each reads named args only; moves go through moveCard source `mcp`, so moves.ts allows only Draft->Backlog plus addAction's `forAction` move into Blocked by Human (settled by spec 22/27). `serveMcp` holder is `process.ppid`. check-all installs the package's locked MCP SDK when node_modules is missing. `.github/workflows/boards-binaries.yml` cross-builds all four on PRs touching the package and attaches gzipped assets plus `boards-SHA256SUMS` on v* tags.

**Why:** later sub-issues wire the session-start fetch (spec 48's second sentence) and the plugin's .mcp.json, and remove the old board.

**How to apply:** when the wiring lands, check .mcp.json launches the binary directly (ppid must be Claude Code for the board_web holder) and the fetch reads `boards-<platform>.gz` and `boards-SHA256SUMS`, not the old board's SHA256SUMS. The four cross-builds are proved only by CI, never by the reviewer's suite run. See [[cf-207.8-web-ui]], [[cf-207.10-scope-guard]].
