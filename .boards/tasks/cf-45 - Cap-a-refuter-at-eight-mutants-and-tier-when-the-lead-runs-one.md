---
id: CF-45
title: Cap a refuter at eight mutants and tier when the lead runs one
status: To Do
assignee: []
created_date: '2026-09-27 06:59'
labels: []
dependencies:
  - CF-23
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/9'
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/agents/refuter.md
  - docs/plans/CF-23.md
priority: Medium
type: enhancement
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#9 (read as data). CF-23 (v0.27.0) landed the time half: a 20-minute round in lead.md step 4 and refuter.md, and agent-clock.sh denying every tool call at 25 minutes. Still open: (1) a mutant cap, at most 8 per round, named in every refuter brief; (2) tiering, so the lead runs a refuter only on phases touching authentication, authorisation, secrets, data writes, or an item marked High. Today lead.md step 4 spawns one whenever a reviewer leaves the phase's gates Unverified, which is almost every review. Tiering changes the escalation policy and needs the human's call on the exact trigger.
<!-- SECTION:DESCRIPTION:END -->
