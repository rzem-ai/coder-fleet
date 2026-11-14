---
name: no-git-env-in-tests
description: never run a contract test with GIT_DIR (or any GIT_* repo var) set; fixture git commands then write into the real repo
metadata:
  type: feedback
---

Never run a contract test under `GIT_DIR=...` or another `GIT_*` variable that names a repository, even to probe how it behaves in a hook's environment.

**Why:** on 14 Nov 2026, probing an env-dependent failure, I ran disabled-agents-contract.sh with `GIT_DIR` pointing at the real repo. Its fixtures' `git -C <tmp>` commands obeyed `GIT_DIR` instead, and the real repo gained five empty "init" commits on local main, branches feat/x, forged and linked, two temp worktrees, remotes upstream and fork, and origin/HEAD pointing at a fake origin/develop. Nothing was pushed. I undid it by hand.

**How to apply:** to reproduce a hook's environment, set only what hooks set, such as `CLAUDE_PROJECT_DIR`. After any experimental test run, check that `git status -sb` and `git symbolic-ref refs/remotes/origin/HEAD` in the main checkout are unchanged.
