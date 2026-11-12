---
name: flush-restart-failure-fixture
description: How to make a flush's state-branch restart fail once and then succeed in flush.test.ts; and the default 5 s per-test timeout trap
metadata:
  type: reference
---

A product commit on the state branch fails every later restart too (the merge base never moves), so it cannot test "fail, then a later flush". For a transient failure: `pushFromOther("product.txt", ...)` so the flush commit has a file, and write an untracked `product.txt` in the state worktree; `reset --keep` refuses it, the CLI exits non-zero with "the flush landed". Unlink it and the next flush restarts.

**Why:** found on CF-188.1, 2026-11-12. A test with four CLI runs took 5.3 s alone at load 19 and hit bun's 5000 ms default.

A flush that lands nothing (every change skipped) prints "nothing left to flush" and never restarts, so a restart test built that way passes on broken code. Give it one change that lands, such as a memory note the tip does not ignore (CF-198, 2026-11-12).

**How to apply:** give a test with three or more flushes an explicit timeout (third arg to `it`), and say why in a comment. See [[board-test-baseline]].
