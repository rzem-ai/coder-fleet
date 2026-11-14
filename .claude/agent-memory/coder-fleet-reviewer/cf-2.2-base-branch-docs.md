---
name: cf-2.2-base-branch-docs
description: CF-2.2 (old CF-209.5) prose round 1 - unset release is off under push base-only (push-policy.py tagblock); prose saying "unset leaves it to shipping words" without that exception contradicts code
metadata:
  type: project
---

Unset `release` under `push: base-only` behaves as `off`: push-policy.py sets `tagblock = release == 'off' or (release == 'unset' and base_only)`. lead-procedures and templates/AGENTS.md carry the exception; round 1 found lead.md step 5, claude/README.md settings paragraph and root AGENTS.md Releasing without it.

**Why:** the brief named this exact contradiction as the thing to look for; prose that says "unset leaves it to the shipping words" unqualified is wrong for base-only projects.

**How to apply:** on later rounds grep every "unset" near `release` across lead.md, both READMEs, both AGENTS.md. lead.md step 5 sat at 244 of 250 words (roster-contract.sh lead-step-length), so a fix there must trim elsewhere. The boards CLI (`bun .../cli.ts show`) is refused by the reviewer scope hook; read the card file under the state worktree's `.boards/tasks/` instead. See [[cf-209.3-push-release-policy]].
