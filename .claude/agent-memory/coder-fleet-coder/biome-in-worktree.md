---
name: biome-in-worktree
description: board's biome check fails with "couldn't find an ignore file" in a linked worktree; pass --vcs-enabled=false, and cli.ts has a pre-existing import-order finding
metadata:
  type: reference
---

In `claude/coder-fleet/board`, `./node_modules/.bin/biome check <files>` from a linked worktree dies with "Biome couldn't find an ignore file" (its VCS integration). `./node_modules/.bin/biome check --vcs-enabled=false <files>` works.

**Why:** seen on CF-188 (2026-11-12). The same run showed `src/cli.ts` already failing `organizeImports` (the `./flush.ts` import sits after `./server/index.ts`) on main at e7c332e, so that finding is not yours unless you touched the imports.

**How to apply:** lint only the files you changed, with the flag; check-all does not run biome, so CI will not catch lint either way.
