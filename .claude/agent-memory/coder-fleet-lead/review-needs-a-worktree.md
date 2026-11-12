---
name: review-needs-a-worktree
description: a reviewer cannot run `git worktree` (scope hook refuses it), so the lead cuts the review worktree before spawning a review of anything not already in a coder's worktree
metadata:
  type: feedback
---

Before spawning a `reviewer` on a commit that has no agent worktree (work already on main, a change the lead built itself), cut a linked worktree at that head and name its path in the brief.

**Why:** 2026-11-13, CF-201.2: a reviewer briefed to "review at d1be590f in a linked worktree" found none, the scope hook refused `git worktree` for it, and it returned with no gate run, costing a whole round.

**How to apply:** `git worktree add -b <id>-<slug> .claude/worktrees/<id>-<slug> <head>` from the main checkout, then brief with the absolute path, branch, head and base. Related: [[review-round-invocation]], [[cwd-decides-which-tree]].
