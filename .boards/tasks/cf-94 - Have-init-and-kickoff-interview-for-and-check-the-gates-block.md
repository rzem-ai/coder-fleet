---
id: CF-94
title: Have /init and /kickoff interview for and check the gates block
status: To Do
assignee: []
created_date: '2026-09-30 09:12'
labels: []
dependencies:
  - CF-90
priority: Low
type: enhancement
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-90, 2026-09-30. CF-90 adds a ```gates``` block to templates/AGENTS.md, but /init doesn't ask the human for the project's gates, and /kickoff doesn't check that the block exists, so a project gets reviewers who can run nothing. instruction-file-contract.sh pins init's text word for word, so the change updates that fixture too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /init asks for the project's gate commands and writes the gates block; /kickoff reports a missing or empty gates block without changing anything unasked
- [ ] #2 instruction-file-contract.sh is updated and bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
