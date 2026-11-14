---
name: new-board-binary
description: new board's compiled binary (CF-1.1) - COMPILED via /$bunfs/, selfArgv for self-spawns, boards:page virtual module, scripts/build.ts, and traps met building and screenshotting it
metadata:
  type: project
---

Since CF-1.1 (2026-11-15), `claude/coder-fleet/boards` compiles with `bun scripts/build.ts [outdir] [platform...|all]` into `bin/boards-<platform>` (darwin-arm64, darwin-x64, linux-x64, linux-arm64). The binary's entry is `src/main.ts`, which imports `boards:page`, a virtual module the build's plugin generates from `web/dist` (each file imported `with { type: "file" }`); source mode starts at `cli.ts` and never loads main.ts. `src/self.ts` decides binary vs source by `import.meta.path.startsWith("/$bunfs/")`; anything the board spawns of itself goes through `selfArgv([...])`, never a `.ts` path. Hidden subcommands `test-runner` and `web-server` are in `COMMANDS` but not the usage.

Traps met:
- Running a downloaded Bun binary (to try CI's 1.3.14) was refused by the auto-mode classifier; CI's Bun differs from the local 1.4.4 and is untested locally.
- Playwright in a scratch world with a throwaway HOME cannot find Chromium; set `PLAYWRIGHT_BROWSERS_PATH=/Users/alex/Library/Caches/ms-playwright` for the node call only.
- check-all's total ran 192 s on 2026-11-15 against the 180 s budget; board (old) is the long pole at ~139 s, boards ~79 s.

**Why:** the binary has no .ts files on disk, so every self-spawn and the no-board message must know which mode it is in.

**How to apply:** CF-1.2 to 1.4 add hook and fleet subcommands to `COMMANDS` and dispatch in cli.ts's switch; test them from the built binary as `test/binary.test.ts` does (compile with a stand-in dist in beforeAll, ~1 s). Related: [[new-board-web-ui]], [[new-board-scope-guard]], [[new-boards-package-tests]].
