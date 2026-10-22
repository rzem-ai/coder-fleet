---
name: harness-count-wording
description: A change to the set of harnesses or ports leaves count words behind ("all three harnesses", "both ports") that a name grep misses
metadata:
  type: feedback
---

When a harness or port is added or dropped, grep for count words as well as the name: `git grep -niE '(two|three|both|all) (harness|port)'`. The README line in the repo trees of AGENTS.md and docs/fleet-design.md, and the comment in claude/evals/lib/requirements-source-contract.sh, carry counts.

**Why:** CF-176 (dropping Codex, 2026-10-22) passed its own `git grep -in codex` criterion while both trees still said "the front door for all three harnesses".

**How to apply:** on any harness-set change, run the count grep and check the tree's last-child box glyph (`└──`) moved too.

Reviewer scope hook quirks seen the same day: it refuses any `>` in a Bash command (`2>&1` included), the `test` builtin and `git merge-base`. Run `bash claude/evals/lib/check-all.sh` bare; output over ~60KB persists to a tool-results file to grep. A clean run ends "Every deterministic check passes." in about 80 s.
