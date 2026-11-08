---
name: cf-183-dogfood-board
description: In coder-fleet itself, until the state-worktree release is installed, the main checkout's .boards is newer than the state worktree's; read cards from both
metadata:
  type: project
---

On 2026-11-08 the coder-fleet repo had a `.claude/worktrees/coder-fleet-state` worktree on `coder-fleet/state` with no "Move the board to the state worktree" commit (the branch was cut at main 4066329), while the installed plugin (0.48.0) has no state-worktree code and kept writing card comments to the main checkout's `.boards` on main. So the main checkout's card carried the fix-round comment and the state worktree's did not, the reverse of what the branch's review-round prompt assumes.

**Why:** the branch's own binary made the state worktree during CF-183.1 work, but every live session ran the old binary - the exact "older plugin session" case board-git-check's since_move reports.

**How to apply:** when reviewing CF-183.x before the release that ships the state worktree is installed, read the card from both copies and trust the newer `updated_date`. Do not report the lag as a defect in the diff. The flush baseline for board-git-check is already AC 5 on CF-183.3, so don't raise it as a finding. See [[gate-run-quirks]].
