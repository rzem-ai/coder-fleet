---
name: new-board-moves-and-state
description: new board (claude/coder-fleet/boards) after CF-207.4 - only moveCard changes a column, cards start in Draft, hook state in a private ~/.local/state dir, SubagentStart cwd is the agent's worktree
metadata:
  type: project
---

Since CF-207.4 (2026-11-14), in `claude/coder-fleet/boards`: `updateCard` throws if a change alters `column` unless `columnMove` is set, which only `moveCard` does. `createCard` always files into Draft. A test needing a card in column X moves it Draft -> Backlog -> X with `source: "web"` (see `cardIn` in test/columns.test.ts and test/hooks.test.ts). `test/storage.test.ts` pins a board's folder to exactly its spec'd entries, so hook state (focus files, agent bindings, no-board markers) goes under `privateStateDir(env)` in src/paths.ts: `$XDG_STATE_HOME/coder-fleet-boards` or `~/.local/state/coder-fleet-boards`, 0700, refused if a symlink, foreign or group/world writable. The reviewer rejected shared /tmp for it.

Claude Code 2.1.325 sends SubagentStart for an `isolation: worktree` spawn with the agent's own new worktree as `cwd` (the reviewer read it off the bundle). Read the spawning session's checkout from `CLAUDE_PROJECT_DIR`, never from `cwd`.

**Why:** criterion 12 (one move function), spec criterion 1 (what a board folder holds), and review round 1 of CF-207.4.

**How to apply:** groups D, E and G build on `moveCard`, `addActions`/`tickAction` (src/actions.ts, minimal `actions: [{text, ticked}]`) and `src/hook-moves.ts`; never write `column` any other way. Related: [[new-boards-package-tests]], [[boards-crash-and-race-tests]].
