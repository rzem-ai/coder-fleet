---
name: old-board-gone-cf-1-5
description: Since CF-1.5 the old board, .boards/, coder-fleet/state and the memory hook are gone; specs and runs live in ~/.config/boards/<PREFIX>/; workflow lanes use the boards MCP tools; prose pins to grep first
metadata:
  type: project
---

Since CF-1.5 (2026-11-15) the plugin has no `board/` package, no `.boards/`, no `coder-fleet/state` branch, no memory or state-push hook. Specs are `~/.config/boards/<PREFIX>/specs/<issue>.md`, run articles its `runs/`; the scope hook (write-scope.ts `boardDir`) confines spec-writer, spec-editor, ui-designer's article and the reviewer's progress log there and denies with no board. The challenge gate closes a passing spec in place naming HEAD (one sha in `closed`). review-round and spec-to-card lanes call `mcp__plugin_coder-fleet_boards__card_read/card_add/card_remove_item`; the reviewer reads the card file by id prefix. `boards.sh` from source runs cli.ts for anything but fleet/hook (main.ts needs the build-only page). SessionStart context names the board dir.

Traps met:
- Prose pins: instruction-file-contract whitelists whole README/design lines (`L ` lines), requirements-source greps README's "Two workflow steps need the board" paragraph, handoff-parity needs the handoff skill example byte-identical to fixtures/handoff-cases/valid-review-finding-not-blocker.txt.
- Skill body edits: record port lag as hashes in opencode vendored.test.ts DIVERGENT (script mirroring its `lines`/`cells`/sha256[:16]).
- A cut-to-next-heading edit that re-inserts the heading doubles it.
- Test fixtures make a board with `bun --no-env-file boards/src/cli.ts init` piped a prefix, under a temp XDG_CONFIG_HOME.

**Why:** later cards build on the new board only; the old paths are traps.

**How to apply:** grep `claude/evals/lib` for a sentence before rewording README, design or skills. Related: [[spawn-binding-at-send]], [[hook-ports-cf-1-3]], [[vendored-skill-lock]].
