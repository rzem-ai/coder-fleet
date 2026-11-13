---
name: state-branch-goes
description: CF-207 (approved 2026-11-14) removes coder-fleet/state; board, specs and run articles move to ~/.config/boards/<PREFIX>/, agent memory stays in the checkout's .claude/agent-memory
metadata:
  type: project
---

On 2026-11-13 the human ruled "just replace the old board system" (CF-207 comment #5), that the whole `coder-fleet/state` branch goes (comment #8), and "boards and board config should live in `~/.config/boards`". On 2026-11-14 the human added that docs/runs and specs "should also live under `.config/boards/` since everything else, other than memories, is out", and that a board's folder is named by its id prefix (`~/.config/boards/FTH/`), not its key. The prefix is unique on the machine and fixed once the board exists; the board's config records its key (normalised origin URL, or shared git dir path), and checkouts find the board by that key.

Memory: on 2026-11-14 a proof showed Claude Code 2.1.323 makes subagent memory read-only when `.claude/agent-memory` is a symlink. The human then said "Just use agent memory as Claude Code wants it": `memory: project`, real files in each checkout's `.claude/agent-memory`, excluded from git. Agent memory is the only fleet file left in a checkout.

**Why:** the human picked a home-directory board, accepted single-machine storage, and won't fight the harness over memory.

**How to apply:** once CF-207 ships, specs and run articles live in the board's `specs/` and `runs/`; check the glossary rows. Never propose symlinking agent memory again. Until CF-207 ships, the old paths still hold. See [[new-mod-no-migration]].
