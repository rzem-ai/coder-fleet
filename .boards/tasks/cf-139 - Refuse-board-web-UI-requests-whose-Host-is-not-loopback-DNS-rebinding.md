---
id: CF-139
title: Refuse board web UI requests whose Host is not loopback (DNS rebinding)
status: In Progress
assignee: []
created_date: '2026-10-05 13:12'
updated_date: '2026-10-06 00:18'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board/src/server/index.ts
  - CF-128
priority: High
type: bug
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-10-05 by a background security review of 007510e (default_port 42024 in .boards/config.yml), and confirmed live by the lead. The board's web server (claude/coder-fleet/board/src/server/index.ts) answers any Host header: `curl -H 'Host: evil.example:42024' http://127.0.0.1:42024/api/tasks` returned 200. It also serves write routes (/api/tasks, /api/tasks/:id, /api/tasks/:id/complete, /api/config, /api/docs, /api/decisions, /api/drafts). A page in the human's browser can rebind its hostname to 127.0.0.1 and then read and edit the board same-origin; CORS doesn't apply. A random port only made this harder to find; CF-128's configured port (v0.33.0) makes the port predictable. The flaw itself predates CF-128 and comes from the upstream import. Mitigated meanwhile: the lead stopped this session's UI. Not yet ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every HTTP and WebSocket request whose Host header is not 127.0.0.1, localhost or [::1] (with the bound port, or none) is refused with 403 before any route runs, including static assets and /api/*
- [ ] #2 A request carrying an Origin header that is not the same loopback origin is refused on every state-changing method (POST, PUT, PATCH, DELETE)
- [ ] #3 When the human deliberately binds another interface with `board serve --host <h>`, that host is added to the allowed set and nothing else is
- [ ] #4 Tests prove a rebinding Host and a foreign Origin are refused and loopback succeeds, each seen failing first, and they are in BOARD_TESTS
- [ ] #5 check-all.sh is green, and the board's NOTICE.md records the change from upstream
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
created: 2026-10-05 13:21
---
2026-10-05, the human, in the session: "Fix it now, keep 42024". Ordered. Decisions recorded for the builder: (1) `default_port: 42024` stays in .boards/config.yml (007510e); the human will hold off /board until this fix is installed. (2) The fix goes in the board server: a Host allowlist (loopback names, plus an explicit --host when the human binds one deliberately) and an Origin check on state-changing methods. The configured-port feature (CF-128) is unchanged. (3) Escalation, since this is an authorisation path: deep review, a second review round after any fix, and a refuter round.

Sub-issue 1 of 1: started. Done still needs: criteria 1-5. Done: the hole is confirmed live (a forged Host header got 200 on /api/tasks), and this session's UI is stopped. Not done: the server still answers any Host, so a /board started before this lands is reachable by DNS rebinding.
---

