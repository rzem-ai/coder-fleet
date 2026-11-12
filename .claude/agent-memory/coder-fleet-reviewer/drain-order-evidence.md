---
name: drain-order-evidence
description: How /coder-fleet:drain decides an In Progress card was ordered (CF-184.1), and how to check its board-history grep against this repo's state branch
metadata:
  type: project
---

From CF-184.1 (reviewed 2026-11-12), drain.md step 2 counts an In Progress card as ordered on a lead `started` comment, a recorded order, a branch or worktree of its own, or a `git log coder-fleet/state --glob='refs/coder-fleet/flushed/*' -p` grep for the latest `+status: Next|To Do` line. The human's move into Next lands on the state branch as a `Reorder tasks in Next` commit, so the history grep does work here; card files are `<id lower-cased> - <Title>.md`, status lines unquoted.

**Why:** a researcher's or spec-writer's start moves a card to In Progress, so the column alone is not an order (lead.md: never spawn a coder on unordered work).

**How to apply:** when drain's order rule changes, check that a parent's evidence is not borrowed from its sub-issues (sub-issue branches `cf-184.1-` are the parent's for the `held` check, which is right, but not proof the parent was ordered). Run the grep on a few real ids in the review worktree; it is read-only git and the hook allows it. Projects with `auto_commit: false` or no state branch get no history evidence at all.

Settled by the human 2026-11-12 (CF-184.1 actions, written into lead-procedures by CF-197): a sub-issue's started/ready/merged comments go on its own card, never the parent's; a Polish sub-issue filed after the order is part of the order and drain builds it with its parent. Don't relitigate. Drain's "card names each PR" recovery for a split parent lives only on the CF-184.1 branch (e8ace8a), so check it lands with or before CF-197.

Settled in CF-184.1 round 2 (e8ace8a): only a card's own branch (id lower-cased plus `-`) or a worktree on it is order evidence; `-` or `.` branches serve `held` and resuming only. Still open, not this card's: lead-procedures does not say which card a sub-issue's `started` comment lands on (CF-183, CF-187 and CF-192 put them on the parent, CF-193.x on the sub-issue), so a comment can still lend order to a parent; and step 3's "ordering a card orders its parts" builds a Polish child the lead filed after the order (CF-193's card says such a child waits for the human's go).
