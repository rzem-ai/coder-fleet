---
name: scratch-copy-traps
description: How to copy a worktree to scratch without tripping the refuter scope hook or the rm safety check
metadata:
  type: feedback
---

Copy a worktree with `rsync -a --exclude .git --exclude node_modules <worktree>/ <scratch>/`, never `git archive` (the refuter scope hook refuses it as a non-read-only git verb). Never `rm -rf $VAR/...` in a script: the safety check denies an unguarded variable target, so make fresh directories instead.

**Why:** both cost a denied call on 2026-11-12 (CF-192.1 round).
**How to apply:** the port's unit suite (`bash opencode/test/run.sh unit`) runs in about 5 s in a copy, so eight mutants fit in parallel `cp -R` copies run in one call.
