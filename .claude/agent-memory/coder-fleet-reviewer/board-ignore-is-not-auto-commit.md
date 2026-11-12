---
name: board-ignore-is-not-auto-commit
description: A .boards/ entry in the main checkout's .gitignore does not stop board commits; auto_commit false, or an ignore the state worktree itself sees, does
metadata:
  type: project
---

Board commits on `coder-fleet/state` stop only on `auto_commit: false` (template default is `true`), `CODER_FLEET_BOARD_NO_COMMIT=1`, or `git check-ignore .boards` succeeding in the state worktree itself (`board/src/git/operations.ts`, the `skipped(... is gitignored)` branch). The state worktree reads its own branch's `.gitignore`, so an uncommitted ignore line in the main checkout, or one added after the state branch was cut, stops nothing; init.md step 2a line 40 and docs/board-config.md "If .boards/ ... is gitignored" both say so.

**Why:** CF-191 round 1 (2026-11-12, head 6099423): the card's criterion 3 assumed "ignored means not committed", and init step 2b now says so for the already-ignored case, where step 2a leaves `auto_commit` untouched.

Settled in CF-191 round 2 (head 584aded): step 2b's report reads `auto_commit` and says "not committed" only on `false`. Its reporting bullets run only when `.boards/config.yml` was absent (the first bullet skips the rest otherwise), so in the already-ignored case the value read is the fresh template's `true`.

**How to apply:** any prose that tells the human whether board writes commit must key on `auto_commit` (and the state worktree's own ignore), never on the main checkout's `.gitignore`. Related: [[ignored-memory-rule-and-flush]], [[init-ignore-and-board-move]].
