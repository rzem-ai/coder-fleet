---
name: check-all-result-line
description: check-all fails a section that exits 0 without a count or ok line unless it is in NO_COUNT_SECTIONS; stubs in the three harnesses must print one
metadata:
  type: project
---

Since CF-192.2 (2026-11-12) a check-all section that exits 0 must print a result line (positive `N passed`/`N cases`, bun's ` N pass`, or an `ok` line), unless it skipped or its label is in `NO_COUNT_SECTIONS` in check-all.sh.

**Why:** a contract cut to a shebang or `exit 0` used to print `<section>: ok`.

**How to apply:** a new contract must print a count. A new check-all section that has no count to print needs a row with a reason in `NO_COUNT_SECTIONS`. Any stub harness that runs a check-all copy (check-all-timing, check-all-ci-bun, check-all-lock) needs passing stubs that print `1 passed, 0 failed`, and its `bun` stub must print ` 1 pass`, or the stubbed board section fails.
