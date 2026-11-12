---
name: repo-own-fleet-files
description: A check reading this repo's own .boards/, .claude/rules/ or docs/specs/ must go through claude/scripts/fleet-layout.py, or it breaks once the repo is migrated
metadata:
  type: project
---

Since CF-201.2 (2026-11-12) the checks that read the coder-fleet repo's own board config or installed glossary rule (task-tools, next-column, and the board's dod-defaults, require-acceptance-criteria and next-column bun tests) ask `claude/scripts/fleet-layout.py` which arm they are in: tracked, excluded with the file on disk, excluded read from coder-fleet/state, or excluded and absent (a CI clone).

**Why:** after `fleet-exclude.py migrate` a CI clone and a linked worktree have no `.boards/`, `.claude/rules/glossary.md` or `docs/specs/`. CF-201's experiment found only the two shell contracts because its board section skipped; the five bun tests surfaced only with bun installed in the scratch clone.

**How to apply:** a new check that reads one of the repo's own fleet files goes through fleet-layout.py (bun: `src/test/own-board-config.ts`). To prove the excluded layout: clone the branch, run `python3 -I claude/coder-fleet/scripts/fleet-exclude.py migrate` in the clone, clone that again, `bun install --frozen-lockfile` in its board, then run check-all there. In a scratch harness, `cd` out of a directory before `rm -rf` on it, or every later step dies for the wrong reason and reads as a kill. See [[mutation-harness-and-hostile-trees]].
