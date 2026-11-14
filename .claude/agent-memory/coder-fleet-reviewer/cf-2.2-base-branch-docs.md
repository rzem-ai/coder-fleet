---
name: cf-2.2-base-branch-docs
description: CF-2.2 (old CF-209.5) - unset release is off under push base-only (push-policy.py tagblock); round 2 at dd321d61 closed it in lead.md, claude/README.md and AGENTS.md (settled)
metadata:
  type: project
---

Unset `release` under `push: base-only` behaves as `off`: push-policy.py sets `tagblock = release == 'off' or (release == 'unset' and base_only)`. Round 1 found lead.md step 5, claude/README.md settings paragraph and root AGENTS.md Releasing without the exception; round 2 (dd321d61) added it to all three, matching lead-procedures, templates/AGENTS.md and hooks/README.md. Settled.

**Why:** prose that says "unset leaves it to the shipping words" unqualified is wrong for base-only projects.

**How to apply:** if this wording is touched again, grep every "unset" near `release` across lead.md, both READMEs, both AGENTS.md and lead-procedures. lead.md step 5 is at 245 words by `wc -w` after round 2 (cap 250, roster-contract.sh), so any addition there must trim. The boards CLI is refused by the reviewer scope hook; read the card file under the state worktree's `.boards/tasks/` instead. See [[cf-209.3-push-release-policy]].
