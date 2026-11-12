---
description: Land the board and memory written since the last flush on the default branch as one commit and push it - the lead does this after each release tag, and a project that never tags does it here by hand
argument-hint: "[release tag, such as v1.4.0]"
---

Flush the board's state branch onto the default branch. Between flushes every board write commits on `coder-fleet/state` in the state worktree, `.claude/worktrees/coder-fleet-state`, and nothing reaches the default branch. A flush builds one commit on the remote's default branch tip carrying every `.boards` and `.claude/agent-memory` change the state branch made since the last flush, pushes it as a fast-forward, and starts the state branch again from it. It lands no `.boards` change when the state worktree's `.boards/config.yml` does not say `auto_commit: true`, and no file the default branch's `.gitignore` ignores; each such change stays on the state branch for the next flush to judge again. The lead runs it right after it pushes a release tag; run this command whenever the default branch should catch up without a release, such as in a project that never tags.

The argument is the release tag the flush follows, or nothing. With a tag, the commit's subject is `Board and memory at <tag>` and the tag must already be on the remote; without one it is `Board and memory flush`. Either way the commit carries a `Board-Writer:` trailer and is never tagged, and no tag moves.

## Procedure

1. From the main checkout, run `${CLAUDE_PLUGIN_ROOT}/board/board.sh flush --by human`, adding `--tag <tag>` when an argument was given.
2. Print any `skipped` line as it is: each names a directory and why its changes were held back. Exit 0 with `nothing to flush` means the default branch already has the board, and `nothing left to flush` means everything else was skipped: say which and stop.
3. Exit 0 with `flushed <sha>` means the commit is on the remote. Print that line, then the cleared and kept leftovers it lists, if any. Cleared ones were copies in the main checkout's `.boards/` that match the flush, so a pull puts the same bytes back. Kept ones differ from it and are left alone: name each, and say a pull that touches one stops until the human carries it into the board or discards it. Then print its `fast-forwarded` or `not fast-forwarded` line: the first means the main checkout already has the flushed board, and the second names why it was left, so say the human pulls the default branch there once that is dealt with.
4. Any other exit pushed nothing unless the message says the flush landed. Report the message as printed. A push race the flush lost on every attempt says so; run the command again once nothing else is pushing. Never push the commit another way and never force-push.
