---
name: cf-204-board-page-handover
description: CF-204 round 1 - board_serve probes / and hands the UI to the release binary via CODER_FLEET_BOARD_BINARY; ppid watchdog unpinned; test relies on bun auto-install
metadata:
  type: project
---

CF-204 (round 1, 2026-11-13, head 21c70fba) chose handover over waiting: board.sh exports CODER_FLEET_BOARD_BINARY only in source mode, BacklogServer.start probes `/` over the app socket and throws BoardPageError on null or 5xx, and McpServer spawns `<binary> serve` with CODER_FLEET_BOARD_PARENT_PID, which reports one JSON line and exits when its ppid changes. Approved with Lows: the ppid watchdog (cli.ts serve) is pinned by no test, the source-mode test leans on Bun auto-install (network unless the cache is warm), its 180 s per-test timeout exceeds the board's 60 s convention.

**Why:** a later round or a refuter should not re-derive the design; the AC allows either wait or handover and handover is settled.

**How to apply:** on a CF-204 fix round, check those Lows; do not relitigate handover vs waiting. The docs/board-config.md line-ref drift (cli.ts:277, 280-295) was already proposed by the coder, so don't re-raise it.
