---
name: scope-hook-test-traps
description: Traps when testing or mutating enforce-agent-scope.sh - fail-open ERR trap, inert quotes, scratch-copy steward failures, bun auto-install contrast
metadata:
  type: feedback
---

Learned on CF-199 (2026-11-12), changing the reviewer's gate rule.

- The hook fails OPEN on ERR (`trap ... exit 0`), and `deny` inside `$( )` denies nothing. Put every new test in an `if`, never a bare `[ ] && x`, and call anything that denies in the main shell.
- `strip_inert_quotes` runs first, so `npm ci "--ignore-scripts"` reaches a rule as the plain command. A quoted-option case needs a quote the shell reads differently (a space inside) to test the quote rule at all.
- A mutant in a scratch copy of `claude/` (rsync without node_modules) fails three fleet-steward "CODER_FLEET_REPO unset" cases at baseline, because the copy is not a repo. Compare mutant against that baseline, not against zero.
- A contract run left going while you edit the hook reads the hook per call, so its counts mix old and new. Take the red baseline from a run that finished before the first edit.
- bun 1.4.4's `bun test` does not auto-install even with `--install=force`; to show `--no-install` matters, contrast with `bun x.ts` (runtime), which does fetch.

- Security review sent CF-199 back twice for denylists of config (missed devEngines, then .env). Anything "the diff may not change" in the hook is an allowlist against the main checkout's HEAD read through git (`git diff -z <main HEAD>` plus `git status -z --ignored`), never the main checkout's working tree, whose untracked clutter false-refuses.

**Why:** each cost a run or a wrong conclusion on CF-199. **How to apply:** before writing scope-hook cases or a mutant, check these. Related: [[workflow-and-mutation-traps]], [[worktree-guard-traps]].
