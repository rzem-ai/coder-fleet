---
description: Start this session's board web UI, or stop it with `stop`
argument-hint: [stop]
---

Open the board for this session, or close it. The web UI is per Claude Code instance: it runs inside this session's own board MCP process, binds `127.0.0.1`, and stops on `/board stop` or when the session ends. The port is `CODER_FLEET_BOARD_PORT` when set, else `default_port` in `.boards/config.yml`, else one the kernel picks. When the configured port is busy, the UI tries the next port up, and the next, until one binds; with nothing free up to 65535 it fails naming the configured port rather than taking a random one. Nothing else depends on it - the task tools and the hooks read and write the task files directly whether or not it is up - so it exists only for the human to look at.

## Procedure

The argument is nothing, to start the UI, or `stop`, to stop it. With any other argument, say that the two forms are `/board` and `/board stop`, and stop.

With no argument:

1. Call the `board_serve` tool on the board MCP server (`mcp__plugin_coder-fleet_board__board_serve`). It starts the UI if it is not already running and returns `{running, url, host, port, portSource}`, plus `configuredPort` and `configuredPortBusy` when the port came from `CODER_FLEET_BOARD_PORT` or `default_port`, and a `note` when that port was busy; a second call returns the same URL, so there is nothing to check first. If it returns an error, print the error's message and stop.
2. Print the URL on its own line, and the `note` under it when there is one, and say that it is loopback-only and ends with `/board stop` or with this session. Do not open a browser and do not run anything else.

With `stop`:

1. Call the `board_stop` tool (`mcp__plugin_coder-fleet_board__board_stop`). It stops the UI if it is running and returns `{running, url, host, port, stopped}`, where `stopped` is the URL it stopped, or null when nothing was running; stopping twice is not an error, so there is nothing to check first.
2. Print `stopped <url>` when `stopped` is a URL, or `the board UI was not running` when it is null. A later `/board` starts a fresh UI - on the configured port again when one is set and free, otherwise on a new port - so do not count on the old URL. Do not run anything else.

If either tool is not available, the board MCP server is not loaded in this session, for one of three reasons: the plugin is not enabled here, the `board` binary is not built, or this repository has no `.boards/` yet - the server resolves the board at startup and refuses to start without one. Say which: `${CLAUDE_PLUGIN_ROOT}/board/board.sh --help` fails when the binary is missing, and `${CLAUDE_PLUGIN_ROOT}/board/board.sh task list` run in the repository says `no board here` when the board is. For the last, run `/coder-fleet:init` and then start a new session, because MCP servers load at startup. When `board_serve` is available and only `board_stop` is not, the binary predates it: compare `~/.local/bin/board --version` with the `version` in `${CLAUDE_PLUGIN_ROOT}/board/package.json`, and if they differ tell the human to re-run `claude/scripts/install-home.sh` and start a new session. Then stop. Do not start `board serve` from Bash as a substitute: a server outside the MCP process outlives the session and answers to nobody.

Never bind it to another interface from here. The override for a board that must be reachable from elsewhere is `board serve --host <interface> --port <n>` run deliberately, outside a session, by the human. An explicit `--port` is exact: a busy one fails rather than moving up.
