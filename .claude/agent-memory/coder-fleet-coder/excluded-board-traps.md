---
name: excluded-board-traps
description: CF-201 info/exclude traps - plain git add refuses excluded cards, ls-files --exclude-standard hides them, and watching a fix fail means running the contract against HEAD's copy
metadata:
  type: project
---

Since CF-201 (2026-11-12) a project lists `.boards/`, fleet memory, rules, specs and runs in the common `info/exclude`, which every worktree shares, the state worktree included. Three traps followed from that.

- `git add -- .boards` exits 1 on any new excluded card, though it still stages tracked edits. `git status` and `ls-files --exclude-standard` hide those cards too. Stage and list with `ls-files -m -d -o --exclude-per-directory=.gitignore` plus the global excludes file (`stageUnexcluded`, `listed_files` in board-git-check.sh). Only ever do it in the state worktree: anywhere else it commits the board on main.
- `git check-ignore -v -z` needs `--stdin`. Its source path is relative from the main checkout and absolute from a linked worktree.
- The coordinator sends security reviews mid-run on the network hooks. To show a new contract case failing after the fix already exists, copy `HEAD`'s hook into a scratch `hooks/` dir with the current `lib/`, and run a copy of the contract with `sed`-rewritten `PUSH=` or `HOOK=` and `LIB_DIR=` lines.

**How to apply:** reach for these before touching board staging, the push or a fixture of an excluded project. See [[probe-hook-and-flush]] and [[worktree-guard-traps]].
