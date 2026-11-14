---
name: fleet-tools-shims
description: Since CF-1.2 the fleet's hooks/lib and scripts pieces are TS in boards/src/fleet behind boards.sh; copied-fixture contracts, python3 pins, the bunfig cwd rule and the Write tool's raw U+2028 trap
metadata:
  type: project
---

Since CF-1.2 (2026-11-15), fleet-config, gates, reviewer-modes, remote-guard, challenge-gate, fleet-agents, prune-worktrees, fleet-exclude, editor-leftovers and fleet-trunk are TypeScript under `claude/coder-fleet/boards/src/fleet/`, run as `boards fleet <tool>`. The old files are shims onto `claude/coder-fleet/boards/boards.sh`, which runs `bin/boards-<platform>` or `bun --no-env-file src/main.ts` from the package directory, passing the caller's cwd in `BOARDS_CALLER_CWD`.

Traps met:
- Contracts that copy a single shim into a scratch plugin (scope-hook's no-checker case, prune M04, fleet-layout G01 to G03) cannot find boards.sh. 13 checks failed, raised as a Blocker.
- disabled-agents-contract pins python3 missing or broken, so configRead still parses through `python3 -I fleet-config.py`, a shim back onto `config parse`.
- `board-hook-no-bun.sh` (check-slow and CI) fails every card-gate case with no bun and no built binary.
- The Write tool stores ` ` inside a TS regex literal as a raw line separator, which is a syntax error. Escape such characters with a scratch python pass.
- Yes-or-no tools print a word and exit 0; the shims accept only that exact word, so a crash never reads as the permissive answer (the lead's rule).

**Why:** CF-1.3 and CF-1.4 build on these shims and on boards.sh.

**How to apply:** grep `claude/evals/lib` for `cp .*PLUGIN_ROOT` and `PATH=` stubs before porting a piece. Run contracts through a scratch wrapper to a file. Related: [[new-board-binary]], [[trunk-readers-traps]], [[gates-and-card-stub]].
