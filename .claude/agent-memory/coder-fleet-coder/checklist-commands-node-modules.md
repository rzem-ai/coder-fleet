---
name: checklist-commands-node-modules
description: migration-checklist's dash and wrap commands glob claude/coder-fleet/** and drown in board/node_modules after worktree setup; filter node_modules
metadata:
  type: feedback
---

After `bun install` in `claude/coder-fleet/board` (the AGENTS.md worktree setup), the migration-checklist dash one-liner prints about 180 KB of hits from `board/node_modules`, and the wrap script flags upstream READMEs. Pipe through `grep -v node_modules`, or run a scratch copy of the wrap script that skips it.

**Why:** seen on CF-193.3 (2026-11-12) running the checklist over edited skills; the real hits were 7 lines under the noise.

**How to apply:** when a brief says to run the checklist's commands, filter node_modules first. Pre-existing hits outside the brief (board's forked `src/mcp/README.md`, a few humanize references, `templates/AGENTS.md:52`, the generated glossary rule) are not yours to fix. See [[guard-heredoc-trap]] for running the wrap script from a file.
