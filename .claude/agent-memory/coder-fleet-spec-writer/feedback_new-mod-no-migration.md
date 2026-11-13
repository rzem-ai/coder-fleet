---
name: new-mod-no-migration
description: A from-scratch mod's spec must never frame it as a move, port or migration from an existing tool, and carries no data-migration section
metadata:
  type: feedback
---

When the human calls something a brand-new mod designed from scratch (CF-207, the board mod, 2026-11-13), the spec never describes it as a move, port or migration from coder-fleet's board or sidequest, and has no section on moving existing data. In the human's words: "nothing about this mod should talk about migration paths". Importing any existing board was made a non-goal.

**Why:** the human wants the new thing judged on its own design, not as a successor to the tools it drew features from.

**How to apply:** in the Problem section, name the existing tools only as "neither has this combination"; don't propose import/export as a question again unless the human raises it.
