---
description: Clear every Done card to completed when no open card depends on it and none of its child cards is open, in one board commit and without asking, then report each card held and by which open cards
---

Clear the Done column to completed, the board's `task_complete`: a card in Done moves out of the board into `.boards/completed/`, as one committed folder move on the state branch, so it is reversible from git. This is the human's order to do it, so nothing here asks first. It is not a status write, and the board's hooks are untouched by it. Never use `task_archive`.

A Done card is cleared only when nothing still open leans on it. Open means any status but Done, Draft included. A card already cleared to completed counts as finished. Two things hold a Done card:

- An open card lists it under its dependencies.
- Any of its child cards, the sub-issues whose parent id is its id (`CF-183.2` under `CF-183`), is open.

A Done child whose parent is still open is cleared like any other Done card. Springclean does not look at a card's criteria or Definition of Done: a card reached Done through the `TaskCompleted` gate already.

## Procedure

1. List the candidates with `task_list` with status Done, and record the ids. Nothing in Done means nothing to clear: say so and stop.
2. List every open card with `task_list` once per status other than Done, and keep each id with its `parentTaskId`. Match ids case-insensitively and exactly, so `CF-18` never matches `CF-183`; a child is a card whose parent id equals the candidate's id, never one that merely starts with it.
3. Find what holds each candidate:
   - Children: every open card whose parent id is the candidate.
   - Dependents: call `task_view` on the candidate and read the `Dependents` lines of its Dependency Graph. Each line names a card with its status in brackets; an open dependent is one whose status is not `Done` and not `completed`. `task_view` is the source for dependencies because `task_list` does not carry them. Read only the direct `Dependents` list.
   A candidate with no open child and no open dependent qualifies. Any other is held, and the ids of the open cards holding it are recorded against it.
4. Clear every qualifying card in one `task_complete` call (`mcp__plugin_coder-fleet_board__task_complete`) given `ids`, so the board makes one commit. It refuses all of them if any is not Done; if it refuses, report which and why, clear nothing by another route, and stop. With nothing qualifying, make no call.
5. Report each held card with the ids of the open cards holding it, one line per held card.
6. End with one line, exactly in this shape, writing an empty group as `0 held (-)`:

   `Springclean: <n> cleared (<ids>), <n> held (<ids>).`

## If the board tools are missing

If the `task_list`, `task_view` or `task_complete` tool is not available, the board MCP server is not loaded in this session. Say so, then say why, checking in this order:

- The server is switched off for this project. `~/.claude.json` holds `disabledMcpServers` under `projects["<this project path>"]`; if it lists `plugin:coder-fleet:board`, the `/mcp` toggle turned it off, and `/mcp` turns it back on for the next session.
- The plugin is not enabled here: `claude plugin list` from the project shows no enabled `coder-fleet@rzem`.
- The `board` binary is not built: `${CLAUDE_PLUGIN_ROOT}/board/board.sh --help` does not run.

Name the cause before doing anything else, so the human can fix it for the sessions that follow. `${CLAUDE_PLUGIN_ROOT}/board/board.sh task list --status Done --json` and `board.sh task view <id>` read the same data as the tools, but the CLI has no `task complete`, so nothing can be cleared that way. Report what would be cleared and held from those reads, say that nothing was cleared, and stop.
