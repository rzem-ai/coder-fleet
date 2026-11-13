---
name: stop-hook-context-continues
description: Stop hook additionalContext continues the turn like a non-error block; no Stop output reaches the agent without holding up the stop
metadata:
  type: reference
---

Per code.claude.com/docs/en/hooks (Stop decision control, read 2026-11-14): `hookSpecificOutput.additionalContext` at Stop is "non-error feedback... The conversation continues", under the same loop protections as `decision: "block"`. `systemMessage` goes to the user, not the agent. So a "remind before stopping, never block" requirement cannot use a Stop hook.

**How to apply:** deliver such reminders through SessionStart (fires on startup, resume, clear, compact), as CF-207.9 did in `claude/coder-fleet/boards/src/hooks/session-start.ts`. The docs page is ~290k chars; WebFetch with offset 200000 reaches the Stop section.
