---
name: branch-binary-fixtures-only
description: Never run a branch's board CLI or board.sh against the real coder-fleet repo; read cards as files and run new board code only in temp fixtures
metadata:
  type: feedback
---

Never run the branch's `board.sh` or `bun src/cli.ts` from inside the real coder-fleet checkout, not even `task view`. Read cards from `/Users/alex/Dev/Work/extensions/coder-fleet/.boards/tasks/` directly (or the board MCP tools), and run new board code only in temp repos with a bare remote, or with `CODER_FLEET_BOARD_ROOT` pointed at a fixture.

**Why:** on 2026-11-08 a CF-183.1 fix coder read a card with the branch's binary, which moved the real repo's live board into `.claude/worktrees/coder-fleet-state` while the installed 0.48.0 sessions kept writing main; the lead had to remove the stray worktree and branch.

**How to apply:** any board binary change that resolves or moves the board root (state worktree, flush) is a data write on first use. Test it in fixtures; say in the handoff if the real repo was ever touched. See [[board-test-baseline]].
