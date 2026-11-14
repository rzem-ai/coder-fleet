---
description: Focus this checkout on one board card, so the hooks move that card as agents start and stop - the human's hand on what card_focus does for the lead
---

Focus this checkout on the board card given as the argument. The argument is a card id in any case (`bd-12`, `BD-12.3`), or nothing to show the current focus, or `clear` to forget it.

## Procedure

1. With an id: call the boards MCP server's `card_focus` tool (`mcp__plugin_coder-fleet_boards__card_focus`) with `{id}`. It checks the card exists and binds this checkout's focus to it, kept in the board's private state directory, never in the repository. Read the card with `card_read` and print its canonical id and title in one line.
2. With `clear`: call `card_focus` with `{}` and say the focus is cleared.
3. With nothing: run `${CLAUDE_PLUGIN_ROOT}/boards/boards.sh where` to confirm this repo has a board, and say what the focus is if this session set one; the tools have no call that only reads it.
4. If the tool refuses the id, say the card is not on this board and stop; do not file one.
5. If the tool is not available, the boards MCP server is not loaded in this session. Say so, then say why, checking in this order:
   - The server is switched off for this project. `~/.claude.json` holds `disabledMcpServers` under `projects["<this project path>"]`; if it lists `plugin:coder-fleet:boards`, the `/mcp` toggle turned it off, and `/mcp` turns it back on for the next session. This is the common case, and the plugin being enabled does not rule it out.
   - The plugin is not enabled here: `claude plugin list` from the project shows no enabled `coder-fleet@rzem`.
   - The repo has no board: `${CLAUDE_PLUGIN_ROOT}/boards/boards.sh where` says so, and the human makes one with `boards.sh init`, which asks for its prefix.
   - The `boards` binary will not run: `${CLAUDE_PLUGIN_ROOT}/boards/boards.sh where` exits 127.
   Name the cause so the human can fix it for the sessions that follow. There is no CLI fallback for the focus: a `Board-Item: <id>` line in a spawn prompt binds that spawn to the card without it.

Never move the card's column. Focusing says which card the hooks move; the hooks do the moving.
