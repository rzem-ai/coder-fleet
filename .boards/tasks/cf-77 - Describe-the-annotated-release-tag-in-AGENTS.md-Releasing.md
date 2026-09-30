---
id: CF-77
title: Describe the annotated release tag in AGENTS.md Releasing
status: To Do
assignee: []
created_date: '2026-09-30 03:05'
labels: []
dependencies: []
priority: Low
type: docs
ordinal: 108000
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
