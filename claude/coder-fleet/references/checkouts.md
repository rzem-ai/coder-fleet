The lead's body, step 1, sends you here before the first spawn of a session and after each merge, to keep the base branch level; step 5 sends you here before you touch memory that is not yours.

# The base branch, worktrees and memory

## The base branch

The base branch is the fleet's trunk: the `baseBranch` setting in `.claude/coder-fleet.json`, else the branch the remote's HEAD names, else `main`, the remote being `origin` or the only one. `"${CLAUDE_PLUGIN_ROOT}/scripts/boards.sh" fleet trunk` prints it, and every hook, script and command that reads the trunk uses the same resolver; a `baseBranch` naming no local branch resolves to nothing rather than a guess. Set it with `/coder-fleet:agents base`.

## Keeping it level

Keep the main checkout's base branch level with the remote's, because agent worktrees are cut from your HEAD, one left behind builds new work on old code, and the human works in that checkout. After each pull request merges on GitHub, and before you cut a worktree or spawn a builder, run `git fetch` from the main checkout and then `git merge --ff-only` with the remote's base branch while the checkout is on that branch; when it is on another branch, `git fetch origin <base>:<base>` moves the local branch forward without a checkout, and you tell the human which branch is out, because worktrees are still cut from it. A remote under another name takes `origin`'s place. Both only ever fast-forward. When the fetch fails or either refuses - no remote or no network, local commits the remote lacks, or a changed file in the way - leave the checkout as it is and tell the human in your next reply how far behind it is and what is in the way. Never reset, stash, rebase or force the branch to get past a refusal, because those commits and changes are the human's.

At the start of a session the `main-fast-forward.sh` hook does that fetch and fast-forward in the main checkout and leaves one line in your context: how many commits it moved, which branch is out, or why it left the branch as it is. Read that line instead of fetching again, and handle a refusal in it as above. No line does not mean level: the hook is also silent when the branch was already level or ahead and `baseBranch` is unset, and when it never looked - a session started in a linked worktree, a compaction, a plugin without the hook, `CODER_FLEET_FAST_FORWARD=off`, git older than 2.31, no remote, a remote with no URL, several remotes and none named `origin`, no local copy of the base branch, or an error inside the hook, which it only logs. So with no line, bring the main checkout level yourself before the first spawn.

## Removing worktrees

As soon as a worktree's work is merged into the base branch and nothing is using it - a `coder`'s or `scripter`'s, or one you cut yourself - remove it without asking the human. The harness keeps every changed worktree by design, both builders are forbidden from deleting their own, and nothing else in the pipeline owns the step, so without you they accumulate. `/coder-fleet:prune-worktrees` is the procedure: it removes only what is clean, unlocked and already an ancestor of the base branch, or under `push: base-only` landed there as one squashed commit, so it can never destroy unadopted work and is not the hard-to-reverse deletion the Invariants reserve for the human. Never remove a worktree with unsaved work: report it instead. Its agents' memory goes with it, which is the accepted cost of memory staying in the checkout.

## Memory

Each agent keeps its own memory under `.claude/agent-memory/` in the checkout Claude Code put it in, and it stays there: memory an agent writes in its own worktree goes when that worktree is removed. Never commit memory with an item's work, so a feature branch carries only the item. Never copy memory between checkouts, a write the Claude desktop app's own worktree guard refuses from a session in a worktree. Never discard, revert or rewrite another agent's notes; a memory change that should not ship is a question for the human, not a delete.

The fleet's memory is excluded in every checkout through the common git dir's `info/exclude`, as `/coder-fleet:init` writes it. Never force-add memory, in any checkout: git refusing to add an excluded memory path is the project keeping it out of its history, not a failure to report. Specs and the reviewer's progress logs are not in the project at all: they live in the board's `specs/` and `runs/` under `~/.config/boards`, which every checkout and worktree of the repo shares, so a brief names a spec by that path, which your session start gives.
