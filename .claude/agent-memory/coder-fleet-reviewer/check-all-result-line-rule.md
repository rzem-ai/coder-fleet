---
name: check-all-result-line-rule
description: The ran-no-check rule (exit 0 needs a count/ok line, an exempt label or the skip file) lives in ran-check.sh from CF-192.3, shared by check-all and check-slow; contract skip paths must touch CHECK_ALL_SKIP_FILE
metadata:
  type: project
---

From CF-192.2 (reviewed 2026-11-12 at 615293f), check-all.sh's `run` fails a section that exits 0 unless its output matches `RESULT_LINE` (a positive `N passed`/`N cases`, bun's ` N pass`, or a line-leading `ok`), its label is in `NO_COUNT_SECTIONS` (board install, syntax, fleet-config, glossary, versions), or it touched `$CHECK_ALL_SKIP_FILE`. From CF-192.3 (reviewed 2026-11-13 at 32fdd525) the rule is `ran_no_check LABEL SKIPFILE OUTFILE` in the sourced `claude/evals/lib/ran-check.sh`, used by both check-all.sh and check-slow.sh; check-slow tees each section (stderr merged, needed because bun prints its ` N pass` summary on stderr) and exports CHECK_ALL_SKIP_FILE. opencode/test/run.sh's `missing` exits 1 under CI before touching the skip file, so the export cannot hide opencode-live in CI.

**Why:** the CF-192 trap was a 0-byte contract printing ok; the card widened it to shebang, comments, early exit and "0 passed".

**How to apply:** any contract with a skip path that prints and `exit 0` must touch `$CHECK_ALL_SKIP_FILE`, or it goes red locally. The stub harnesses (check-all-timing, -ci-bun, -lock, check-slow-contract) copy the real ran-check.sh and stub every other contract with a count line. Trap seen at CF-192.3: a red stub that prints nothing fails through ran-no-check even if the exit code is lost, so it does not pin pipefail; a red case must print a count and exit 1 to prove the exit code survives a tee. See [[cf-192-reviewer-modes-settled]].
