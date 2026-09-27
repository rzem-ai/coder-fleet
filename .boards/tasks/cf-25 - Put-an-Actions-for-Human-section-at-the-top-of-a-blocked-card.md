---
id: CF-25
title: Put an Actions for Human section at the top of a blocked card
status: To Do
assignee: []
created_date: '2026-09-27 03:09'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/coder-fleet/board
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/skills/handoff/SKILL.md
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
