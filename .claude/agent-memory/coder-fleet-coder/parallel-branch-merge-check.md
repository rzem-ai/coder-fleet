---
name: parallel-branch-merge-check
description: When a brief says to keep clear of an unmerged branch, prove the merge is clean with git merge-tree --write-tree, and keep edits off lines adjacent to its hunks
metadata:
  type: feedback
---

When the brief names an unmerged branch that edits the same file (CF-181 vs cf-183.2-memory-state on review-round.js), read its hunks with `git diff origin/main...<branch> -- <file>` first, keep every edit at least one unchanged line away from them, and after committing run `git -C <worktree> merge-tree --write-tree --name-only HEAD <branch>`: a bare tree id and exit 0 means it merges clean, conflicted paths are listed otherwise.

**Why:** git conflicts on adjacent changed lines, not only overlapping ones, and wrapping a loop in `try` by reindenting it would have conflicted on every line the other branch touched inside it. Leaving the body's indentation alone and adding `try {` / `} finally {` around it kept the merge clean.

**How to apply:** any brief that says "keep your change away from X so the two merge cleanly". Say in the handoff which functions you touched and that merge-tree was clean. See [[worktree-guard-traps]] for running it as one plain command.
