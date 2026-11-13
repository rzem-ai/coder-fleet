---
name: memory-index-carried-whole
description: The memory hook copies this checkout's MEMORY.md over the state branch's whole; a fresh checkout with no local MEMORY.md must write the full index from the state copy, never one line
metadata:
  type: feedback
---

When the main checkout's memory dir has no MEMORY.md (memory kept out of history), the full index lives only at `.claude/worktrees/coder-fleet-state/.claude/agent-memory/coder-fleet-reviewer/MEMORY.md`. Writing a new one-line MEMORY.md locally gets carried over the state branch's copy and drops every other entry.

**Why:** CF-206 round 1 (2026-11-13) wrote a one-line index and the hook replaced the 25-entry state index with it within seconds; restored by rewriting the full list.

**How to apply:** before writing MEMORY.md, Read the state worktree's copy first and write the whole list plus the new line.
