---
name: new-board-gates
description: new board (claude/coder-fleet/boards) since CF-207.5 - card gate rule lives in moveCard, test gate state is only the event trail, run worktrees in the 0700 state dir; never edit while check-all runs
metadata:
  type: project
---

Since CF-207.5 (2026-11-14): `moveCard` refuses non-web moves into Done while `untickedItems` (src/checklists.ts, defaults included) is non-empty, refuses non-web moves out of Released, and lets a hook into Released only from Done. A web move into Done logs `gate: card` only when an item is unticked. A test card that a `coder` stops on with no checklist items goes to Done, so group C style tests give it an unticked criterion.

The test gate (src/releases.ts) keeps no state files: a tag is claimed by a `release-started` event naming its tag object; a run is restarted when its last `test-run-started` pid is dead and no `release-finished` exists; all under `locks/releases.lock`. The runner is `src/test-runner.ts`, spawned with node `spawn(process.execPath, ..., {detached, stdio:"ignore"})`. The lead's security round required: run worktrees under `privateStateDir/runs`, Cards ids filtered by `idPattern`, tag names shown only if `^[A-Za-z0-9._-]{1,64}$`, session-start gate only for commits on the local base branch.

**Why:** the first check-all run overlapped edits and failed in a way that couldn't be told from a real failure; the security check flagged shared tmp paths and unchecked remote strings in output.

**How to apply:** for board work that spawns processes or prints git-sourced text, start from those rules; wait for check-all to finish before editing. Tests that need a run's worktree read it from the log header, since the test process's tmpdir differs from the runner's. Related: [[new-board-moves-and-state]], [[new-board-checklists]], [[hook-fixture-background-trap]].
