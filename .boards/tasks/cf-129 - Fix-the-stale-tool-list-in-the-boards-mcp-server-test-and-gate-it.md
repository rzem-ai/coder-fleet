---
id: CF-129
title: Fix the stale tool list in the board's mcp-server test and gate it
status: In Progress
assignee: []
created_date: '2026-10-05 03:56'
updated_date: '2026-10-07 00:09'
labels: []
dependencies: []
priority: Low
type: bug
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the coder on CF-128. `claude/coder-fleet/board/src/test/mcp-server.test.ts` "createMcpServer wires stdio-ready instance" fails: its expected tool list lacks board_serve, board_url, board_stop and task_focus. It is not in BOARD_TESTS, so it drifted silently. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The expected tool list in mcp-server.test.ts matches the tools the MCP server registers and the test passes
- [ ] #2 mcp-server.test.ts is in BOARD_TESTS in claude/evals/lib/check-all.sh and check-all.sh is green
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
created: 2026-10-06 14:06
---
2026-10-07, lead. This card is In Progress with no branch, no commit, no PR and no comment: nothing was built. It moved on 2026-10-05 at 13:03Z when a spawn for other work bound to it through a stale focus (the CF-70 bug, fixed in v0.37.1). It belongs in To Do; the lead writes no column, so the human is asked to move it back. Still not ordered.
---

created: 2026-10-07 00:09
---
Ordered: the human moved this card into Next on 2026-10-07. Sub-issue 1 of 1: started. Done still needs: criteria 1 and 2.

Done: nothing yet; a scripter is being spawned.

Not done: the mcp-server test still expects the old tool list and is not in the suite.
---
<!-- COMMENTS:END -->
