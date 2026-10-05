---
id: CF-138
title: Strip '---' lines from the TaskCompleted failure comment
status: To Do
assignee: []
created_date: '2026-10-05 12:17'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-task-completed.sh
  - CF-21
priority: Medium
type: bug
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lead on 2026-10-05. When check-all fails, board-task-completed.sh posts the last lines of its output as a card comment. check-all prints a standalone `---` line before its FAILED summary, and the board refuses comment bodies containing standalone `---` lines ("Comment body cannot contain standalone '---' delimiter lines"). So the card moves to Blocked with no comment saying why. Seen on CF-128 at 12:15:59Z. Related to CF-21 (board commits that fail silently). Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A failing test gate's comment reaches the card even when the output holds standalone '---' lines (escaped or rewritten), and names the failing check
- [ ] #2 board-hook-contract.sh has a case with '---' in the gate output, seen failing first
- [ ] #3 check-all.sh is green
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
