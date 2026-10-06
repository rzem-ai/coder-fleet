---
id: CF-146
title: >-
  Make task_edit and task_create return a short acknowledgement instead of the
  whole card
status: In Progress
assignee: []
created_date: '2026-10-06 04:24'
updated_date: '2026-10-06 07:02'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board/src/mcp/tools/tasks/handlers.ts
priority: High
type: enhancement
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human on 2026-10-06 after the lead's session review. Every comment the lead appends with task_edit returns the full card, 55 to 67 KB on a long card, into the lead's context. Thirty of those in a session consume most of the lead's working memory with echoes of what it already knows. The board MCP server is the fork under claude/coder-fleet/board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MCP task_edit returns the task id, the names of the fields it changed, and the numbers of any comments or actions it appended, in under 500 characters
- [ ] #2 MCP task_create returns the task id, the title and the file path
- [ ] #3 task_view is unchanged and still returns the full card
- [ ] #4 Board tests cover both tool results and were seen failing first; NOTICE.md records the divergence from upstream; check-all is green and the version is bumped
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

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-06 07:02
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-4. Runs in parallel with CF-147 (different files); version 0.35.3 assumed, the second PR to merge rebases.

Done: nothing yet; task_edit still returns the whole card.
Not done: the short acknowledgement.
---
<!-- COMMENTS:END -->
