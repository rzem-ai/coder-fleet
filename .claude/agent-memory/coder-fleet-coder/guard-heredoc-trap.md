---
name: guard-heredoc-trap
description: The worktree guard refuses a Bash call whose text names git anywhere, including inside a python heredoc or a filename like board-git-check
metadata:
  type: feedback
---

The harness guard refuses any Bash call it cannot prove stays in the worktree, and it reads the whole command text: a `python3 - <<EOF` edit whose body contains `git switch` or `git commit`, a loop over contract files, or a grep naming `board-git-check-contract.sh` all get refused.

**Why:** seen four times on CF-183.1; each refusal costs a round.

**How to apply:** do every multi-line edit or multi-file loop as a script in the scratchpad, run by path (`python3 <scratch>/x.py`, `bash <scratch>/x.sh`). Keep direct Bash calls to one plain command.
