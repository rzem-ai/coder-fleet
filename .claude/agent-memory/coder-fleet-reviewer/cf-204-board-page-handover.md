---
name: cf-204-board-page-handover
description: CF-204 - board_serve probes / and hands the UI to the release binary; ppid watchdog unpinned; CI's 502 is the forwarder's 10 s timeout, so the probe's 30 s null branch is dead
metadata:
  type: project
---

CF-204 (round 1, 2026-11-13, head 21c70fba) chose handover over waiting: board.sh exports CODER_FLEET_BOARD_BINARY only in source mode, BacklogServer.start probes `/` over the app socket and throws BoardPageError on null or 5xx, and McpServer spawns `<binary> serve` with CODER_FLEET_BOARD_PARENT_PID, which reports one JSON line and exits when its ppid changes. Approved with Lows: the ppid watchdog (cli.ts serve) is pinned by no test, the source-mode test leans on Bun auto-install (network unless the cache is warm), its 180 s per-test timeout exceeds the board's 60 s convention.

Post-merge fix (branch cf-204-page-test-any-5xx, head 554998f4, 2026-11-13): CI's Linux runner answered 502, so the test's assertion became `/answered 5\d\d /`. The 502 is not Bun's: forwardToUnixSocket (server/unix-forward.ts) answers 502 after APP_ANSWER_TIMEOUT_MS = 10 s, which beats probePage's PAGE_PROBE_TIMEOUT_MS = 30 s, so a slow page reads "answered 502" and the "did not answer" null branch is unreachable from a timeout. Approved; that was raised as a follow-up, not a must fix.

**Why:** a later round or a refuter should not re-derive the design; the AC allows either wait or handover and handover is settled.

**How to apply:** on a CF-204 fix round, check those Lows; do not relitigate handover vs waiting or the 5xx loosening. The docs/board-config.md line-ref drift (cli.ts:277, 280-295) was already proposed by the coder, so don't re-raise it.
