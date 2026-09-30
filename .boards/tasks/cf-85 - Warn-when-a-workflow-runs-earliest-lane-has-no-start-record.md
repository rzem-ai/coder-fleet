---
id: CF-85
title: Log the silent fallbacks in workflow-run resolution
status: To Do
assignee: []
created_date: '2026-09-30 05:55'
updated_date: '2026-09-30 14:03'
labels:
  - hooks
dependencies:
  - CF-80
priority: Low
type: enhancement
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-80 review, 2026-09-30. At SubagentStop, CF-80 resolves a workflow run's item from the earliest-started lane that has a start record. If that lane's start hook failed (no jq, a timeout), state_earliest_started in claude/coder-fleet/hooks/lib/board.sh skips it without a word and takes the next-earliest lane. That lane may have started after a refocus, so the run lands on the new card and no log line says the earliest lane was missing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a workflow run has more lanes with transcripts than lanes with start records, SubagentStop logs a warning naming the run and the lanes with no start record, with a contract case in claude/evals/lib/board-hook-contract.sh
- [ ] #2 bash claude/evals/lib/check-all.sh passes
- [ ] #3 When agent_transcript_path contains /workflows/wf_ but run_id_from_transcript does not match (for example a harness layout change adding a path segment), SubagentStop logs a line saying the lane fell back to its own binding, with a contract case
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
created: 2026-09-30 06:49
---
Widened 2026-09-30 from the CF-80 round-2 review: the run-id regex is anchored at the end of the path, so if the harness ever adds a path segment under workflows/wf_<run>/, every lane would quietly fall back to its own start binding and the fathom bug would return with nothing in the log. Same kind of fix as the original criterion, so it is folded in here.
---
<!-- COMMENTS:END -->
