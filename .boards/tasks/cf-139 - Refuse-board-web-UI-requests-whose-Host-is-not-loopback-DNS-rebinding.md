---
id: CF-139
title: Refuse board web UI requests whose Host is not loopback (DNS rebinding)
status: In Progress
assignee: []
created_date: '2026-10-05 13:12'
updated_date: '2026-10-05 13:21'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board/src/server/index.ts
  - CF-128
priority: High
type: bug
ordinal: 171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-10-05 by a background security review of 007510e (default_port 42024 in .boards/config.yml), and confirmed live by the lead. The board's web server (claude/coder-fleet/board/src/server/index.ts) answers any Host header: `curl -H 'Host: evil.example:42024' http://127.0.0.1:42024/api/tasks` returned 200. It also serves write routes (/api/tasks, /api/tasks/:id, /api/tasks/:id/complete, /api/config, /api/docs, /api/decisions, /api/drafts). A page in the human's browser can rebind its hostname to 127.0.0.1 and then read and edit the board same-origin; CORS doesn't apply. A random port only made this harder to find; CF-128's configured port (v0.33.0) makes the port predictable. The flaw itself predates CF-128 and comes from the upstream import. Mitigated meanwhile: the lead stopped this session's UI. Not yet ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every HTTP and WebSocket request whose Host header is not 127.0.0.1, localhost or [::1] (with the bound port, or none) is refused with 403 before any route runs, including static assets and /api/*
- [ ] #2 A request carrying an Origin header that is not the same loopback origin is refused on every state-changing method (POST, PUT, PATCH, DELETE)
- [ ] #3 When the human deliberately binds another interface with `board serve --host <h>`, that host is added to the allowed set and nothing else is
- [ ] #4 Tests prove a rebinding Host and a foreign Origin are refused and loopback succeeds, each seen failing first, and they are in BOARD_TESTS
- [ ] #5 check-all.sh is green, and the board's NOTICE.md records the change from upstream
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
created: 2026-10-05 13:21
---
2026-10-05, the human, in the session: "Fix it now, keep 42024". Ordered. Decisions recorded for the builder: (1) `default_port: 42024` stays in .boards/config.yml (007510e); the human will hold off /board until this fix is installed. (2) The fix goes in the board server: a Host allowlist (loopback names, plus an explicit --host when the human binds one deliberately) and an Origin check on state-changing methods. The configured-port feature (CF-128) is unchanged. (3) Escalation, since this is an authorisation path: deep review, a second review round after any fix, and a refuter round.

Sub-issue 1 of 1: started. Done still needs: criteria 1-5. Done: the hole is confirmed live (a forged Host header got 200 on /api/tasks), and this session's UI is stopped. Not done: the server still answers any Host, so a /board started before this lands is reachable by DNS rebinding.
---
<!-- COMMENTS:END -->
