---
name: cf-199-install-config-base
description: CF-199 reviewer lockfile install - config compared with the merge base on main's first-parent chain; YAML/TOML path reader removed by the human's order (settled)
metadata:
  type: project
---

CF-199 (PR #169, 2026-11-12) lets a review-mode reviewer run one frozen, scripts-off lockfile install at the top of a linked worktree with no node_modules, and lets a bun project declare `bun --no-install test`. The install's config check compares top-level dotfiles, bunfig.toml, pnpm-workspace.yaml and non-ordinary package.json fields with the merge base of main's HEAD and the worktree HEAD, which must sit on main's first-parent chain (round 2 fix; round 1 compared with main's HEAD and refused every branch cut before a board flush).

**Why:** the human ordered the lead to drop the bash YAML/TOML reader that followed yarnPath/plugin/preload/pnpmfile paths after nine security passes each found a miss; docs/limits.md records the boundary. Settled, do not re-raise.

**How to apply:** the first-parent rule refuses a stacked branch whose parent was merged with a merge commit before the child rebased; that fails closed (gates read as not run) and was raised as a follow-up in round 2, not a must fix. review-round decides "dependencies missing" per worktree, not per gate - a follow-up the lead already recorded on the card.
