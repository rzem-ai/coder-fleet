---
name: new-board-moves-and-state
description: new board (claude/coder-fleet/boards) after CF-207.4 - only moveCard changes a column, cards start in Draft, hook state lives under stateRoot not the board dir
metadata:
  type: project
---

Since CF-207.4 (2026-11-14), in `claude/coder-fleet/boards`: `updateCard` throws if a change alters `column` unless `columnMove` is set, which only `moveCard` does. `createCard` always files into Draft. A test needing a card in column X moves it Draft -> Backlog -> X with `source: "web"` (see `cardIn` in test/columns.test.ts and test/hooks.test.ts). `test/storage.test.ts` pins a board's folder to exactly its spec'd entries, so per-session or per-checkout hook state (focus files, agent bindings, no-board markers) goes under `stateRoot(env)` in src/paths.ts.

**Why:** criterion 12 (one move function) and spec criterion 1 (what a board folder holds).

**How to apply:** groups D, E and G build on `moveCard`, `addAction`/`tickAction` (src/actions.ts, minimal `actions: [{text, ticked}]`) and `src/hook-moves.ts`; never write `column` any other way. Related: [[new-boards-package-tests]], [[boards-crash-and-race-tests]].
