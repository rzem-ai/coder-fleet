---
name: new-boards-package-tests
description: the new board package claude/coder-fleet/boards (CF-207) runs every test file with plain bun test; no list to edit, unlike the old board/
metadata:
  type: project
---

check-all's `boards` section runs `bun test` over the whole `claude/coder-fleet/boards/test/` directory, so a new test file there needs no registration (the old `board/` package's BOARD_TESTS list is a different thing, see [[board-test-baseline]]). Tests use `World` from `test/fixtures.ts` for a throwaway XDG_CONFIG_HOME. The package has no node_modules; nothing to install for it.

**Why:** CF-207 groups are built in parallel by several coders on separate branches; cards.ts writeCard/allocateId belong to CF-207.3, moves live in src/moves.ts (CF-207.7).

**How to apply:** keep a group's work in its own src file where possible so parallel branches merge cleanly.
