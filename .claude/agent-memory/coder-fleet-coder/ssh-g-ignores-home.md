---
name: ssh-g-ignores-home
description: the human rejected ssh alias lookups in board keying; never shell out to ssh for local-file work; ssh -G ignores HOME anyway
metadata:
  type: feedback
---

Board keying keys a remote's host as written and never runs ssh. A clone made through an ssh alias (`git@github-work:o/r.git`) gets its own board, and that cost is accepted.

**Why:** CF-207.2 round 2 (2026-11-14) added `ssh -G` alias resolution at a lead's default. The human removed it: "Why are you doing ssh alias lookups for local files". Shelling out to a network tool for a local-file feature reads as overreach. Also, OpenSSH finds ~/.ssh/config through the password database, not $HOME, so a test can't sandbox it by changing HOME.

**How to apply:** for board or storage work, don't reach for external tools (ssh, network) to make keys smarter. Raise it as a Propose item instead. If a lead's default asks for something like this, say what it costs in the handoff. See [[check-all-scratch-trees]].
