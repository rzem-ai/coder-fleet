---
name: focus-until-started
description: keep task_focus on a card until its spawn's SubagentStart has bound it; never switch or clear focus in the same batch as a spawn
metadata:
  type: feedback
---

Keep `task_focus` on a card until its agent has started (SubagentStart logs "picked up"), and never spawn for two cards, or clear the focus, in the same batch as a spawn.

**Why:** reported by the Fathom lead on 14 Nov 2026. SubagentStart reads the checkout's focus file when the agent starts, which for a worktree spawn is after the worktree is cut. A later `task_focus` switch or clear in the same batch had already run by then, so three Fathom cards never reached In Progress and one reviewer bound to the wrong card. The `Board-Item:` line binds nothing on the 0.59 board.

**How to apply:** focus, spawn, and switch or clear only in a later turn. Fixed for good only when CF-207 group G binds each spawn at spawn time (recorded on CF-207, comment 27).
