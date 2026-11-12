---
name: mutation-harness-and-hostile-trees
description: Run mutants on a scratch copy of claude/ with node_modules symlinked; build hostile git trees with mktree and call the function directly
metadata:
  type: feedback
---

To prove a test bites without touching the worktree, copy `claude/` to the scratchpad (ignore `node_modules`), symlink `coder-fleet/board/node_modules` back, apply one string replacement, and run the one contract or `bun test` file from the copy: every contract finds its plugin from its own path, so the copy is self-contained. Run the harness with `python3 -u`, or its background output stays empty until it exits. Do not edit the worktree while a harness that copies it per mutant is still running.

A state branch holding `.git`, `.GIT` or symlink entries cannot be made with `git add`, and `git worktree add` refuses to check one out, so an end-to-end adoption test never reaches the code under test. Build the tree with `git mktree` and `commit-tree`, point the ref at it, and call the exported function (as `restoreSpecs`) directly.

**Why:** CF-201.1 (2026-11-12): two security fold-ins arrived mid-run, and both needed mutants and a hostile-tree test.

**How to apply:** keep a `cf<id>-mutate.py` in the scratchpad with a MUTANTS list, and filter by id on the command line. See [[probe-hook-and-flush]].
