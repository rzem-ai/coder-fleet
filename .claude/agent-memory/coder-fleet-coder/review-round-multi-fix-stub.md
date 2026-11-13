---
name: review-round-multi-fix-stub
description: workflow-logic's responder() returns one fixed head from 'verify fix', so a test needing two or more fix rounds stops as "unverified fix"; wrap verify fix
metadata:
  type: feedback
---

In `claude/evals/lib/workflow-logic.mjs`, `responder()` answers every `verify fix` lane with the same head (`bbb2222`), so the second fix looks like no commit and the run stops as `unverified fix` after two rounds. A test that needs three rounds (CF-208's default cap) wraps the responder and returns `abc000<n>` per call, as the `worktree-per-round` check does.

**Why:** cost one failed run on CF-208 (2026-11-14) before the cap test passed.

**How to apply:** for any review-round test past two rounds, copy the `inner` wrapper from `worktree-per-round`. The harness default phase is harden; pass `'pin refs': BUILD` (defined near the build-phase section, so tests using it go after that line). See [[workflow-and-mutation-traps]].
