---
name: gate-run-quirks
description: How the reviewer scope hook treats gate commands in coder-fleet - redirections, $( ), git tag and git worktree refused; gates need the `cd /abs && bash ...` form
metadata:
  type: reference
---

The reviewer's scope hook refuses any gate command carrying `>` or `2>&1` (it reads them as file writes), and refuses `git worktree list` and `git tag -l` as non-read-only verbs. It refuses any `$(` or backtick, even inside a read like `cat "$(grep -l ...)"`: run the inner command alone, then Read the path. A gate must be written `cd /abs/worktree && bash claude/evals/lib/<gate>.sh`; `cd x; bash ...` with a semicolon is refused. The output of a bare gate is persisted to a tool-results file you can grep. Piping a gate through `| tail` is allowed but masks the gate's exit code, so run the gate bare when the exit code matters.

**Why:** observed 2026-11-08 reviewing CF-183.1 and CF-179 round 2; several attempts were refused before the right form ran.

**How to apply:** run each declared gate as `cd <worktree> && bash <gate>` from the review worktree root. List worktrees with `ls .claude/worktrees/`, and read release versions with `git log --format=%s -- claude/coder-fleet/.claude-plugin/plugin.json` instead of git tag. `cmp` and `diff` on files are refused as executing code; compare files with the Read tool instead. The full suite took about 80 to 95 s on the human's machine at that time. A worktree that already has `claude/coder-fleet/board/node_modules/` shows it as `!!` in `git status --ignored` before the run, so it isn't a run artefact. The memory Write the hook accepts may be under the main checkout, not the review worktree; on 2026-11-08 the worktree path was refused.
