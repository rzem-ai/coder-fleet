---
name: cf-198-ignored-root-carry
description: CF-198 flush restart carries every state-branch file the tip ignores and lacks; consequences for skipped reporting and what the tests do not pin
metadata:
  type: project
---

CF-198 (reviewed 2026-11-12, round 1): flushState computes `untracked` = paths in stateTip but not in the flush commit (`--diff-filter=A`) that the tip's .gitignore ignores, and puts them back in the `Keep what the flush did not land` commit even when nothing was skipped. The ignoredAt filter is what keeps a deliberate, non-ignored deletion on main deleting from the state branch.

**Why:** a default branch that ran /init's Ignore answer (`git rm --cached`) has no copy of memory or the board, so a plain restart onto the flush commit lost every untouched file.

**How to apply:** in later flush reviews, expect every flush after a carry to re-judge the carried files from the flush commit, so the `skipped N change(s)` line counts the whole carried tree, not only changes (raised as a follow-up, not a defect). At round 1 no test deleted a non-ignored file on main, so the ignoredAt filter was unpinned; check whether a later change added one. See [[ignored-memory-rule-and-flush]].
