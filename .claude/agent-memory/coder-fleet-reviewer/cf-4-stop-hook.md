---
name: cf-4-stop-hook
description: CF-4 (old CF-211) board Stop hook - round 1 scope settled by the lead; init clause of criterion 7 travels with group G's registration
metadata:
  type: project
---

CF-4 (new board, moved from old CF-211) adds `claude/coder-fleet/boards/src/hooks/stop.ts`: one send-back with `decision: "block"` when the focused card has unticked criteria, let through on stop_hook_active, background_tasks, a line ending in `?`, Blocked/Blocked by Human, open actions, no board/focus, `sendBackAtStop: false`. Card lives at `~/.config/boards/CF/cards/CF-4.md` (no task_view tool in a reviewer session; Read the card file).

Accepted scope in round 1 (2026-11-15), per the lead: not registered (group G), hooks/README description left to G, live /goal behaviour unverified in limits.md. The boards suite in check-all runs `test/stop-hook.test.ts`, so criterion 9 rides on the `boards` section.

**Why:** the default is on once registered, and criterion 7 says init must not switch it on without saying so; that can only be checked once G registers it.

**How to apply:** reviewing group G's registration, check init says the Stop hook is on (or defaults it off) and hooks/README describes it. The human's standing instruction for this card: no edge-case hunting, must fix only for an unmet criterion or plain bug.
