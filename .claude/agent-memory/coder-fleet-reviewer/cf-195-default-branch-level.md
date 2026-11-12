---
name: cf-195-default-branch-level
description: CF-195 settled the lead's fast-forward-only rule for the main checkout's default branch; refspec fetch from another branch was the lead's recorded default
metadata:
  type: project
---

CF-195 (reviewed 2026-11-12) put a "keep the default branch level" rule in lead.md step 1, lead-procedures under Worktrees and memory, and the OpenCode lead's step 1. The lead's card comment settled the mechanism: `git merge --ff-only` on the branch, `git fetch origin <default>:<default>` from another branch, and never reset, stash, rebase or force.

**Why:** the human found a project's local main 18 commits behind after the lead had merged PRs on GitHub.

**How to apply:** don't relitigate fast-forward-only or the refspec form. Wording gaps raised in round 1 were Low: plain `git fetch` failing (no remote, offline) isn't covered by "when either refuses", `origin` is hardcoded, and on another branch the HEAD worktrees get cut from isn't the default branch. The flush's own fast-forward lives in `board/src/flush.ts` `fastForwardMain`, which declines on another branch, a dirty tree or differing memory. See [[lead-procedures-split]].
