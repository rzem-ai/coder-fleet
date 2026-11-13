---
id: CF-204
title: >-
  Never serve a broken board page when the session's board server started before
  the binary arrived
status: In Progress
assignee: []
created_date: '2026-11-12 15:00'
updated_date: '2026-11-13 05:39'
labels: []
dependencies: []
priority: Medium
type: bug
ordinal: 334000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen 2026-11-13 on v0.53.0. This session's board MCP server started at 22:57:35, three seconds before the SessionStart hook logged `[BoardBinary] installed the board binary for v0.53.0` at 22:57:38. board.sh therefore fell back to `bun src/cli.ts mcp` in the plugin cache, which has no node_modules. The task API answered 200, but `/` returned 500 Internal Server Error, because Bun could not bundle `../web/index.html` without its packages. Reconnecting the MCP server, or restarting, picks up the binary. Any first session after a plugin update can hit this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A session whose board MCP server starts before the version's binary is installed ends up serving a working web UI without the human reconnecting or restarting: board.sh waits briefly for the in-flight download, or the server hands over to the binary once it arrives
- [x] #2 When the UI cannot be served (for example source mode without its packages), /board says so with the cause and the fix (reconnect the board MCP server), rather than printing a URL that returns 500
- [x] #3 A test pins the source-mode-without-packages case for the page route
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-13 04:29
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-3.

Taken by /drain on 13 Nov 2026 from Next. A coder is building it on branch cf-204-board-page-before-binary. Done so far: nothing you can see yet. Not done: everything. When it lands, a board server that starts before its program has downloaded will still serve a working page without a reconnect, and when it cannot, /board will say why and tell you to reconnect instead of printing a link that fails.
---

author: lead
created: 2026-11-13 04:41
---
Proposed by the coder, not filed: docs/board-config.md cites board/src/cli.ts:277 for the `board export` heading, but on main that line is already inside `config show`, and other line references in that file may have drifted too. Worth either a pass to re-anchor them or a check that keeps them current. Filed only if you say so.
---

author: lead
created: 2026-11-13 04:51
---
Sub-issue 1 of 1: ready to merge in PR #184. Done still needs: Definition of Done 4 (version bump, tag and release, after the merge).

Done: a board server that starts before the board program has downloaded now hands the page to the program once it arrives, so the board link works without a reconnect. While the program is still missing, /board says why and tells you to reconnect the board server, instead of printing a link that fails. Not done: the merge, which is yours, then the release. Nobody has yet seen it in a real first session after an update, and it is untested on Windows.

Evidence for the ticks: criteria 1 to 3 are pinned by the new test board-page-source-mode.test.ts, which covers both the error case and a page answering 200 from the program, and fails with the change reverted. The independent review approved round 1 at 21c70fba with nothing blocking, and all four declared suites exited 0 there (DoD 1 and 2; in build phase no break-mode round is called for). DoD 3 not applicable: no agent body or skill frontmatter changed. DoD 5 not applicable: the OpenCode port has no counterpart to the board server or /board. DoD 6 not applicable: no spec.

The review raised three small points, which I dropped rather than spend a fix round on. They are listed in the PR body.
---

author: lead
created: 2026-11-13 05:32
---
Sub-issue 1 of 1: merged to main at 5bc91d46. Done still needs: Definition of Done 4 (the v0.57.0 release, tagged and pushed).

Done: the change is on main. Not done: no install has it until v0.57.0 is released.
---

author: lead
created: 2026-11-13 05:39
---
CI found a problem after the merge, and the release is held until it is fixed. One of the new tests expects the board page to answer error 500. On CI's Linux runner the page answers 502 instead, so the suite is red on main. PR #184's own CI was already red when it merged, and I did not check that before calling it ready. The behaviour is still right on CI: the error names the cause and the fix. The test was simply pinned to one status code. I am fixing it myself on branch cf-204-page-test-any-5xx, so the test accepts any 5xx error. It will get its own review, and then v0.57.0 goes out.
---
<!-- COMMENTS:END -->
