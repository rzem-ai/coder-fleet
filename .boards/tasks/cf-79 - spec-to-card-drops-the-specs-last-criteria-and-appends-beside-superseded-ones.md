---
id: CF-79
title: spec-to-card drops the spec's last criteria and appends beside superseded ones
status: To Do
assignee: []
created_date: '2026-09-30 03:28'
labels:
  - workflow
dependencies: []
priority: Medium
type: bug
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen 2026-09-30 on CF-51 (run wf_a8a7f51e-c7f, result in its journal.jsonl). The approved docs/specs/CF-51.md has 27 numbered acceptance criteria. The card stage returned "filed":23 and wrote only criteria 1 to 23; 24 to 27 (migration checklist, check-all, version bump, annotated tag) were silently dropped, with no error or warning. It also added the 23 after the card's seven existing pre-spec criteria, leaving 30 on the card with the superseded ones first, so card numbers no longer matched spec numbers. The lead fixed CF-51 by hand with acceptanceCriteriaSet (card comment #14). Root cause not investigated. Suspects: the criteria reader stopping early inside the "Proof" group, or a cap on the number read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given an approved spec with 27 numbered criteria, spec-to-card files all 27, proven by a workflow logic test in check-all.sh with a fixture of more than 23 criteria under group sub-headings
- [ ] #2 When the card already carries criteria that are not in the approved spec, spec-to-card either replaces them with the spec's list in spec order or stops and reports the mismatch, and never appends silently beside them; a logic test covers the case
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
