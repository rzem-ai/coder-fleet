---
name: ignored-memory-rule-and-flush
description: CF-189's lead rule for a project that gitignores .claude/agent-memory/ assumes CF-188's flush skips ignored paths; check merge order, and the flush's leftover check
metadata:
  type: project
---

CF-189 (reviewed 2026-11-12 at c339193) added a paragraph to lead-procedures under Worktrees and memory: in a project that ignores `.claude/agent-memory/`, memory still lands on `coder-fleet/state` (the hook commits with hash-object/update-index/commit-tree, never `git add`), the lead never force-adds, and memory that never reaches the default branch is not a failure. Its last clause ("a flush that skips ignored paths") is only true once CF-188 (PR #154, flush.ts skipping ignored paths) merges; at e7c332e the flush lands ignored notes on the default branch.

CF-188 round 1 (161b8fd, 2026-11-12): the skip works, but `clearMemoryLeftovers` still compares the main checkout's memory against the flush commit, so a skipped note's disk copy counts as "kept" and `fastForwardMain` refuses on every flush in a memory-ignored project. A skip held back by a failed `restartState` is also never judged again, since the tip's `From coder-fleet/state at` line then names a state commit after it.

CF-188 round 2 (7e0083b): fixed by passing the held set (`skipped` paths) to both leftover checks, so a held path is skipped there rather than judged against the state branch. That's sound for memory: the ff never touches an untracked held note. The same skip in the `.boards` check had no test of its own and also stops clearing a held leftover that matches the flush. The failed-restart follow-up stays open with the human.

CF-188.1 round 1 (87fa536, approved): the failed-restart path closes with a local ref, `refs/coder-fleet/held` = the carry commit, written only when the restart fails and a carry exists, and deleted otherwise. The next flush feeds that carry's paths (HELD_REF^..HELD_REF) into buildTree's `also`, taking the state branch's version wherever it differs from the tip. That is the same semantics as a normal carry, so a held path overriding a later main edit is not a regression. A separate open card covers the restart dropping untracked memory in memory-ignored projects (the human chose "release, file a card"), so don't re-raise it against CF-188.1.

**Why:** the rule was written against post-CF-188 behaviour while CF-188 was still unmerged, and the skip changes what "matches the flush" means for every leftover check downstream.

**How to apply:** in a later review of CF-188, CF-189 or a release carrying either, check both landed together before calling the rule true, and check that leftover clearing judges skipped paths against the state branch, not the flush commit. Related: [[memory-state-carry-rule]].
