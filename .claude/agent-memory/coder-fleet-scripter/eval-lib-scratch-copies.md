---
name: eval-lib-scratch-copies
description: Tests under claude/evals/lib that copy check-all.sh or check-slow.sh into a scratch tree must also copy any file those suites source
metadata:
  type: project
---

check-all-timing.sh, check-all-ci-bun.sh and check-all-lock.sh run a copy of check-all.sh in a scratch repo and stub every other `*.sh` in lib; check-slow-contract.sh does the same for check-slow.sh. A sourced helper (shards.sh style, e.g. ran-check.sh) gets stubbed or missed, and a missing `.` source only warns in bash unless the suite ends it with `|| exit 2`.

**Why:** CF-192.3 moved the "ran no check" rule into ran-check.sh and four tests needed the real file copied in.

**How to apply:** adding a sourced helper means (1) list it in suite-coverage.sh `helper()`, (2) copy it in those four tests, (3) stub checks in those tests must print a count (`1 passed, 0 failed`) or the rule fails them.

Tool traps: the worktree guard refuses heredocs and `git -C .` in the same Bash call; put Python edit scripts in the scratchpad and run them with `python3 -I`.
