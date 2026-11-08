---
name: board-test-baseline
description: Bare `bun test` in claude/coder-fleet/board fails on upstream tests; the gate is check-all's fleet-owned BOARD_TESTS list
metadata:
  type: project
---

Bare `bun test` in `claude/coder-fleet/board` has pre-existing failures (seen 2026-11-08: 4 fail, 3 errors, e.g. `cli-launcher.test.ts` missing `scripts/resolveBinary.cjs`). They are upstream Backlog.md tests nobody gates on.

**Why:** check-all runs only the fleet-owned `BOARD_TESTS` array in `claude/evals/lib/check-all.sh` (`check_board`), unless `CHECK_ALL_BOARD_FULL=1`. Chasing the upstream failures is wasted budget.

**How to apply:** baseline with that list, and add any new board test file to it, or check-all never runs it. Tests that spawn the CLI from a temp repo see macOS's canonical `/private/var/...` cwd, so compare `realpathSync` paths, not `mkdtemp`'s `/var/...` ones.