author: @SubagentStop
created: 2026-10-06 00:18
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- Board fork `constants/index.ts:46` (under `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/board/src/`): `export const DEFAULT_STATUSES = ["To Do", "In Progress", "Done"] as const;`. Line 51: `FALLBACK_STATUS = "To Do"`.
- Board fork `utils/status.ts:12`: `config?.statuses && config.statuses.length > 0 ? config.statuses : [...DEFAULT_STATUSES]`. This is the validator. Lines 22-23 match case- and space-insensitively.
- Board fork `core/backlog.ts` falls back to `DEFAULT_STATUSES` at lines 567, 951, 1608 and 3307. Line 629: `Invalid status: ${status}. Valid statuses are: ...`.
- Board fork `utils/terminal-status.ts:1-4`: `getTerminalStatus` returns `statuses[statuses.length - 1]`. Done is the last entry in the list, by position and not by name.
- Board fork `core/actions-for-human.ts:10`: `export const HUMAN_QUEUE_STATUS = "Blocked by human";`. Lines 119-122: `statusChangeClearsActions` uses `isTerminalStatus`.
- Board fork `mcp/utils/schema-generators.ts:11-16`: the MCP `task_create`/`task_edit` enum is built from `config.statuses`, falling back to `DEFAULT_STATUSES`. It prepends "Draft" when the list lacks it: `return hasDraft ? normalizedStatuses : ["Draft", ...normalizedStatuses];`. Line 86 uses it for the `status` property.
- Board fork `mcp/tools/tasks/handlers.ts:128`: `config?.statuses ?? [...DEFAULT_STATUSES]`. Lines 308-327 group tasks in `config.statuses` order, with unlisted statuses appended after. Lines 500-531 use `getTerminalStatus(statuses) ?? "Done"`.
- Web column order comes from `config.statuses` passed as a prop. `web/App.tsx:236,392` loads it. `web/components/BoardPage.tsx:16` and `web/components/Board.tsx:22,357` render it. Line 357: `statuses.flatMap((status) => sortTasksForStatus(...))`. `web/lib/lanes.ts:331-359` builds one bucket per configured status.
- Tests with many status hits: `test/core-move-tasks-to-status.test.ts` (39), `test/actions-for-human-core.test.ts` (97), `test/status-callback.test.ts`, `test/mcp-actions-for-human.test.ts`, `web/lib/lanes.test.ts`, `test/web-board-drag-hidden-columns.test.tsx`. I did not open them to check which assert the literal list.
- `/Users/alex/Dev/Work/extensions/coder-fleet/.boards/config.yml:5`: `statuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]`. Line 6: `default_status: "To Do"`.
- `claude/coder-fleet/templates/board.config.yml:5`: identical `statuses` line. `/init` copies it to `.boards/config.yml`.
- `claude/coder-fleet/commands/init.md:40`: if the config lists `Doing`, offer the rename from kickoff.md. "A new board gets `In Progress` from the template."
- `claude/coder-fleet/commands/kickoff.md:29`: "Its `statuses` are the five the fleet uses, spelled `To Do`, `In Progress`, `Blocked`, `Blocked by human`, `Done` ... Any other word is a failure".
- CF-9 rename, `commands/kickoff.md:37-46`: line 39 lists `task list --status Doing --plain`. Line 43 edits `.boards/config.yml` in place, replacing `Doing` and fixing `default_status`. Line 44 commits the config alone. Line 45 runs `task edit <id> -s "In Progress" --by kickoff` per id. The human's yes comes first.
- The CF-9 card is `.boards/tasks/cf-9 - Rename-the-Doing-column-to-In-Progress.md`, status Done.
- `claude/evals/lib/board-backfill-contract.sh:105,221` write fixture configs with the five-status literal.
- Hooks `lib/board.sh:30-34` (under `claude/coder-fleet/hooks/`) sets the defaults: `BOARD_COL_TODO`, `BOARD_COL_DOING` (empty), `BOARD_COL_BLOCKED`, `BOARD_COL_BLOCKED_HUMAN`, `BOARD_COL_DONE`. Lines 80-87 (`board_col_default`) repeat the literals. Line 91 loops over the five names.
- `lib/board.sh:695-713` (`board_in_progress_column`): a `BOARD_COL_DOING` override wins. Otherwise it tries `for col in "In Progress" "Doing"`. Line 712: "the board's statuses list neither "In Progress" nor "Doing"; nothing moved."
- `board-subagent-start.sh:179-184` holds the only source-status checks. Line 179 skips a Done item ("leaving it there"). Line 183 is `if held_for_human "$page_id"; then exit 0; fi`. Line 184 writes In Progress otherwise. There is no allowlist, so any other status, including a new "Next", would be moved. `held_for_human` (lines 22-26) holds only for Blocked by human with open actions.
- `board-subagent-stop.sh:5-6` writes Blocked by human on a `Blocker:` line.
- `board-task-completed.sh:203,260` write `$BOARD_COL_BLOCKED`. Line 319 writes `$BOARD_COL_DONE`.
- `hooks/README.md:49` lists the five statuses. Line 461 covers column-name mismatches.
- `claude/evals/lib/board-hook-contract.sh` has 92 status-name hits. Its stub (lines 559-594) defaults status to "To Do", and `run_start_stub` (lines 631-643) takes a `STATUSES` string.
- `claude/coder-fleet/skills/glossary/SKILL.md`, Board row: "The tracked items as five columns: to do, in progress, blocked, blocked by human, done". The same row is in `templates/rules/glossary.md` and `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/rules/glossary.md`, both generated by `claude/scripts/gen-glossary-rule.sh`.
- `skills/board-conventions/SKILL.md:3` says "the five columns (to do, in progress, blocked, blocked by human, done)". Line 24 is `## The five columns`, with the table at 26-32. Line 35 covers how column names are matched. Line 43 says "a new item arrives in to do because that is where new items start."
- `/Users/alex/Dev/Work/extensions/coder-fleet/docs/fleet-design.md:115`: "five columns:", with the table at 119-123. Line 127 covers the three hooks, line 131 the human queue, and line 194 says "the five statuses".
- `/Users/alex/Dev/Work/extensions/coder-fleet/README.md:90`: "its five statuses". `claude/evals/lib/instruction-file-contract.sh:119` quotes the same sentence.
- `claude/coder-fleet/agents/lead.md:25` and `:41`: the lead never sets a column, except the Doing rename. Line 34: a resume "moves it back to In Progress unless it is Done, or Blocked by human with an action still open".
- `docs/agent-contract.md` and `docs/limits.md` have 1 and 3 status hits. I did not open them.
- How the lead picks work, `agents/lead.md:31` (step 3): "Build what the human ordered. The human's order is the approval: an item the human filed, asked for or said go on."
- Same line: "Work the human has not ordered ... waits on the board until the human says go."
- Same line: on a repeat ask, the lead comments, raises the item to High with `task_edit`, and takes it "ahead of any sweep and the next spawn on any other item".
- I found no ordering rule by priority or ordinal in `lead.md` or the skills.
- Cards carry `priority:` and `ordinal:` frontmatter, and `.boards/config.yml` has `priorities: ["High", "Medium", "Low"]`.
---
<!-- COMMENTS:END -->
