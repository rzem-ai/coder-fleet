---
id: CF-148
title: 'Teach lead.md the build phase, and make an unparseable config mean harden'
status: In Progress
assignee: []
created_date: '2026-10-06 10:54'
updated_date: '2026-10-06 10:57'
labels: []
dependencies: []
references:
  - CF-145
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/hooks/lib/fleet-config.py
  - claude/coder-fleet/workflows/review-round.js
  - claude/coder-fleet/scripts/fleet-agents.sh
priority: High
type: enhancement
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human on 2026-10-06 from CF-145's review follow-ups, by AskUserQuestion: (b) "Yes, add the line": lead.md step 4 gets one sentence on how to read 'refutation skipped by build phase'; (c) "Unparseable means harden": a .claude/coder-fleet.json that exists but cannot be parsed means harden, like a failed read, with the parse error reported. The human also chose to keep this repo in build (no config file).

Why: build is now everyone's default (CF-145, v0.37.2), and lead.md step 4 still says a refuter runs on every code-path change, so the lead can read a build-phase approval as missing its refuter, or a refuter-free approval as complete without knowing why. And an unparseable file today reads as build with phaseState 'default', so a human who typed harden with a trailing comma gets the lenient phase; the reviewer found the parity fixtures pin that ('{\"phase\": \"harden\"' -> build|default).

Both readers are claude/coder-fleet/hooks/lib/fleet-config.py (via fleet-config.sh) and fleetConfigFrom in claude/coder-fleet/workflows/review-round.js, kept in parity by fixtures in claude/evals/lib/workflow-logic.mjs. scripts/fleet-agents.sh prints the phase; its message on an unparseable file is wrong today (reviewer low).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md step 4 says, in one sentence, that in build phase the refuter runs only on authentication or credential paths, and a review-round stop of 'refutation skipped by build phase' counts as the review being complete; lead.md keeps six steps and its line limit, and the migration checklist is run over it
- [ ] #2 A .claude/coder-fleet.json that exists but does not parse (trailing comma, BOM, truncated, not an object) means harden in both readers, with phaseState unread and a reason naming the parse failure; an absent file and an unknown phase value in a parsed file still mean build
- [ ] #3 The parity fixtures that pin unparseable files to build are changed to harden, each seen failing first, and both readers agree on every fixture
- [ ] #4 /coder-fleet:agents phase on an unparseable file says the file could not be read and the phase is taken as harden
- [ ] #5 check-all is green and the version is bumped
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-06 10:57
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-5. Version 0.37.3 assumed. CF-66/126 waits behind this one because both touch review-round.js.

Done: nothing yet; lead.md does not mention the build phase, and a config with a typo reads as build.
Not done: the lead.md sentence, the parse-failure rule in both readers, the fixtures, the agents command message.
---
<!-- COMMENTS:END -->
