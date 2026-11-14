---
description: Start the board's web UI, or reuse the one running, and open it in the human's browser
---

Open the board's web UI for the human. It listens on a loopback address only, a second session's request reuses the server already running and its port, and it stops when the last session using it ends. It is where the human fills and orders Next and moves a card past a gate; agents never need it, since the MCP tools and the hooks read and write the cards directly.

## Procedure

1. Call the `board_web` tool on the boards MCP server (`mcp__plugin_coder-fleet_boards__board_web`). It starts the UI, or reuses the one running, and returns its address. If it returns an error, print the error's message and stop, and never print an address for it.
2. Print the address on its own line, and say that it is loopback-only and stops when the last session using it ends.
3. Open the address in the human's default browser, but only when its host is `127.0.0.1`, `::1` or `localhost`; never open any other address. Run `open <url>` on macOS (`uname` prints `Darwin`) and `xdg-open <url>` on Linux, each with its output discarded. On any other platform, when the opener is not installed, or when it exits non-zero, say in one line that the browser could not be opened and that the printed address is the way in. Run nothing else.

If the tool is not available, the boards MCP server is not loaded in this session. Say why, checking as `/coder-fleet:work` does: the server switched off with `/mcp`, the plugin not enabled here, no board for this repository, or a `boards` binary that will not run. The human can also start the UI from their own terminal with `boards.sh web` in the plugin's `boards/` directory. Do not start it from Bash as a substitute.
