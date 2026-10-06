---
id: CF-145
title: >-
  Add a build/harden phase switch that review-round honours, and drop
  grep-presence checks on instruction prose
status: In Progress
assignee: []
created_date: '2026-10-06 04:24'
updated_date: '2026-10-06 09:02'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/lib/fleet-config.py
  - claude/coder-fleet/workflows/review-round.js
  - claude/evals/lib/next-column-contract.sh
  - claude/evals/lib/lead-rules-contract.sh
  - CF-111
priority: High
type: feature
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human on 2026-10-06 after the lead's session review (see CF-144 for the words). Adopted: a build/harden phase switch, and dropping grep-presence checks on prose.

Why: the pipeline has no way to say 'not yet' to a finding, so every finding becomes a fix round now. On CF-140 a refuter attacked instruction prose, its survivors forced a fix round that added phrase and negation greps, and the next refuter found six more survivors in those greps. Phrase-presence checks pass when contradicting text is added elsewhere, so they give false confidence and invite the loop.

The switch lives beside disabledAgents in .claude/coder-fleet.json, read live from the main checkout by the same two readers (hooks/lib/fleet-config.py and the JS reader in review-round), with their parity fixtures extended.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .claude/coder-fleet.json accepts phase: "build" or "harden"; absent means build; both readers agree on every fixture, including an invalid value, which is reported and treated as build
- [ ] #2 review-round in build phase runs one round, commissions no fix round for lows, spawns the refuter only when the diff touches authentication or credential paths, and reports proposals without filing them; in harden phase it behaves as today; both proven in workflow-logic tests
- [ ] #3 /coder-fleet:agents (or a sibling command) shows the phase and sets it with `phase build` or `phase harden`
- [ ] #4 Contract checks over agent bodies and skills are limited to structure: frontmatter fields, section order and count, step count, line limit, no dashes, no hard wraps; the phrase-presence and negation checks over lead.md and board-conventions in next-column-contract.sh and lead-rules-contract.sh are removed, and AGENTS.md says instruction prose is reviewed by reading
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
