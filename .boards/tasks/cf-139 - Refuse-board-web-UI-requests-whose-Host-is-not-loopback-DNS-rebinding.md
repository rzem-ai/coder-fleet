---
id: CF-139
title: Refuse board web UI requests whose Host is not loopback (DNS rebinding)
status: In Progress
assignee: []
created_date: '2026-10-05 13:12'
updated_date: '2026-10-06 04:26'
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

author: lead
created: 2026-10-06 03:45
---
2026-10-06, the human, in the session: "what about `CF-139`". This is a repeat ask for an ordered item that has not been delivered; it goes ahead of the next spawn on any other item. CF-140's review round 2 is already running and is not stopped. The lead dropped this card at session start: the handover recorded no CF-139 work in flight, and the lead did not search for ordered work that was undelivered. Comment #2 above is misbound: it is the CF-140 column scout's handoff, which landed here because this checkout was still focused on CF-139 from the last session. Ignore it for CF-139.
---

author: lead
created: 2026-10-06 03:45
---
Found 2026-10-06: worktree .claude/worktrees/agent-a1f7958dedd4494f8 (branch cf-139-host-guard at 813a673) holds an earlier coder's uncommitted work, last written 2026-10-06 00:01 and never committed or handed off. It contains a new server/request-guard.ts, server/unix-forward.ts and test/server-host-guard.test.ts, plus edits to server/index.ts (+76/-24) and check-all.sh. The lead saved it as a patch in its scratchpad (cf-139-wip.patch, 837 lines). Also: at the human's /board this session, the lead started the board UI on 42024 before this fix landed, against decision (1) in comment #1.
---

author: lead
created: 2026-10-06 03:45
---
Sub-issue 1 of 1: started (resumed). Done still needs: criteria 1-5.

Done: the hole is confirmed, and there is unfinished, untested work toward the fix.
Not done: the board server still answers any Host header, so the UI running now on 42024 can be reached through DNS rebinding until this lands.
---

author: lead
created: 2026-10-06 03:46
---
2026-10-06: the human chose to stop the board UI until this fix is installed. The lead stopped it with board_stop. Checked afterwards: nothing listens on 42024, and a forged-Host curl gets no connection (code 000).
---

