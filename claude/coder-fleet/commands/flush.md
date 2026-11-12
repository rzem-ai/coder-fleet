---
description: Say that nothing lands on the default branch, where the board and memory never go, and push the state branch
argument-hint: "[release tag, accepted and unused]"
---

The board and every agent's memory live on `coder-fleet/state`, in the state worktree `.claude/worktrees/coder-fleet-state`, and never on the default branch, in any project and on any clone. That branch is pushed after every board and memory commit. So a flush lands nothing: it says so in one line and pushes the state branch, which is a way to push by hand and to see where the project stands. A project whose default branch still tracks `.boards/` or the fleet's memory has not been migrated, and the line says so and names `/coder-fleet:init`.

## Procedure

1. From the main checkout, run `${CLAUDE_PLUGIN_ROOT}/board/board.sh flush --by human`. An argument, if given, is passed as `--tag` and changes nothing.
2. Exit 0 prints one line starting `nothing lands on`. Print it as it is: its end says what the push of `coder-fleet/state` did. When it says the project is not migrated yet, say that `/coder-fleet:init` migrates it in one commit it asks about first.
3. Any other exit pushed nothing. Report the message as printed. Never push the state branch another way and never force-push.
