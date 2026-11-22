---
description: Focus this checkout on one board card, or clear its focus
agent: lead
---

The arguments are `$ARGUMENTS`. With one card id, read that card through `boards_card_read`, then call `fleet_control` with action `focus` and that id as its one args entry. With no arguments, call it with no args to clear the focus. Refuse any other form. Report the bound card or that the focus was cleared. A focus does not grant permission to build: the human's order does. Include `Board-Item: <id>` in every later spawn doing work on that card so concurrent focus changes cannot rebind it.
