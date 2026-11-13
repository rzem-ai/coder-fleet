---
name: boards-crash-and-race-tests
description: how the new board (claude/coder-fleet/boards) tests real crashes and races without a test seam in src
metadata:
  type: project
---

The new board's concurrency tests (boards/test/concurrency.test.ts, CF-207.3) use test/worker.ts spawned with Bun.spawn as the second process. A crash at an exact point is a getter on the event object that SIGKILLs its own process, so no hook is needed in src. Mutants run on a scratch copy of the package (cp -R, then bun test there), which leaves the worktree untouched.

**Why:** the human wants plain code; test seams in src were avoided.
**How to apply:** reuse worker.ts ops for group C to F tests (moves, events) rather than adding env switches to src.
