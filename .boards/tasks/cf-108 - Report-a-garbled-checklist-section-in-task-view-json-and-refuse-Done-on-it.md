---
id: CF-108
title: 'Report a garbled checklist section in task view --json, and refuse Done on it'
status: To Do
assignee: []
created_date: '2026-09-30 14:30'
updated_date: '2026-10-04 21:06'
labels:
  - board
  - hooks
dependencies: []
priority: Medium
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-24.4's review (2026-10-01). A Definition of Done section with a repeated DOD:BEGIN, a stray END or an unclosed BEGIN makes parseAllChecklistItems (board/src/markdown/structured-sections.ts:1093) return [] with no signal. The card gate then reads `definitionOfDone: []` as nothing to tick, so a card with unticked DoD items reaches Done. A hand edit or a bad backfill could cause it. The same fault in the criteria section fails closed, because zero criteria is refused. Also, for the human to decide: whether the lenient could-not-read path should leave a card comment and not only a log line, since a stale ~/.local/bin/board passes every card silently under lenient (spec Q15 currently says log only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 task view --json marks a checklist section whose markers are repeated, stray or unclosed as garbled, instead of returning an empty list, with fork tests seen failing first
- [ ] #2 TaskCompleted's card gate treats a garbled section as unreadable (strict refuses, lenient follows the human's decision below), with board-hook-contract cases
- [ ] #3 The human's decision on whether the lenient could-not-read path also comments on the card is recorded here and built
- [ ] #4 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-04 21:06
---
Reproduced by the CF-24.4 round 2 refuter against the real binary (2026-10-05): a card with a repeated `<!-- DOD:BEGIN -->` around an unticked DoD item returns `definitionOfDone: []` from `task view --json`. Under both strict and lenient gates TaskCompleted exits 0 and logs '...every criterion and Definition of Done item is ticked', which is false. The Done write then fails on the malformed markers, so the task completes while the card stays put. The probe is in the session scratchpad (refuter-1791123130/probe). New detail for this card: the gate's ticked log line misreports a garbled card.
---
<!-- COMMENTS:END -->
