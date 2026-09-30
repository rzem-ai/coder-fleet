---
id: CF-73
title: Remove the dead Task Resolution Strategy setting from the board
status: To Do
assignee: []
created_date: '2026-09-30 00:16'
updated_date: '2026-09-30 00:16'
labels:
  - board
dependencies: []
priority: Low
type: chore
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The board web UI's Settings page shows a "Task Resolution Strategy" dropdown (web/components/Settings.tsx:370-383) described as resolving conflicts when tasks exist in multiple branches. The fork does not carry cross-branch loading: forceFilesystemOnly (file-system/operations.ts:234-240) disables checkActiveBranches and remoteOperations, and every buildTaskIdentityIndex caller passes [] for branchRecords (core/backlog.ts:925, 3818, 3884). The config parser and serialiser never read or write the key, so the value is always the fallback "most_progressed" (core/backlog.ts:3865) and the dropdown cannot change anything. Its only live effect is the tie-break for same-ID task files in the working copy, via selectTaskRecord (core/task-identity-index.ts:127-147).

Remove the setting, keep the behaviour. Paths are under claude/coder-fleet/board/src.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Settings page no longer renders a Task Resolution Strategy control, and no web component references taskResolutionStrategy
- [ ] #2 The taskResolutionStrategy field is gone from the config type in types/index.ts, and no source file under claude/coder-fleet/board/src reads it from config
- [ ] #3 Same-ID task records still resolve by the most_progressed rule (working copy first, then furthest status), proven by an existing or new test in the board's suite that passes
- [ ] #4 Tests that set taskResolutionStrategy on in-memory config objects are updated so the board's test suite and typecheck pass
- [ ] #5 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 00:16
---
Human's decision in session (2026-09-30): remove the setting rather than wire it up, and build now. Behaviour to keep: the fixed most_progressed tie-break for same-ID records. TaskIdentityIndex may keep its internal strategy parameter if that is the smaller change; only the config field, its reads and the UI control go. Sub-issue 1 of 1, starting now.
---
<!-- COMMENTS:END -->
