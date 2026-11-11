---
name: init-ignore-and-board-move
description: Traps when /init or kickoff reason about gitignored .boards - check-ignore -v exits 0 on a negation, and init step 2 moves and commits the board before anything later in init runs
metadata:
  type: project
---

Two facts that recur whenever a command's prose reasons about whether `.boards/` (or `docs/runs/`) is ignored.

1. `git check-ignore -v` counts a matching negation pattern as a match: it prints `.gitignore:N:!pattern` and exits 0 (builtin/check-ignore.c drops a negative pattern only when not verbose). Without `-v` a negation exits 1. init.md step 2 (`docs/runs/`) and CF-187's step 2d both read "exit 1 with an entry present" as a negation, so with `-v` a negation lands in their "already ignored" branch. The way to tell is the `!` at the start of the printed pattern.

2. init.md step 2b's last bullet runs `board.sh state`, and `board root` does the same move (`resolveBoardRoot` -> `ensureStateWorktree` -> `migrate` -> `commitMove`). In a repo with at least one commit the move commits the whole `.boards/` on `coder-fleet/state`, reading `auto_commit` from the copy and the ignore from the state worktree's own checkout, which does not carry an uncommitted `.gitignore` edit in the main checkout. Anything later in init that turns commits off or ignores `.boards` is too late for that commit, and `board flush` (`buildTree` writes index entries directly and never consults `.gitignore`) lands every path the state branch changed since the merge base on the default branch.

3. `migrate` (state-worktree.ts) copies the main checkout's `.boards/` over the base only on a fresh move, so an uncommitted main-checkout config edit (such as `auto_commit: false`) does govern the move commit. When `coder-fleet/state` exists but its worktree directory is gone, `migrate` re-attaches the branch as committed and does not copy the main checkout's board, so a main-checkout edit is lost. Detect "already moved" by the branch (`refs/heads/coder-fleet/state`), not by the worktree path.

**Why:** found reviewing CF-187 round 1 (2026-11-10). The second is why "ignore at init, nothing to flush" did not hold.

**How to apply:** when a change says a board choice made in /init stops commits or the flush, check whether step 2b's move has already committed. When prose branches on check-ignore exit codes, check whether `-v` is on. See [[gate-run-quirks]].
