---
name: memory-resolution-facts
description: How Claude Code 2.1.319 resolves and loads `memory: project`, and which redirects it refuses - measured with claude -p probes on 2026-11-08 for CF-183.2
metadata:
  type: reference
---

Measured 2026-11-08 on Claude Code 2.1.319 (CF-183.2), with `claude -p --model haiku --setting-sources project` in a scratch repo carrying a linked "state" worktree. Re-measure on a newer version before building on any of it.

- `memory: project` resolves to `<the subagent's spawn cwd>/.claude/agent-memory/<type, non [A-Za-z0-9_-] as ->/`. An `isolation: worktree` agent gets its own worktree's copy; a reviewer spawned with cwd in a coder's worktree gets that worktree's copy. Never `CLAUDE_PROJECT_DIR`, never the git common dir.
- The hooks' `CLAUDE_PROJECT_DIR` is the main checkout, so `check-write-scope.py --memory` (project = CLAUDE_PROJECT_DIR first) refuses a memory-only role's own memory whenever it runs in a worktree. That is the reviewer refusal seen on 2026-11-08: a bug, not a rule.
- `autoMemoryDirectory` (via `--settings`) does not move subagent memory.
- PreToolUse `updatedInput` + `allow`: a redirected Read works anywhere. A redirected Write or Edit into another worktree is refused for an isolated agent ("its writes are limited to that folder"), and for a non-isolated agent it is a protected `.claude/` path ("sensitive file"), which no hook allow skips.
- SubagentStart fires after the MEMORY.md index is already in the prompt, so a start hook cannot freshen the load; its `additionalContext` does reach the agent.
- Probe scripts were in the session scratchpad (`probe/setup.sh`, `setup2.sh`, `run*.sh`); the shape is a scratch repo, `.claude/agents/memtest.md`, a logging hook in `.claude/settings.json`.

Related: [[worktree-guard-traps]]
