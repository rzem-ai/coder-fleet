---
id: CF-204
title: >-
  Never serve a broken board page when the session's board server started before
  the binary arrived
status: In Progress
assignee: []
created_date: '2026-11-12 15:00'
updated_date: '2026-11-13 04:29'
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
- [ ] #1 A session whose board MCP server starts before the version's binary is installed ends up serving a working web UI without the human reconnecting or restarting: board.sh waits briefly for the in-flight download, or the server hands over to the binary once it arrives
- [ ] #2 When the UI cannot be served (for example source mode without its packages), /board says so with the cause and the fix (reconnect the board MCP server), rather than printing a URL that returns 500
- [ ] #3 A test pins the source-mode-without-packages case for the page route
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
