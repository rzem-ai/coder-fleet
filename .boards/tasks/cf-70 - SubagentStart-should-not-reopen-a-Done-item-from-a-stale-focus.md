---
id: CF-70
title: SubagentStart should not reopen a Done item from a stale focus
status: In Progress
assignee: []
created_date: '2026-09-29 13:57'
updated_date: '2026-10-06 09:16'
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
<!-- COMMENTS:END -->
