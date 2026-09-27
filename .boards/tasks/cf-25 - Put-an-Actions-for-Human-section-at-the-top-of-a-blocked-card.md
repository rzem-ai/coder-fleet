---
id: CF-25
title: Put an Actions for Human section at the top of a blocked card
status: To Do
assignee: []
created_date: '2026-09-27 03:09'
updated_date: '2026-09-27 03:30'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/coder-fleet/board
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/skills/handoff/SKILL.md
  - docs/specs/CF-25.md
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
priority: High
type: feature
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-09-27: "when a card is moved into 'Blocked by human', there needs to be a section called 'Actions for Human' or something to that effect which tells the human, near the top of the card, what exactly needs the human's attention or action."

Today the SubagentStop hook moves the item to Blocked by human and appends the Blocker: lines as a comment, which lands at the bottom of the card below the description, criteria and every earlier comment (see CF-8's and CF-12's cards). The human has to scroll to find what they are being asked.

Needs a spec: where the section lives (a new field in the carried board fork, rendered near the top in the file, CLI, MCP view and web UI; or a section the hook maintains in an existing field), its wording and format (one action per line, which agent asked, when); what clears it (the human's answer, the next spawn against the item, or the item leaving Blocked by human) without destroying history (board-conventions: add comments, do not rewrite descriptions); what a Blocker: line must contain to be actionable, and whether the handoff skill tightens that; and the hooks' contract tests.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 03:18
---
Draft spec at docs/specs/CF-25.md with GitHub issue #3 point 1 folded in. Root cause found: reviewer.md:42 and refuter.md:48 instruct those agents to raise must-fix findings as Blocker: lines, so the Fathom reviewer did exactly what it was told. CF-23 AC7 fixes the refuter half; this item now carries the reviewer half and the handoff skill's worked example. Awaiting the human's interview.
---

author: @SubagentStop
created: 2026-09-27 03:30
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Rewrote `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-25.md` with the interview answers.
- Checked that CF-26, CF-27, CF-29 and CF-31 exist on the board and match what the spec says about them, including that CF-31 takes over CF-23's criterion 7.
---
<!-- COMMENTS:END -->
