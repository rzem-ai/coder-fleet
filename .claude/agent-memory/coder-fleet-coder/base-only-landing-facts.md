---
name: base-only-landing-facts
description: Where push base-only landing lives (CF-2.1, 2026-11-15) - merged-cards tests sit in release-close-contract.sh, prune's T01 forbids branch -D
metadata:
  type: project
---

CF-2.1 (old board CF-209.4) built the `push: base-only` landing: lead-procedures Shipping's second sequence, the `ready to land on <base> at <sha>` and `landed on <base> at <sha>` comment lines, `board-merged-cards.sh` reading the second with git, and `prune-worktrees.sh` treating a squash-landed worktree as merged by patch id, only under base-only.

- The session-start hook `board-merged-cards.sh` has no contract of its own: its cases are S01 to S07 in `claude/evals/lib/release-close-contract.sh`.
- `prune-worktrees-contract.sh` T01 greps the script for `branch -D`, so a squash-landed branch stays and prune prints `refused <branch>`; deleting it needs the human's word first.
- In this repo the old board is still live (new board under `claude/coder-fleet/boards/` was "not yet wired in" at v0.65.0), so prose naming Released and the `Cards:` tag line describes the new board.

**Why:** each took a search on CF-2.1. **How to apply:** any later card touching landing, release or prune. Related: [[trunk-readers-traps]], [[push-policy-hook-facts]].
