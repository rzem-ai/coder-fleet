---
name: cf-171-neutral-dod-settled
description: CF-171 - the /init template's Definition of Done is three project-neutral items; kickoff spots release steps by their text; the template never carried check-all
metadata:
  type: project
---

CF-171 (reviewed 2026-11-12, round 1) settled three things. The template `templates/board.config.yml` seeds three items: the reviewer approved with a break round where lead step 4 calls for one, the gates declared in AGENTS.md green, the spec linked. The general "docs updated" item was dropped on purpose because the card's criterion 1 lists only three kinds. `git log -S'check-all'` on the template is empty: no plugin version ever seeded coder-fleet's release list, so how Fathom's board got it is still unknown (most likely a lead copying this repo's list).

kickoff.md's Definition of Done paragraph spots release steps by text markers (check-all.sh, migration-checklist, plugin.json, marketplace.json, divergence register) and skips the coder-fleet repo by `claude/coder-fleet/.claude-plugin/plugin.json`. init step 3a edits both the state worktree copy and the main checkout copy; flush's `clearLeftovers` clears a main-checkout file whose bytes match, so the two copies don't conflict.

**Why:** these were judgement calls on that card, and the lead's defaults settled the break-round wording.

**How to apply:** don't raise the dropped docs item or the break-round wording again. Do check that the repo's refuter-era item ("a refuter round ran ... coder-fleet.json disables the refuter") is handled; round 1 noted kickoff's markers miss it.
