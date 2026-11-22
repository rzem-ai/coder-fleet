---
description: Report fleet worktrees whose work has been adopted, or remove clean adopted worktrees
agent: lead
---

The arguments are `$ARGUMENTS`, either empty or `--dry-run`. Call `fleet_control` with action `prune` and those literal args. Pass on its verdicts and refusals. Never add a force option, remove a worktree with uncommitted changes, or delete a session to remove its worktree.
