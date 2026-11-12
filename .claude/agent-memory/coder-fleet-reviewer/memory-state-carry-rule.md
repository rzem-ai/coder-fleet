---
name: memory-state-carry-rule
description: memory-state.py harvest "nothing new" rule after CF-183.2.1 - record-only once a hand-over exists; main-checkout records owned by session since CF-183.2.2
metadata:
  type: project
---

Settled in CF-183.2.1 (round 2, 2026-11-12): once a checkout has a memory-base record, only `theirs == record` (or `== state`) counts as nothing new; a copy back at the start or HEAD copy is the agent reverting its edit and is carried. With no record, start or HEAD copy is still no change, which the main checkout's stop-restore relies on. Round 1's reviewer proposed exactly this, so do not relitigate it.

The trap it opened (a killed session's surviving main-checkout record, then a manual reset to HEAD, dropping unflushed lines at the next stop) was closed by CF-183.2.2 (PR #153, reviewed 2026-11-12) by session identity, not by clearing at do_start: main-checkout records are keyed by checkout and agent type only, so a sibling live session shares them and clearing at start could delete its record. `harvest()` writes `memory-base/<key>/<agent>.session/<rel>` holding the session_id, `record_is_mine()` lets only that session use the record as a base, `restore()` unlinks both. Worktree records always count. Settled, do not relitigate the ignore-vs-clear choice.

Known gaps after CF-183.2.2: the true branch of `record_is_mine` (a main-checkout same-session take-back) had no contract case at review time - making it always False passed the suite; two live same-type main-checkout sessions steal ownership from each other, so the earlier one loses a take-back (fails safe: no line of another session dropped); a resumed session keeping its session_id still owns its old record.

Deletions are not carried: a note deleted in an agent's own directory comes back at the next flush, and forgetting means deleting it in the state worktree. Only help-boards says so, and only lead and fleet-steward preload help-boards; after CF-193.3 split the skill, check the rule sits in the body rather than only in references/board-mechanism.md, which the lead reads on narrower triggers.

**Why:** the record is the full file as last handed over, so reverting to it reverts other sessions' unflushed lines too.

**How to apply:** on any later change to harvest, restore or do_start, check the ownership file is written and removed alongside the record, and that `theirs == last` still uses the unowned record only as "nothing new", never as a base; see [[gate-run-quirks]] for running the memory-state contract.
