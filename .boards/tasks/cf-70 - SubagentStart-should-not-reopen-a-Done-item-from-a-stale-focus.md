---
id: CF-70
title: SubagentStart should not reopen a Done item from a stale focus
status: In Progress
assignee: []
created_date: '2026-09-29 13:57'
updated_date: '2026-10-06 09:37'
labels: []
dependencies: []
references:
  - CF-64
  - claude/coder-fleet/hooks/board-subagent-start.sh
priority: High
type: bug
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen 2026-09-29. The checkout's focus was still CF-64, which had been merged and moved to Done that morning. The lead spawned a scout for a different item (CF-3) without re-focusing first. SubagentStart bound the scout to CF-64 from the focus file and moved it from Done back to In Progress. SubagentStop then posted the scout's CF-3 handoff as a comment on CF-64. It was put right by re-closing through a `[board:CF-64]` task. The lead's rule ("clear the focus before work that is not the item's") was the defence, and it failed. A focus that points at a Done item is almost certainly stale, so the hook could refuse to bind to it, or bind without moving the card and log that the focus is stale.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the focused item is Done, SubagentStart moves no column and posts no comment on it, and logs that the focus names a Done item
- [ ] #2 SubagentStop does not comment on a Done item bound only through a stale focus
- [ ] #3 board-hook-contract.sh has a case for each criterion above, written red first
- [ ] #4 bash claude/evals/lib/check-all.sh is green
- [ ] #5 A SessionStart hook clears the checkout's focus file, so a focus from an earlier session never binds a new session's spawns; a board-hook-contract case proves a stale focus is gone after the hook runs, written red first
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
author: lead
created: 2026-10-06 04:24
---
2026-10-06, the human, in the session, ordered this ahead of the remaining backlog ('CF-70: clear stale focus at session start'). Today's evidence: the focus file still held CF-139 from the previous session, so a CF-140 scout's handoff landed as a comment on CF-139. Scope on the human's choice: clear the focus at session start, in addition to the card's existing criteria. Raised to High.
---

author: lead
created: 2026-10-06 09:16
---
Criterion 5 added 2026-10-06 from the human's choice ('clear stale focus at session start'). Sub-issue 1 of 1: started. Done still needs: criteria 1-5. Version 0.37.1 assumed, behind CF-145's 0.37.0; the second to merge re-bumps.

Done: nothing yet; a stale focus still binds the next session's first spawn and can reopen a Done card.
Not done: the Done guard in SubagentStart and SubagentStop, and the session-start clear.
---

author: @SubagentStop
created: 2026-10-06 09:37
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-70-stale-focus`, cut from origin/main so no `.boards/` commits ride along, in worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a0b675094f0a9a07b`. PR: https://github.com/rzem-ai/coder-fleet/pull/67.
- Commit `CF-70: a focus on a Done item binds nothing`: `claude/coder-fleet/hooks/board-subagent-start.sh` now reads the card before attaching the agent to it. If the item came from the focus file and the card is Done, the agent is recorded unbound with `stale_focus=<id>`, the hook logs "the focus names <id>, which is Done, so it is taken as stale", and it exits without moving or commenting.
- Same commit: a `Board-Item:` line or the launch variable still attaches a Done item, as before.
- Same commit: `board-subagent-stop.sh` names the refused item in its log, and no longer falls back to `CODER_FLEET_BOARD_PAGE_ID` for an agent its start recorded as unbound.
- Same commit: `hooks/lib/board.sh` gained the optional `stale_focus` field, `state_agent_stale_focus` and `board_focus_clear`.
- Commit `CF-70: SessionStart clears the checkout's focus`: new `claude/coder-fleet/hooks/board-focus-clear.sh` in the existing SessionStart entry of `hooks.json`. It clears the focus on `startup`, `clear`, `resume` or an unreadable event, and keeps it on `compact`. It prints one line into the session naming what it cleared, and does nothing with the board off, on a dry run, or when the focus read fails.
- Same commit: the stub board in the contract suite now has a file-backed focus and `focus --clear`.
- Commit `CF-70: document the session-scoped focus and the stale-focus guard`: `hooks/README.md` gets a new table row, two rules under "Which board item", the fallback and state-file changes, two "What breaks them" lines and decision 26. The `help-boards` skill body, `docs/fleet-design.md` and the contract suite's header are also updated.
- Commit `v0.37.1: a focus lives one session and never binds a Done item (CF-70)`: version in `plugin.json` and `marketplace.json`.
- Criterion 1 (a Done focus moves nothing, comments nothing, and is logged): `stale-focus-start-binds-nothing`, and `live-stale-focus-untouched` against the real binary via bun. Each fails today because the start attaches the agent to BD-1 and logs "picked up".
- Criterion 2 (no comment on a Done item reached only through a stale focus): `stale-focus-stop-comments-nowhere` and `stale-focus-stop-blocker-moves-nothing` failed before the change because the stop commented on BD-1, or moved it to Blocked by human. `stale-focus-stop-ignores-launch-variable` was red on its own until the stop's fallback fix. `stale-focus-stop-log-says-why` and `stale-focus-resume-stays-unbound` were also red first.
- Criterion 3 (each case written red first): the first unsharded run had 19 red cases, then the launch-variable case was seen red alone. Three guard cases passed before and after on purpose: `stale-focus-board-item-still-binds`, `stale-focus-unread-card-binds` and `stale-focus-live-focus-unchanged`.
- Mutation check: dropping the "focus file only" condition made `stale-focus-board-item-still-binds` and `start-done-board-item-stays-done` fail. The file was restored afterwards.
- Criterion 4: `bash claude/evals/lib/check-all.sh`, run once, exit 0, "Every deterministic check passes.", total 226.2s. board-hook-contract: 227 passed, 0 failed across 4 shards. Board bun tests: 301 pass. Versions: 0.37.1 on both.
- `BOARD_HOOK_SHARDS=1 bash claude/evals/lib/board-hook-contract.sh`: 227 passed, 0 failed, with the live pass on bun.
- Criterion 5 (SessionStart clears the focus): `focus-clear-registered`, `focus-clear-startup` and `focus-clear-then-spawn-unbound`, which shows a later spawn attaches to nothing after the hook runs. Also `focus-clear-on-clear`, `-on-resume`, `-compact-keeps`, `-nothing-focused`, `-board-off`, `-dry-run`, `-read-fails`, `-bad-input` and `live-session-start-clears-focus`. All were red first.
- The existing case `start-done-focus-stays-done` asserted the old behaviour (a Done focus still attached the agent). I removed that assertion, since CF-70 changes exactly that behaviour.
- The `node_modules` symlink was used for the suite and removed before each commit; none was committed.
---
<!-- COMMENTS:END -->
