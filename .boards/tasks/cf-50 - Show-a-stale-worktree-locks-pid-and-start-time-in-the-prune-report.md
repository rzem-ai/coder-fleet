---
id: CF-50
title: Show a stale worktree lock's pid and start time in the prune report
status: To Do
assignee: []
created_date: '2026-09-27 08:01'
updated_date: '2026-09-30 14:03'
labels: []
dependencies:
  - CF-41
priority: Low
type: enhancement
ordinal: 236000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-41 coder, 2026-09-27. After CF-41, prune-worktrees never unlocks or removes a locked worktree (the harness locks one only while its agent runs, reason `claude agent <id> (pid N start <date>)`). A lock left by a crashed agent therefore keeps its worktree forever, and the report only says `kept <path> locked`. Report the lock reason's pid and start time, and whether that pid is alive, so the human can judge and unlock by hand. The script itself still never unlocks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A kept locked line carries the lock's pid and start time, and whether the pid is alive
- [ ] #2 The script still never runs git worktree unlock, pinned by the existing static check
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
