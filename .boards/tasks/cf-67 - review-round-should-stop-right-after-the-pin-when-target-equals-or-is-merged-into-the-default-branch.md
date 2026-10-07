---
id: CF-67
title: >-
  review-round should stop right after the pin when target equals or is merged
  into the default branch
status: To Do
assignee: []
created_date: '2026-09-29 12:28'
updated_date: '2026-10-07 04:08'
labels: []
dependencies: []
references:
  - CF-3
priority: Low
type: enhancement
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-3 reviewer (2026-09-29). A `target` equal to the default branch, or already merged into it, spends one scout scope lane and then reports "nothing to review". That outcome is honest, but the lane is wasted. Decide whether to throw right after the pin lane with an error naming the empty range.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The human decides whether review-round stops right after the pin lane when the target equals the default branch or is already merged into it; the decision is recorded on this card
- [ ] #2 If the decision is to stop: review-round throws after the pin lane with an error naming the empty range, spawning no scope lane, proven by a workflow-logic.mjs case seen failing first
- [ ] #3 If the decision is not to stop: the card closes as decided, with no code change
- [ ] #4 bash claude/evals/lib/check-all.sh passes on the branch where code changed
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
created: 2026-10-07 04:08
---
2026-10-07, lead, on the human's request to check every To Do card has acceptance criteria: the provisional criterion is replaced with criteria written from this card's own description, which asks for a decision first. The card's title was stored as a YAML block marker; it is restored from the board listing. Not ordered.
---
<!-- COMMENTS:END -->
