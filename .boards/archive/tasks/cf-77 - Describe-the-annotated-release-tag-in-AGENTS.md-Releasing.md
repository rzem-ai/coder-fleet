---
id: CF-77
title: Describe the annotated release tag in AGENTS.md Releasing
status: To Do
assignee: []
created_date: '2026-09-30 03:05'
updated_date: '2026-10-07 03:54'
labels: []
dependencies: []
priority: Low
type: docs
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-51 spec interview (2026-09-30, card CF-51 comment #11): the human decided releases carry an annotated git tag `v<version>` on the release commit, matching the commit subject's prefix, pushed by the human with the branch. AGENTS.md's Releasing section describes a release without a tag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md Releasing says a release commit carries an annotated tag v<version> matching its subject prefix, pushed by the human with the branch
- [ ] #2 bash claude/evals/lib/check-all.sh passes
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
created: 2026-10-07 03:54
---
Archived 2026-10-07 on the human's word after a sweep of To Do against main: superseded by CF-28 (v0.39.5), which wrote the annotated vX.Y.Z tag into AGENTS.md Releasing (line 72): annotated, on the release commit CI proved, pushed with `git push origin vX.Y.Z` once the PR merges. What this card asks beyond that, pushing the tag with the branch, contradicts the rule the human adopted on CF-28, so nothing moves.
---
<!-- COMMENTS:END -->
