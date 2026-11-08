---
name: phrase-pinned-prose
description: Several contracts pin exact sentences in kickoff.md, init.md and docs/limits.md; grep evals/lib before rewording one
metadata:
  type: feedback
---

Before rewording a sentence in `commands/kickoff.md`, `commands/init.md` or `docs/limits.md`, grep `claude/evals/lib/` for it. `next-column-contract.sh` pins kickoff's Next paragraph verbatim (including the bare `git commit -m "Add the Next column..." -- .boards/config.yml` line and "say which branch that is before you ask") and the shape of init's existing-board bullet; `worktree-base-contract.sh` pins phrases in limits.md's worktree entry.

**Why:** on CF-183.1 a prose edit that added `git -C <path>` to those commands broke six next-column checks, and dropping a limits sentence the card ordered dropped broke worktree-base in the full suite.

**How to apply:** keep pinned phrases and put new meaning in a separate sentence; when the card itself retires a pinned sentence, remove the check in the same branch and say so in the handoff. See [[board-test-baseline]].
