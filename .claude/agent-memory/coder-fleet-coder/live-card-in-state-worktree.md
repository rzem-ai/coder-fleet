---
name: live-card-in-state-worktree
description: Read a card's comments (the lead's decisions) from the state worktree's .boards/tasks/, not the main checkout's copy, which is frozen at the move
metadata:
  type: feedback
---

Since CF-183 the live board is `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/coder-fleet-state/.boards/tasks/`. The main checkout's `.boards/tasks/` and every worktree's copy are frozen at the last flush, so a card read there can miss the lead's decision comment the brief points at.

**Why:** on CF-180 (2026-11-08) the main checkout's card had no comments section at all; the lead's decision comment was only in the state worktree's file.

**How to apply:** read cards as files from the state worktree path (read only, never the branch's board CLI; see [[branch-binary-fixtures-only]]), and fall back to the main checkout's copy only when the state worktree has no `.boards/`.
