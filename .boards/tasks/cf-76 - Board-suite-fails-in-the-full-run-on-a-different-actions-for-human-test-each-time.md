---
id: CF-76
title: >-
  Board suite fails in the full run on a different actions-for-human test each
  time
status: To Do
assignee: []
created_date: '2026-09-30 00:39'
updated_date: '2026-09-30 10:04'
labels:
  - board
dependencies: []
priority: Medium
type: bug
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen during CF-73, on main and on the branch alike. `bun test --timeout=10000` in claude/coder-fleet/board fails one test in src/test/actions-for-human-core.test.ts per full run, a different one each run (seen: demote-out-of-queue-clears x2 variants, clear-with-tick-and-move, tick-add-and-leave). Run alone, the file passed 50/50 three times in a row. The full-run log shows "Lock file is already being held", so shared lock or temp-dir contention between concurrent test files is the lead suspect, not yet confirmed. Separately, four failures are stable in every run: McpServer bootstrap > createMcpServer wires stdio-ready instance; package bin wrapper > points to scripts/cli.cjs to own .bin/backlog; and cli-launcher.test.ts and resolveBinary.test.ts erroring on the missing ../../scripts/resolveBinary.cjs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Three consecutive full `bun test --timeout=10000` runs in claude/coder-fleet/board show no failure in actions-for-human-core.test.ts, with the root cause named in a comment
- [ ] #2 The four stable failures are fixed, or their tests removed with the reason recorded where the trimmed fork records removals
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 04:12
---
2026-09-30, from the CF-48 coder's board suite run: another rotating actions-for-human-core failure name, 'tick-with-leave: the tick lands first...', together with an unhandled 'Task not found: BD-1' between tests. That fits the shared-state or lock contention suspicion.
---

created: 2026-09-30 05:39
---
2026-09-30, from the CF-80 coder's board suite run: another rotating failure name, 'archive-clears-before-move' (actions-for-human-core.test.ts), logged alongside 'Lock file is already being held' and 'Task not found: BD-1'.
---

created: 2026-09-30 09:07
---
2026-09-30, from the CF-24.2 coder: a second file fails intermittently, content-store.test.ts. Three runs on one commit gave three outcomes: 'promotes the surviving same-path branch version before watched deletion publication' timed out in the full run, a different test failed when the file ran alone, and all 67 passed on the third run. The failures are watcher-timing tests. Base 46c6c51 passed 67/67 once. It is the same class as the actions-for-human-core failures: timing and shared state under load.
---

created: 2026-09-30 10:04
---
2026-09-30, from the CF-24.1 refuter's check-all baseline: another board test timed out under load, 'task edit and the Actions for Human > cli-commit-subjects ... timed out after 10000ms' (193 pass, 1 fail). The board wasn't touched by that change. Same class: timing and shared state under parallel load.
---
<!-- COMMENTS:END -->
