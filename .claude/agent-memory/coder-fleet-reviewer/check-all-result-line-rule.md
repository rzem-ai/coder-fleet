---
name: check-all-result-line-rule
description: CF-192.2 made check-all fail any section that exits 0 without a count or ok line unless it is in NO_COUNT_SECTIONS or touched CHECK_ALL_SKIP_FILE; a contract's own skip path must touch that file
metadata:
  type: project
---

From CF-192.2 (reviewed 2026-11-12 at 615293f), check-all.sh's `run` fails a section that exits 0 unless its output matches `RESULT_LINE` (a positive `N passed`/`N cases`, bun's ` N pass`, or a line-leading `ok`), its label is in `NO_COUNT_SECTIONS` (board install, syntax, fleet-config, glossary, agent pairs, versions; lead's default on the card), or it touched `$CHECK_ALL_SKIP_FILE`.

**Why:** the CF-192 trap was a 0-byte contract printing ok; the card widened it to shebang, comments, early exit and "0 passed".

**How to apply:** any contract with a skip path that prints and `exit 0` must touch `$CHECK_ALL_SKIP_FILE` (as opencode/test/run.sh's `missing` does), or it goes red locally. At 615293f `board-backfill-contract.sh:37` (bun/jq missing) did not, raised round 1; fixed at 14b8b6d (touches the file locally, exits 1 under CI like no_bun), and check-all-ci-bun now copies the real contract for its two no-bun runs. At 14b8b6d no other `run` contract has an exit-0 skip path (opencode-unit execs opencode/test/run.sh, which touches it). The three stub harnesses (check-all-timing, -ci-bun, -lock) stub every contract with a count line, so they never exercise a real contract's skip path. Check new `run` sections against the regex and the exempt list. See [[cf-192-reviewer-modes-settled]].
