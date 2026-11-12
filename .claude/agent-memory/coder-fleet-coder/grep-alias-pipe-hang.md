---
name: grep-alias-pipe-hang
description: In this shell grep is ugrep; a long contract piped into grep|head showed nothing for 40 min; run contracts to a file and read the file
metadata:
  type: feedback
---

Run a long contract (scope-hook, board-hook, check-all) with its output redirected to a scratch file, then read the file with `command grep` or `tail`. Never pipe it into `grep ... | head`.

**Why:** on 2026-11-12 (CF-202) `bash scope-hook-contract.sh 2>&1 | grep -E ... | head` sat at 0% CPU with an empty output file for 40 minutes; the shell's `grep` is aliased to `ugrep`. The same contract run to a file under `timeout 420` passed in about two minutes.

**How to apply:** `timeout 420 bash claude/evals/lib/<contract>.sh > $SCRATCH/x.out 2>&1; echo "exit $?"`, then read the file. Use `command grep` to bypass the alias. Also: Write to the main checkout's docs/runs/ is refused from a worktree, so a run article goes in the worktree's docs/runs/ (excluded via .git/info/exclude) and the handoff names that path.
