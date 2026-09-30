---
id: CF-70
title: SubagentStart should not reopen a Done item from a stale focus
status: To Do
assignee: []
created_date: '2026-09-29 13:57'
updated_date: '2026-09-30 14:03'
labels: []
dependencies: []
references:
  - CF-64
  - claude/coder-fleet/hooks/board-subagent-start.sh
priority: Medium
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
