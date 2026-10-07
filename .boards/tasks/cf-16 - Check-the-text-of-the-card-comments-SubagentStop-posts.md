---
id: CF-16
title: Check the text of the card comments SubagentStop posts
status: To Do
assignee: []
created_date: '2026-09-27 02:14'
updated_date: '2026-10-07 03:54'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/evals/lib/board-hook-contract.sh
  - docs/plans/CF-9.md
priority: Medium
type: bug
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the CF-8 round-2 refuter; predates CF-8 (the line dates from c094a3d). Nothing checks what the SubagentStop card comments say:
- Done route: replacing `board_comment "$HOOK" "$page_id" "$comment"` with `board_comment "$HOOK" "$page_id" "Done."` in board-subagent-stop.sh passes board-hook-contract.sh both without bun (52/0) and with it (62/0). An agent's `## Done` items could stop reaching the card unnoticed.
- Blocker route: replacing board_write's fourth argument with `"Blocked."` passes without bun (52/0) and dies only on the bun-dependent `live-comment`. CI has no bun, so CI does not check it.
The dry-run line records only "with a comment", so a fix needs the dry run to log a hash or excerpt of the comment body, or a live case that runs without bun (e.g. a stub shim that records the comment text, as CF-9's plan does for SubagentStart).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both mutants above die in board-hook-contract.sh with the live pass skipped
- [ ] #2 The check asserts the comment carries the handoff's Done items (Done route) and Blocker text (Blocker route), not just that a comment exists
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
author: @lead
created: 2026-09-27 02:19
---
Refinement from the CF-8 fix-round-2 coder: the live case `live-comment` (board-hook-contract.sh ~555-557) does check the Blocker comment body with test("which key"), so the blocker line itself is checked where bun is present. What goes unchecked is the rest of each comment - headline, layout, the Done items - and no live case covers the Done-comment route at all. CF-8 narrowed the contract comment at :252-258 to say so and points at this item.
---

author: @lead
created: 2026-09-27 02:28
---
Folded into CF-19 at the human's request, 2026-09-27, with CF-14, CF-15 and CF-18. Work happens there; this item closes with outcome/superseded when CF-19 lands.
---

created: 2026-10-07 03:54
---
Archived 2026-10-07 on the human's word after a sweep of To Do against main: duplicate of CF-19, into which it was folded on 2026-09-27 (this card's own earlier comment says so). CF-19's criteria carry its scope; nothing to move.
---
<!-- COMMENTS:END -->
