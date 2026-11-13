---
name: check-all-scratch-trees
description: a new check-all section that cds into a package fails check-all-lock and check-all-ci-bun unless their scratch trees mkdir that package dir
metadata:
  type: feedback
---

A new `run <label> <fn>` section in claude/evals/lib/check-all.sh that cds into a package directory breaks the contracts that copy check-all into a scratch tree with a stub bun on PATH: check-all-lock.sh (7 cases fail) and check-all-ci-bun.sh. check-all-timing.sh has no bun on PATH and is unaffected.

**Why:** CF-207.2 (2026-11-14) added the `boards` section, and the first full run failed check-all-lock for this alone.

**How to apply:** grep claude/evals/lib for `coder-fleet/board` and add the new dir to each scratch `mkdir -p`; in check-all-ci-bun also add the label to its fail and skip loops. Bun 1.4.4 has Bun.YAML (parse, stringify(obj,null,2) block style), so a new Bun package can skip gray-matter and need no install. See [[check-all-result-line]].
