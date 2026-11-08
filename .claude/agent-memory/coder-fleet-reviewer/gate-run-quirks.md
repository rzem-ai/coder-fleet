---
name: gate-run-quirks
description: How the reviewer scope hook treats gate commands in coder-fleet - redirections refused, pipes allowed, git worktree refused
metadata:
  type: reference
---

The reviewer's scope hook refuses any gate command carrying `>` or `2>&1` (it reads them as file writes), and refuses `git worktree list` as a non-read-only verb. A bare gate (`bash claude/evals/lib/check-all.sh`) runs, and its large output is persisted to a tool-results file you can grep. Piping a gate through `| tail` is allowed but masks the gate's exit code, so run the gate bare when the exit code matters.

**Why:** observed 2026-11-08 reviewing CF-183.1; three attempts were refused before the bare command ran.

**How to apply:** run each declared gate bare from the review worktree root; list worktrees with `ls .claude/worktrees/` instead of `git worktree list`. `cmp` and `diff` on files are refused as executing code; compare files with the Read tool instead. The full suite took about 80 to 90 s on the human's machine at that time.
