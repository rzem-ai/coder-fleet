---
id: CF-66
title: >-
  review-round target should resolve against origin/<default> when local default
  is behind
status: To Do
assignee: []
created_date: '2026-09-29 12:28'
updated_date: '2026-10-06 12:11'
labels: []
dependencies: []
references:
  - CF-3
priority: High
type: enhancement
ordinal: 93000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-3 reviewer (2026-09-29). With CF-3, `target: <branch>` resolves to `<local default>...<branch>`. If local `main` is behind `origin/main`, the merge-base is older, so the diff picks up upstream commits that the branch merged in. Decide whether `target` should resolve against `origin/<default>`, and how to behave when there is no remote.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Folded into CF-126 (criteria 2 and 3 there), merged in PR #71, v0.37.5
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-06 04:24
---
2026-10-06, the human, in the session, ordered this together with CF-126 ('CF-66/CF-126: review-round pins against origin'). Built as one change with CF-126; see its comment for today's evidence. Raised to High.
---

author: lead
created: 2026-10-06 12:11
---
Delivered as part of CF-126 (PR #71, v0.37.5).
---
<!-- COMMENTS:END -->
