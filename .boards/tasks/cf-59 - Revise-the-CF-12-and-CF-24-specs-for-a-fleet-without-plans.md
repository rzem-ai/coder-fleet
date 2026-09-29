---
id: CF-59
title: Revise the CF-12 and CF-24 specs for a fleet without plans
status: In Progress
assignee: []
created_date: '2026-09-28 13:00'
updated_date: '2026-09-29 13:39'
labels: []
dependencies: []
priority: Medium
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-58 review, 2026-09-28: docs/specs/CF-12.md and docs/specs/CF-24.md, committed in CF-58 with Status approved, rest on plans: spec-to-plan's plan stage, planning gates in lead step 3, "the plan wins" (CF-24 Q7) and plan Done when sections. Each needs the human's word on what survives without plans before either item is built.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each spec names no plan stage, plan gate or Done when, and the human has approved the revision
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-29 13:23
---
Decision from the human, 2026-09-29 session: run CF-59 now for docs/specs/CF-12.md, so that CF-12.3 to CF-12.5 can be built. Keep the answers already given (Q1 to Q19). Replace only what depends on plans: spec-to-plan's plan stage, the planning gate in lead step 3, and "Done when" sections. Move the spec-editor challenge gate to the lead's check before building. docs/specs/CF-24.md is not part of this pass and stays open under this card.
---

author: @SubagentStop
created: 2026-09-29 13:31
---
Blocked by human. coder-fleet:spec-writer raised 3 blocker(s). From "## Decisions needed" in its handoff:

- Should `spec-to-card`'s card stage also run the challenge gate and the close before it files criteria onto a card (recommended: yes, since otherwise `[challenge Cn]` markers on criterion lines get filed onto the card verbatim), or is the lead's check in `lead.md` step 3 the only gate?
- When a project's `AGENTS.md` records no editor answer, should the lead skip the spec-editor spawn and the gate and suggest `/kickoff` (recommended), or apply the gate, so that older specs such as CF-12 and CF-24 need a closed marker typed by hand before building, as CF-12.3 comment #3 expected?
- Do you approve `docs/specs/CF-12.md` as revised on 2026-09-29, so that its per-sub-issue criteria can go onto CF-12.3, CF-12.4 and CF-12.5?
---

author: lead
created: 2026-09-29 13:39
---
The human answered all three actions in the session on 2026-09-29.

#1: yes. spec-to-card's card stage also runs the challenge gate and the close before it files criteria onto a card, so `[challenge Cn]` markers never reach a card. The gate runs in two places: lead step 3 and spec-to-card.

#2: skip. When AGENTS.md records no editor answer, the lead does not spawn the spec-editor and does not run the gate, and it suggests `/kickoff` instead. Older specs such as CF-12 and CF-24 therefore build without a closed marker.

#3: approved. The human approved docs/specs/CF-12.md as revised on 2026-09-29, on condition that answers #1 and #2 are recorded in it. spec-writer is recording them. The re-cut criteria then go onto CF-12.3, CF-12.4 and CF-12.5. CF-59 stays open for docs/specs/CF-24.md.
---

author: @board
created: 2026-09-29 13:39
---
Actions for Human cleared: CF-59 moved from Blocked by human to In Progress.

- #1 (ticked) Should `spec-to-card`'s card stage also run the challenge gate and the close before it files criteria onto a card (recommended: yes, since otherwise `[challenge Cn]` markers on criterion lines get filed onto the card verbatim), or is the lead's check in `lead.md` step 3 the only gate?
- #2 (ticked) When a project's `AGENTS.md` records no editor answer, should the lead skip the spec-editor spawn and the gate and suggest `/kickoff` (recommended), or apply the gate, so that older specs such as CF-12 and CF-24 need a closed marker typed by hand before building, as CF-12.3 comment #3 expected?
- #3 (ticked) Do you approve `docs/specs/CF-12.md` as revised on 2026-09-29, so that its per-sub-issue criteria can go onto CF-12.3, CF-12.4 and CF-12.5?
---
<!-- COMMENTS:END -->
