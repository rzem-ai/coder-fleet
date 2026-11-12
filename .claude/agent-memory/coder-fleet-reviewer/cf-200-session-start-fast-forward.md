---
name: cf-200-session-start-fast-forward
description: CF-200 main-fast-forward.sh SessionStart hook - settled choices (5 s bound, local-config allowlist, silence when level), round 2's allowlist additions and rebase/bisect skip, and the open LFS per-URL key question
metadata:
  type: project
---

CF-200 (reviewed 2026-11-12) added `hooks/main-fast-forward.sh` on SessionStart. Settled by the lead's card comment: 5 s fetch bound, one additionalContext line, silence when level, default branch as prune-worktrees reads it, OpenCode gets a divergence-register row. Also settled there: local and worktree git config held to an allowlist, so any other local key refuses the fast-forward.

Round 1 (approve with follow-ups) raised benign keys refused, the rebase/bisect gap and ambiguous silence. Round 2 (head e62da4d2) fixed all three at the lead's word: allowlisted core.hookspath, lfs.repositoryformatversion, remote.*.gh-resolved, branch.*.pushremote (filter.lfs.* stays refused); skips update-ref while rebase-merge/rebase-apply head-name or BISECT_START names the default branch in any git dir; lead-procedures lists the silent cases.

**Why:** the hook runs unsandboxed on every session start, so agent-writable .git/config is treated as hostile; don't relitigate the allowlist itself.

**How to apply:** open after round 2 (follow-up, unverified as no git-lfs could be run): git-lfs is believed to write per-URL `lfs.<url>.access` and `lfs.<url>.locksverify` at local scope, which would still refuse in LFS repos that have pushed, with an unrepeatable key name since the URL fails safe(). The hook never pushes, so that, not the URL check, is why pushremote is safe. git's branch_checked_out also counts rebase `update-refs` entries; the hook does not. `memory-state.sh start` doesn't race with the merge. See [[cf-195-default-branch-level]]. CF-200.1 (reviewed 2026-11-12, approved) settled round 2's three lows: the pushremote comment now gives the never-pushes reason, rebase/bisect refusals say "the main checkout" or "a linked worktree" (R01-R04 pin each), and lead-procedures' silent list names a URL-less remote and the ERR trap. The hook is also silent when a rev-parse of the remote-tracking ref fails after the fetch (line ~319); not in the list, judged not worth a finding.
