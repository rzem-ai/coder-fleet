---
name: cf-1.2-fleet-tools-port
description: CF-1.2 (CF-207 group G part 2) - fleet scripts ported to `boards fleet <tool>`, old paths are shims through boards/boards.sh (sourceable, boards_run); bun-less installs fail closed until CF-1.4 fetch
metadata:
  type: project
---

CF-1.2 round 1 (2026-11-15, base 067a9721, head 0f66498f): every fleet-config, remote-guard, reviewer-modes, gates, challenge-gate, prune-worktrees, fleet-agents, fleet-exclude, editor-leftovers and fleet-trunk script is a shim calling `boards/boards.sh fleet <tool>` (src/fleet/*.ts). boards.sh runs bin/boards-<os>-<arch> if built, else `bun --no-env-file src/main.ts` from the package dir with BOARDS_CALLER_CWD; main.ts dispatches `fleet` before loading any board module, so no node_modules needed. Binary compiled with autoloadBunfig/autoloadDotenv false; selfCommand gives source children cwd PACKAGE_DIR. Sourced shims eval NAME='value' lines; yes-or-no answers need the exact word plus exit 0. Permitted test change: three `ln -s $PLUGIN_ROOT/boards` lines (fleet-layout, prune-worktrees, scope-hook contracts); binary.test.ts gained two additive tests. Parity with review-round.js is pinned by existing workflow-logic.mjs checks through the fleet-config.py shim.

Round 2 (fix cefa2295, for CI's state-push P07 4 s ceiling): boards.sh is sourceable and defines boards_run (the four sourced bash shims use it; source failure defines a 127 fallback); platform from OSTYPE/HOSTTYPE; state-push judges all keys per scope with `remote-guard allowed-keys` (NUL pairs then `end`, no end refuses); cli.ts imports tool modules lazily. Leaks into caller: only `_boards_*` vars and boards_run, no exports, no options. No contract pins the cut-short-answer refusal (dropped as Low per brief).

**Why:** an install has no bin/ until CF-1.4 fetches it, so on a machine without bun every shim gives its refusing answer (remote guard refuses all keys, so fast-forward and state push stop; config honours nothing).

**How to apply:** when CF-1.4 lands, check the fetch puts the binary at boards/bin/boards-<os>-<arch>, the exact name boards.sh tests (HOSTTYPE, so an x86_64 bash on arm picks x64). lead.md step 3 still names `python3 -I .../challenge-gate.py` while lead-procedures names boards.sh directly; both work. See [[cf-1.1-boards-binary]].
