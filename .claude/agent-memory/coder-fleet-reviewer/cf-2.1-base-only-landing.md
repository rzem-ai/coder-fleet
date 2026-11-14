---
name: cf-2.1-base-only-landing
description: CF-2.1 (old CF-209.4) push base-only landing - card lives on the state worktree's .boards; procedure commands match push-policy.py; accepted scope
metadata:
  type: project
---

CF-2.1 (old board CF-209.4) adds the `push: base-only` Shipping sequence in lead-procedures, `ready to land on <base> at <sha>` / `landed on <base> at <sha>` comment lines, drain/triage reading them, board-merged-cards.sh checking landed shas against local or origin trunk, and prune-worktrees.sh `is_landed` (patch-id of the whole worktree diff vs commits the trunk gained since the merge base, base-only only). Round 1 reviewed 2026-11-15 at 7b27b2c5.

**Why:** the board MCP task_view was unavailable to the reviewer; the card file was only at `.claude/worktrees/coder-fleet-state/.boards/tasks/cf-209.4 - ...md` (not the main checkout's .boards).

**How to apply:** accepted scope for later rounds: Done->Released via the new board's tag watch (group G), lead.md step 5 wording (CF-2.2), branch deletion after squash. The procedure's `git tag -a ... -m -m "Cards: ..."`, `git push origin vX.Y.Z` and `gh release create --verify-tag` are all what push-policy.py (CF-209.3) admits for the lead; check that pairing again if either side changes. An unread config makes FLEET_CONFIG_PUSH base-only, which also turns on is_landed in prune (harmless: patch-id match means the work is on trunk).
