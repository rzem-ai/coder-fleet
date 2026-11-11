---
name: fixture-repo-git-env
description: Contracts under claude/evals/lib that git-init a throwaway fixture repo unset GIT_DIR and friends first; check a new fixture repo does too
metadata:
  type: project
---

Contracts that build a throwaway git repo (board-git-check, challenge-gate, prune-worktrees and others) run `unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY` near the top. Without it, a run under an exported GIT_DIR (a git hook, say) makes `git -C "$fixture" init` reinitialise the real repo and `git -C "$fixture" add` stage into the real index.

**Why:** found reviewing CF-194 (2026-11-12): instruction-file-contract.sh gained a fixture repo without the unset. Nothing in the repo runs check-all from a git hook today, so it was Low, not must fix.

**How to apply:** when a diff adds `git init` in a contract, grep the file for `unset GIT_DIR`; missing is a Low finding citing the sibling contracts.
