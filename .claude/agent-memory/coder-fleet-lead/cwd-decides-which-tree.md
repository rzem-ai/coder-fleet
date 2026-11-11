---
name: cwd-decides-which-tree
description: In coder-fleet the lead's shell cwd decides which checkout review-round grades, which tree TaskCompleted gates, and what HEAD agent worktrees are cut from - cd deliberately before each
metadata:
  type: feedback
---

The lead's shell working directory silently picks the tree for three things: review-round's lanes (until CF-181, merged 8 Nov 2026 at 4c151fb, reaches an installed release), the `TaskCompleted` gate's `check-all.sh` run when a `[board:<id>]` task is completed, and the HEAD a spawned agent's worktree is cut from.

**Why:** on 8 Nov 2026 a review graded another branch's worktree and claimed the head was an ancestor; a `[board:CF-183.3]` close ran the suite inside CF-181's worktree under load, failed the board section after 415 s and moved CF-183.3 to Blocked; and a spawn from the state worktree would have been cut from coder-fleet/state.

**How to apply:** `cd` into the item's own worktree before launching review-round; `cd` to the main checkout, on a main that matches origin, before spawning a builder or completing a board-closing task; and close cards one at a time when the machine is quiet. See [[zsh-colon-modifier-trap]] for the other shell trap that bit the same day.
