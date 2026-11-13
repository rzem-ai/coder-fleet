---
name: memory-index-sync-trap
description: a fresh worktree's memory dir has no MEMORY.md; writing a new one there replaces the full index on coder-fleet/state within seconds
metadata:
  type: feedback
---

A fresh coder worktree's `.claude/agent-memory/coder-fleet-coder/` starts empty. Writing MEMORY.md there with only a new line makes the hook commit that one-line file over the state branch's full index almost at once (measured 2026-11-14: by the next Bash call the state copy was already the one-liner).

**Why:** the hook mirrors the worktree file to `coder-fleet/state` wholesale; it does not merge index lines.

**How to apply:** before writing MEMORY.md, read the index from the start hook's context or `git show coder-fleet/state:.claude/agent-memory/coder-fleet-coder/MEMORY.md`, then write the full index plus the new line in one Write.
