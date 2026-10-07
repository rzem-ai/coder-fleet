---
id: CF-76
title: >-
  Board suite fails in the full run on a different actions-for-human test each
  time
status: To Do
assignee: []
created_date: '2026-09-30 00:39'
updated_date: '2026-10-07 10:17'
labels:
  - board
dependencies: []
priority: Medium
type: bug
ordinal: 197000
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

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

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

author: lead
created: 2026-10-06 09:50
---
2026-10-06: seen twice more on CF-145's branch (ea18436: cli-check-uncheck 13.8 s; 6700717: cli-commit-subjects 12.3 s, both against the 10 s limit in actions-for-human-cli.test.ts), each time while another review round ran its suite on the same machine, and each passing alone. The suite now runs its sections at once (CF-56), so the board's per-test 10 s limit meets more contention than when this was filed. Not ordered; the lead will raise it if the refuter's baseline on CF-145 hits it with the machine otherwise quiet.
---

author: lead
created: 2026-10-06 10:10
---
2026-10-06: CF-145's merged head bbdc2bf passed check-all with the board section green (301/0) on a quiet machine, after both earlier runs on that branch failed this file's 10 s limit under concurrent load. Consistent with load sensitivity; still not ordered.
---

created: 2026-10-06 14:19
---
2026-10-07, lead. Another instance, and this one had no other suite running. The CF-2 close at 14:13:59Z failed FAILED: board with a total of 69.7 s; the lead reran check-all.sh alone on the same commit (0151e53) and it passed, board 93.0 s, total 106.0 s, with ps showing no other bun or check-all process. The only difference from a quiet machine: the session's board web UI was up on port 42024 the whole time. Two runs, two outcomes, same commit: an intermittent failure by the glossary's definition. The failing comment was lost to the '---' bug (CF-138) so the test name is unknown; the hook log holds only the summary. Fifth gate failure on this in two days.
---

created: 2026-10-07 10:17
---
2026-10-07 10:15Z, lead. Another instance, and this one was in board-hook-contract rather than the board section. The CF-156 close's check-all (179.7 s) failed only board-hook-contract; rerun alone on the same commit with no other check-all or bun test process running, it passed 272 of 272 across 4 shards. Two runs, two outcomes: an intermittent failure. The failing case's name was lost again, because this session runs the cached plugin 0.37.5, which predates CF-138's comment fix, so the gate comment was refused for its --- line.
---
<!-- COMMENTS:END -->
