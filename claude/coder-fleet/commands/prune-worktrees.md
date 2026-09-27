---
description: Remove agent worktrees whose work has been adopted - unlocked, clean, merged into the default branch, and under .claude/worktrees/ - and report every one kept and why
---

Prune the agent worktrees in this project. The harness cuts a linked worktree under `.claude/worktrees/` for every properly-typed `coder` spawn and removes it again only if it is *unchanged* - deliberate, because a changed worktree holds commits that may exist nowhere else. A coder that did its job therefore always leaves one behind, nothing in the pipeline removes it after the work merges, and they accumulate: one project collected eleven of them, 8.5 GB with dependencies installed, before the human deleted them by hand. This command is the removal step, and it is safe by construction - it removes a worktree only when git can show the work has been adopted, and it never uses `--force`.

## What "adopted" means

A worktree is removable when all four hold, each answered by git rather than by anything an agent said:

1. Its path is under `.claude/worktrees/` in this repository. Any other linked worktree is somebody's deliberate checkout; leave it alone and do not even mention it beyond the report.
2. `git -C <path> status --porcelain` is empty. A dirty worktree holds uncommitted work that exists nowhere else. Skip it, whatever else is true.
3. Its HEAD is an ancestor of the default branch: `git merge-base --is-ancestor <worktree-HEAD> <default>` exits 0. The default branch is what `origin/HEAD` points at, or `main` when there is no remote. A worktree whose commits are not in the default branch is unadopted work - possibly waiting on a review round - and is kept.
4. It is not locked. The harness locks an agent worktree while its agent runs and unlocks it when the agent finishes, and a freshly cut worktree is clean and an ancestor of the default branch, so the lock is the only sign that one is in use. A locked worktree is never unlocked or removed here, whatever else is true.

## Procedure

Every step is in one script, which a contract test pins against real worktrees. Run it and read its output; do not hand-roll any step of it, not even one that looks simple. The scratch directories it sweeps are named by encoding a path, so every name starts with `-`, and a hand-rolled comparison once read those names as options and deleted the scratch of live worktrees.

1. From anywhere inside the repository, run:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/prune-worktrees.sh"
   ```

   When the argument to this command is `dry-run`, add `--dry-run`: nothing is changed, and the lines it prints say what a real run would do.
2. If the script is missing or exits 2, report that and stop. There is no manual fallback.
3. The script prints one tab-separated line per verdict. Turn them into four lists:
   - **Removed** (path, branch, HEAD): `removed <path> <branch> <head>`, where `-` as the branch means the worktree was detached. Under `--dry-run` these are `would-remove` lines.
   - **Kept** (path and the test it failed): `kept <path> <reason>`, where the reason is `not-agent`, `current`, `locked`, `missing`, `dirty` or `unmerged`. `current` means the worktree holds the directory the script ran from, `locked` means an agent may still be running in it, and `missing` means its directory was already gone, and a run without `--dry-run` drops its registration.
   - **Scratch directories deleted**: `scratch <name>`, or `would-delete-scratch <name>` under `--dry-run`. A `sweep-skipped <reason>` line means no scratch was touched: `no-scratch-root` when the scratch root does not exist, `encoding-unverified` when a path holds a character whose encoding into a scratch name nobody has verified.
   - **Refusals git raised despite the checks**: `refused <path-or-branch> <message>`. A refusal from git's own checks, such as one about submodules, means nothing was touched. A refusal while deleting, such as `failed to delete`, means git may already have removed part or all of the worktree and its registration, so look at the path before saying what is left. Report the message; never force past it.

An empty removed list on a project with no leftover worktrees is the good outcome, not a failure. A worktree kept as `unmerged` after a squash or rebase merge is expected, because its HEAD is never an ancestor of the default branch; the human decides about that one.

Never run this in the middle of a review round: a fix worktree that has not merged yet fails test 3 and is kept, so the command is safe then too, but the report will name it and the noise helps nobody. The natural moment is right after adopting a coder's work, which is when the lead's merge step points here.
