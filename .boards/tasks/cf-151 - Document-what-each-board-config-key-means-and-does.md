---
id: CF-151
title: Document what each board config key means and does
status: Blocked by human
assignee: []
created_date: '2026-10-06 13:30'
updated_date: '2026-10-06 13:45'
labels:
  - board
  - docs
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
- [ ] #1 docs/board-config.md has one entry for every key parseConfig reads, including the list keys and any key it reads outside the switch, each with its type, its default when absent, and what it does, stated from the code that reads it with a file:line reference
- [ ] #2 A key that parses but that nothing in the fork reads any more is marked as having no effect, naming what upstream used it for where NOTICE.md or the code says
- [ ] #3 Each entry says whether the fleet depends on the key (hooks, commands, the MCP tools or the gate) and what breaks if it is changed, and the statuses entry states the six fleet columns and that Done must be last
- [ ] #4 An example config.yml for a fleet project is in the page, and it matches this repo's own .boards/config.yml keys
- [ ] #5 README.md and the help-boards skill link to the page
- [ ] #6 bash claude/evals/lib/check-all.sh passes
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
<!-- COMMENTS:END -->
