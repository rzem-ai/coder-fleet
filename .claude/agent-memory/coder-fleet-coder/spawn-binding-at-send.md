---
name: spawn-binding-at-send
description: Since CF-1.4 the new board binds a spawn at PreToolUse by tool_use_id and resolves it at SubagentStop via the agent's .meta.json toolUseId; SubagentStart fires before transcript and meta exist; hooks.json pins in contracts
metadata:
  type: project
---

Since CF-1.4 (2026-11-15), hooks.json runs every board hook as `"${CLAUDE_PLUGIN_ROOT}/boards/boards.sh" hook <event>` (src/hooks/run.ts). PreToolUse Agent (`onSpawnSent`) records `spawns/<session>/<tool_use_id>` in the private state dir and starts work on the card. SubagentStart only notes the focus (`starts/`), which is the workflow-lane fallback. SubagentStop's `bindAtStop` reads `toolUseId` from `<agent_transcript_path minus .jsonl>.meta.json`. The handoff check now lives in src/handoff.ts, and handoff-parity drives `boards.sh hook subagent-stop`.

Harness facts (2.1.325, measured from file birth times): SubagentStart's input is only agent_id and agent_type, and it fires 0.3 to 3 s before the agent's .jsonl exists, with the meta later still. A workflow lane's meta has no toolUseId.

**Why:** criterion 1 (no batch misbinding), and SubagentStart cannot learn which Agent call it is.

**How to apply:** before editing hooks.json, grep claude/evals/lib for `hooks.json`. Pins live in board-hook-contract (focus-clear-registered, return-registered, matcher), release-close W01, fast-forward, disabled-agents, scope clock, task-tools (max TaskCompleted timeout must stay above the repo's 480) and board-binary. Related: [[subagent-brief-on-disk]], [[hook-ports-cf-1-3]], [[new-board-moves-and-state]].
