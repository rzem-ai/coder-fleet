---
name: cf-1.4-register-hooks
description: CF-1.4 (CF-207 group G part 4) - hooks.json swapped to `boards hook <event>`; TaskCompleted test gate dropped by spec C20, Done-items comment dropped, half-swap window until CF-1.5
metadata:
  type: project
---

CF-1.4 round 1 (2026-11-15, head 4f3305fd): hooks.json runs `boards/boards.sh hook <event>` for session-start, pre-agent (PreToolUse Agent|Task), subagent-start, subagent-stop (handoff check ported to src/handoff.ts, parity gate drives it through boards.sh), task-completed, post-push, stop. boards-binary.sh fetches the release build into ${CLAUDE_PLUGIN_DATA}/bin/boards-<version>, sha256 against the same release's boards-SHA256SUMS (integrity only, by design).

Settled as spec, not regression: the TaskCompleted test gate is gone (spec CF-207 C20 and criteria 29/33 move the test gate to release tags, Done -> Released). Blocker lines still move a card to Blocked by Human through addActions. AGENTS.md's "Closing a board item runs the suite" and settings.json CODER_FLEET_TEST_* are now dead text; criterion 53 owns the rewrite.

Dropped behaviour no criterion asks for: SubagentStop's `## Done` card comment (run-article SKILL.md line 66 relies on it) and the cap let-go comment (old one only commented, moved nothing).

Half-swap window: .mcp.json still serves the OLD board's MCP (task_focus etc. on .boards) while every hook moves the NEW board under ~/.config/boards. A release cut between CF-1.4 and CF-1.5 splits the two; a project with no new board gets no hook moves at all.

**Why:** CF-1.5 removes the old board and should wire .mcp.json; check that it does, and that run-article and AGENTS.md prose are rewritten.

**How to apply:** on CF-1.5 review, grep .mcp.json for boards.sh, and the run-article skill and AGENTS.md for the dropped behaviours. See [[cf-1.3-hook-ports]] and [[cf-1.1-boards-binary]].
