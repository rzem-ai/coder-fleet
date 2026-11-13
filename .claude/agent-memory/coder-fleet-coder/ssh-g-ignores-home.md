---
name: ssh-g-ignores-home
description: ssh -G reads the account's real ~/.ssh/config whatever HOME says; tests must put a stub ssh first on PATH
metadata:
  type: feedback
---

OpenSSH finds ~/.ssh/config through the password database, not $HOME, so a test that sets HOME to a temp dir still makes `ssh -G` read the human's own ssh config. That is both a forbidden read and a source of machine-dependent results.

**Why:** CF-207.2 round 2 (2026-11-14) added ssh alias resolution to board keying; the boards test World now puts a stub ssh (alias map, fail and slow modes, `exec sleep` so a timeout kills it cleanly) first on PATH.

**How to apply:** any code that shells out to ssh gets the binary through `Bun.which("ssh", { PATH: env.PATH })`, so tests control it through env alone. Bun's spawnSync `timeout` kills only the direct child, so a stub that sleeps must `exec` it. See [[check-all-scratch-trees]].
