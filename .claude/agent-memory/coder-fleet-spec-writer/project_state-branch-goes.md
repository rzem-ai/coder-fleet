---
name: state-branch-goes
description: CF-207 (approved 2026-11-14) removes coder-fleet/state; board, specs and run articles move to ~/.config/boards/<key>/, agent memory stays in the checkout's .claude/agent-memory
metadata:
  type: project
---

On 2026-11-13 the human ruled "just replace the old board system" (CF-207 comment #5), that the whole `coder-fleet/state` branch goes (comment #8), and "boards and board config should live in `~/.config/boards`". Specs live in the board's directory there, one per repo keyed by origin URL. On 2026-11-14 the human added that docs/runs and specs "should also live under `.config/boards/` since everything else, other than memories, is out": run articles go to the board's `runs/` beside `specs/`.

Memory: on 2026-11-14 a proof showed Claude Code 2.1.323 makes subagent memory read-only when `.claude/agent-memory` is a symlink. The human then said "Just use agent memory as Claude Code wants it": `memory: project`, real files in each checkout's `.claude/agent-memory`, excluded from git, no symlink, copy or branch. Accepted cost: a worktree's memory goes with the worktree. Agent memory is the only fleet file left in a checkout.

**Why:** the human picked a home-directory board, accepted single-machine storage, and won't fight the harness over memory.

**How to apply:** once CF-207 ships, specs and run articles no longer live at `docs/specs/` or `docs/runs/` or on the state branch; check the glossary's Spec and Run article rows. Never propose symlinking agent memory again. Until CF-207 ships, the old paths still hold. See [[new-mod-no-migration]].
