---
name: memory-state-carry-rule
description: memory-state.py harvest "nothing new" rule after CF-183.2.1 - record-only once a hand-over exists; main-checkout record lifecycle and the stale-record trap
metadata:
  type: project
---

Settled in CF-183.2.1 (round 2, 2026-11-12): once a checkout has a memory-base record, only `theirs == record` (or `== state`) counts as nothing new; a copy back at the start or HEAD copy is the agent reverting its edit and is carried. With no record, start or HEAD copy is still no change, which the main checkout's stop-restore relies on. Round 1's reviewer proposed exactly this, so do not relitigate it.

The trap it opens: in the main checkout `restore()` unlinks the record after putting the HEAD copy back, so a surviving main-checkout record means that stop never ran (a killed session) or restore bailed (state copy gone, OSError). If the file is then reset to HEAD by hand, the next stop's harvest takes HEAD over the state copy, dropping every unflushed line in the record. Raised as a follow-up on CF-183.2.1, not must fix.

Deletions are not carried: a note deleted in an agent's own directory comes back at the next flush, and forgetting means deleting it in the state worktree. Only help-boards says so, and only lead and fleet-steward preload help-boards; after CF-193.3 split the skill, check the rule sits in the body rather than only in references/board-mechanism.md, which the lead reads on narrower triggers.

**Why:** the record is the full file as last handed over, so reverting to it reverts other sessions' unflushed lines too.

**How to apply:** on any later change to harvest, restore or do_start, check whether a stale main-checkout record is cleared at start; see [[gate-run-quirks]] for running the memory-state contract.