author: @SubagentStop
created: 2026-10-06 04:26
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `.claude/worktrees/agent-a8e2f59fe33b1a60d` is a linked worktree, not the main checkout. Branch `cf-139-host-guard-2` was cut from origin/main. I did not touch the old worktree.
- Commit `11c1118` "Refuse board web requests from a rebinding Host or a foreign Origin (CF-139)": new files `board/src/server/request-guard.ts`, `board/src/server/unix-forward.ts` and `board/src/test/server-host-guard.test.ts` (29 tests); edits to `board/src/server/index.ts`, `board/NOTICE.md` and `claude/evals/lib/check-all.sh` (test file added to BOARD_TESTS). Board paths are under `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a8e2f59fe33b1a60d/claude/coder-fleet/`.
- Commit `54024ac` "v0.34.1: the board web server refuses DNS-rebinding requests (CF-139)": `plugin.json` and `.claude-plugin/marketplace.json` both at 0.34.1.
- Kept from the draft, `request-guard.ts`: kept with one change. Its Origin check also covered WebSocket upgrades, which the card does not ask for, so I dropped that.
- Kept from the draft, the gate design in `index.ts`: kept because criterion 1 says "including static assets". On Bun 1.3.10 a request that matches Bun's built-in route table never reaches the catch-all handler, Bun's in-process dispatch skips the route table too, and Bun has no middleware hook for it (oven-sh/bun#17608). So the only way to guard everything is a front gate that checks each request and passes the rest to the app on a private Unix socket.
- Kept from the draft, `unix-forward.ts`: the gate has to reach the app, and with `HTTP_PROXY` set both Bun's `fetch` and `node:http` send a proxy-style request line down the socket so every route misses (`proxy: ""` does not help). I fixed one bug: the end of a chunked body was only checked in the latest network read, so it could hang.
- Kept from the draft, its tests: most cases kept. I added PATCH, a case through the MCP path and the socket-directory cases, and moved the page-loading cases onto a real `board serve` child process.
- Added beyond the draft: each socket directory is named with its process ID, and every start removes directories whose process is gone, because a board ended by a signal never runs `stop`. I found 65 leftover directories from test runs and removed the old-style ones, which only this unreleased code creates.
- MCP `board_serve` → `startWebUi` (mcp/server.ts:168) and CLI `board serve` (cli.ts:315) both call `BacklogServer.start`, so the guard covers both. The test "the MCP board_serve path" drives `startWebUi` directly.
- Criterion 1 (Host allowlist, 403 before any route, HTTP and WebSocket, assets and `/api/*`): seen failing on the unguarded server in the page, SPA path, `/api/tasks`, POST, unrouted path, WebSocket upgrade, other-port, look-alike, trailing-dot and no-Host cases (200, 201, 101 or 404 where 403 was expected). The bundled-asset case failed with 200 on its asset assertion. All pass on the guarded server.
- Criterion 2 (foreign Origin on POST, PUT, PATCH and DELETE): "refuses a POST from a foreign Origin" (got 201), "refuses a loopback Origin on another port, another scheme, or null" and "refuses PUT, PATCH and DELETE" all failed first and now pass.
- Criterion 3 (`board serve --host <h>` adds exactly that host): the "board serve --host" cases run the real CLI with `--host 0.0.0.0` and failed first (evil Host got 200, foreign Origin got 201, `0.0.0.0` let through on a loopback-bound server). The "that host is allowed" side was seen failing by stopping the bound host being added to the allowed set.
- Criterion 4 (tests seen failing, in BOARD_TESTS): the success-path tests pass on an unguarded server by design, so I broke the guard one change at a time, and each broke the named test: dropping `[::1]` broke "[::1] with the bound port and with none"; refusing a Host with no port broke all three "with the bound port and with none" cases; case-sensitive Host broke "in any letter case"; refusing a POST with no Origin broke "lets a POST with no Origin through"; checking Origin on every method broke "leaves a foreign Origin on a GET"; not adding the bound host broke both `--host` allow cases; forwarding upgrades broke "loopback … on a WebSocket upgrade"; forwarding through Bun's `fetch` broke the proxy case.
- Criterion 4, socket directory: opening it to mode 0755 broke "is private to this user". A sweep that deletes a live process's directory first got past the test, which was a test gap; I fixed the test and that change now breaks it. The sweep test itself failed first with `stale: true`. One upgrade-check run showed a false kill (the filter matched zero tests); I fixed the filter and reran it.
- Criterion 5: NOTICE.md has a CF-139 entry under "Behaviour changed after import". `bash claude/evals/lib/check-all.sh` was run once and exited 0: "Every deterministic check passes", board 283 pass, 0 fail.
- Live, from a binary compiled from 54024ac (`bun scripts/build.ts`) on port 47139: `curl -H "Host: evil.example:47139" http://127.0.0.1:47139/api/tasks` → 403; `curl -H "Host: evil.example:47139" http://127.0.0.1:47139/` → 403; `curl http://127.0.0.1:47139/api/tasks` → 200; `curl http://localhost:47139/` → 200.
- Live, Origin: `curl -X POST -H "Origin: http://evil.example" -H "Content-Type: application/json" -d '{"title":"forged",...}' http://127.0.0.1:47139/api/tasks` → 403, and afterwards the task list holds only "same origin", so nothing forged was created. The same POST with `Origin: http://127.0.0.1:47139` → 201.
- Live, assets and WebSocket: `/chunk-r0r29h9c.js` and `/chunk-a5acwmyb.css` → 200 from loopback, 403 with `Host: evil.example:47139`. A WebSocket upgrade → 403 with the evil Host, 101 with `127.0.0.1:47139`. A binary built from unguarded HEAD (port 47140) answered 200 or 201 to the same forged requests.
- Other commands: `tsc --noEmit` → exit 0. Biome is clean on the new files; one finding remains in index.ts, an import-order issue in the `./port.ts` block this change does not touch. The BOARD_TESTS set ran three times: 281/281, 281/281 and 283/283 pass.
---
<!-- COMMENTS:END -->
