---
id: CF-151
title: Document what each board config key means and does
status: Done
assignee: []
created_date: '2026-10-06 13:30'
updated_date: '2026-10-06 13:50'
labels:
  - board
  - docs
  - outcome/shipped
dependencies: []
priority: Medium
type: docs
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-07: "I can't find any documentation around what the config parameters in `parseConfig` actually mean and do". Nothing documents the keys of `.boards/config.yml`. `parseConfig` in `claude/coder-fleet/board/src/file-system/operations.ts` (about line 2111) reads 21 scalar keys (project_name, default_reporter, default_status, definition_of_done, date_format, max_column_width, default_editor, auto_open_browser, hide_empty_columns, default_port, remote_operations, auto_commit, filesystem_only, zero_padded_ids, bypass_git_hooks, require_acceptance_criteria, check_active_branches, active_branch_days, on_status_change, task_prefix, backlog_directory) and list keys through parseConfigListValue (ConfigListKey at line 73: statuses, labels, types, priorities, projects, default_assignee). The board is a trimmed fork of Backlog.md (see `claude/coder-fleet/board/NOTICE.md`), so some keys may still parse while their consumer was deleted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/board-config.md has one entry for every key parseConfig reads, including the list keys and any key it reads outside the switch, each with its type, its default when absent, and what it does, stated from the code that reads it with a file:line reference
- [x] #2 A key that parses but that nothing in the fork reads any more is marked as having no effect, naming what upstream used it for where NOTICE.md or the code says
- [x] #3 Each entry says whether the fleet depends on the key (hooks, commands, the MCP tools or the gate) and what breaks if it is changed, and the statuses entry states the six fleet columns and that Done must be last
- [x] #4 An example config.yml for a fleet project is in the page, and it matches this repo's own .boards/config.yml keys
- [x] #5 README.md and the help-boards skill link to the page
- [x] #6 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @SubagentStop
created: 2026-10-06 13:40
---
Blocked by human. coder-fleet:tech-writer raised 1 blocker(s). From "## Decisions needed" in its handoff:

- the `help-boards` line cannot ship until someone with write scope adds it; please commission it or apply the line above.
---

created: 2026-10-06 13:45
---
Sub-issue 1 of 1: ready to merge in PR #72. Done still needs: criteria 1-6 proven on main, the v0.37.6 release.

Done: you can read docs/board-config.md on the branch, which covers all 27 keys with type, default, effect (file:line) and fleet dependency, marks six keys as having no reader and three as forced by the board, and has an example config.yml. The README and the help-boards skill link to it; the lead added the skill line because the tech-writer's scope hook refused it. The lead checked the parser claims against operations.ts (line reader, forceFilesystemOnly, zero_padded_ids parseInt) and removed the first-person voice. check-all.sh passed on the branch (190.8 s, exit 0).

Not done: not merged yet, so main has no page; the release bump is still to come.
---

author: @board
created: 2026-10-06 13:45
---
Actions for Human cleared by @lead, moving no column: Void: the lead added the help-boards line itself in PR #72, so nothing is waiting on the human.

- #1 (open) [not a question] the `help-boards` line cannot ship until someone with write scope adds it; please commission it or apply the line above.
---

created: 2026-10-06 13:48
---
Sub-issue 1 of 1: merged to main at 46025f7. Done still needs: nothing.

Done: docs/board-config.md is on main and in release v0.37.6 (tag at 1affee6, the release commit). You can look up any .boards/config.yml key there: all 27 keys with type, default, effect with file:line, and whether the fleet depends on it. README.md section 3 and the help-boards skill link to it.

Evidence per criterion: 1-4 are the page itself, read against the parser by the lead (operations.ts line reader at 2122, forceFilesystemOnly at 234, zero_padded_ids parseInt at 2178). 5 is the README paragraph and the help-boards line in commit 8817fa2. 6 is check-all.sh exit 0 on the branch (190.8 s) and CI 'deterministic' SUCCESS on 1affee6.

Definition of Done: 1 as criterion 6. 2: a docs change, so the review was the lead's own pass per lead.md step 4, and no refuter round applies since no code path changed. 3 not applicable: no skill frontmatter or agent body changed, only one body line in help-boards. 4: v0.37.6 bumped in both files, tagged and pushed. 5 not applicable: no ported artefact changed. 6 not applicable: no spec.

Not done: nothing on this card. Unverified claims the page itself labels as untraced (on_status_change reach, default_status outside statuses, ids under a dropped prefix).
---
<!-- COMMENTS:END -->
