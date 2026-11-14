---
name: cf-3-goal-line
description: CF-3 (old CF-210) goal-line command and lead-procedures Goals section - round 1 at 4979565b; condition keys on highest granted shipping step, not review standing
metadata:
  type: project
---

CF-3 adds `commands/goal-line.md` (prints a `/goal` line for one card, default 80 turns, wc -m guard at 4,000) and a `## Goals` section in `skills/lead-procedures` that defines /goal once plus the lead's per-turn `Status <id>: ...` line; drain.md now points there, its goal fence unchanged. roster-contract pins eleven sections. The card has no task_view in a reviewer session: read `~/.config/boards/CF/cards/CF-3.md`.

Round 1 (2026-11-15): open design questions, routed as follow-ups not must-fix: the condition reads only ticks and `shipped`, never `review`, so a project on the default grant (step 2) can meet the goal before any review; and "highest-numbered granted step" can be reached out of order where a project's own words put the release after worktree removal (this repo).

**How to apply:** on round 2 or a follow-up card, check whether the lead settled those two; don't re-raise them as must fix. Standing instruction for this card: no edge-case hunting.
