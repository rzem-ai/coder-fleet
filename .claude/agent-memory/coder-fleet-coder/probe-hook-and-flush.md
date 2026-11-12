---
name: probe-hook-and-flush
description: How to find out what the memory hook and board flush really do in an odd project setup, in a scratch fixture, in a few minutes
metadata:
  type: reference
---

To answer "what does memory-state.py or flush do when X", copy the fixture setup from claude/evals/lib/memory-state-contract.sh (bare remote, main repo, `.boards/config.yml` with `auto_commit: true`, state worktree on `coder-fleet/state` under `.claude/worktrees/`) into a scratchpad script, vary the one thing, and drive the hook with JSON events via `CLAUDE_PROJECT_DIR=$MAIN bash hooks/memory-state.sh <mode>`.

The flush runs in that fixture with `(cd $MAIN && bash <worktree>/claude/coder-fleet/board/board.sh flush --by lead)` once `git remote set-head origin main` is set and the board's `bun install --frozen-lockfile` has run. It never touches the real board because cwd is the fixture (see [[branch-binary-fixtures-only]]).

Both the hook and the flush build commits with plumbing (`update-index --index-info`, `commit-tree`), so `.gitignore` never stops them; only porcelain `git add` refuses. Measured 2026-11-12 for CF-189.
