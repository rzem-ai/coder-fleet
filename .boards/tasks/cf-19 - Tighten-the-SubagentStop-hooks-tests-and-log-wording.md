---
id: CF-19
title: Tighten the SubagentStop hook's tests and log wording
status: To Do
assignee: []
created_date: '2026-09-27 02:27'
updated_date: '2026-09-27 02:28'
labels: []
dependencies:
  - CF-8
  - CF-9
references:
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/evals/lib/board-hook-contract.sh
  - claude/coder-fleet/hooks/README.md
  - docs/plans/CF-9.md
priority: Medium
type: chore
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Batches CF-14, CF-15, CF-16 and CF-18 into one item at the human's request (2026-09-27): all four are follow-ups from CF-8's review and refutation rounds, all touch claude/coder-fleet/hooks/board-subagent-stop.sh, lib/board.sh, claude/evals/lib/board-hook-contract.sh or the hooks README, and one coder run under one plan covers them. Lands after CF-9, whose stub board shim (via BOARD_SHIM) is the natural way to check comment text without bun, and which also edits the contract file.

Scope, one line per folded item (each card has the detail and evidence):
- CF-16: check the text of the card comments SubagentStop posts. Done route: `board_comment ... "Done."` survives with and without bun; Blocker route: `"Blocked."` as board_write's fourth argument survives without bun (only live-comment kills it). Assert the comment carries the handoff's Done items and Blocker text, with the live pass skipped.
- CF-14: make hooks/README.md:97's dry-run description match lib/board.sh (a dry run logs one line per call and does not run board_cap_comment or archive), or change the library - whichever the plan argues for.
- CF-15: rename the "succeeded with no blockers" log line (board-subagent-stop.sh ~:378, :381) to the "valid handoff with no blockers" wording, with every contract case that matches it (~:247 and others).
- CF-18: add a contract case for a transcript whose last assistant block is thinking, beside stop-transcript-trailing-tool-passes, proving the outcome hooks/README.md item 16 documents.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CF-16's two mutants (Done comment replaced with "Done.", Blocker comment replaced with "Blocked.") die in board-hook-contract.sh with the live pass skipped, and the assertions check the Done items and Blocker text
- [ ] #2 hooks/README.md's dry-run description and lib/board.sh agree (CF-14)
- [ ] #3 No SubagentStop log line claims success; every contract case matching the old text is updated in the same commit (CF-15)
- [ ] #4 A contract case covers a trailing thinking block and dies when thinking is classified as text (CF-18)
- [ ] #5 check-all.sh passes; a refuter round confirms the CF-16 mutants die without bun; version bump
- [ ] #6 On completion, CF-14, CF-15, CF-16 and CF-18 close with outcome/superseded
- [ ] #7 The live-pass comment at board-hook-contract.sh ~253-254 states the real skip condition (the board chosen - the checkout's cli.ts via bun when bun is on PATH, otherwise the shim - fails --version) and says CI is one such machine
- [ ] #8 board-subagent-stop.sh ~321-323's comment no longer claims an empty or non-object payload reaches the has_message branch, and hooks/README.md item 16 names the ERR-trap exit (~:42) as a pass before any validation
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 02:28
---
Two more follow-ups from CF-8 review round 4 added to scope (ACs 7-8) rather than filed separately: the contract comment's live-pass skip condition, and a pre-CF-8 hook comment at board-subagent-stop.sh ~321-323 that describes an impossible path (a non-object payload exits via the ERR trap at ~:42). Also note: the README table's 'says the transcript could not be read' quotes the log line CF-15 renames - reword both together.
---
<!-- COMMENTS:END -->
