---
id: CF-21
title: Surface board commits that fail instead of dropping them silently
status: Next
assignee: []
created_date: '2026-09-27 02:36'
updated_date: '2026-10-07 00:17'
labels: []
dependencies: []
references:
  - claude/coder-fleet/board
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/coder-fleet/commands/kickoff.md
priority: High
type: bug
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 2026-09-27: a stale .git/index.lock (mtime 11:39 AEST, no git process holding it) made every board commit fail from about 01:24 UTC. The MCP server's writes stayed on disk - CF-12 to CF-19 untracked, CF-6 and CF-8 edits unstaged, one CF-9 write staged but never committed - and nothing in ~/.local/state/coder-fleet/log/hooks.log said so (zero "commit skipped" lines). It surfaced only when `git pull` refused to run after PR #2 merged. The lead removed the lock and committed the writes (66f1e0f before rebase). Make a failed or skipped board commit visible: log it from the MCP server path too, and consider a check (kickoff, or the next board write) that notices uncommitted .boards changes or a stale lock and says so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board write whose commit fails or is skipped leaves a log line the human can find, from both the hook path and the MCP server path
- [ ] #2 Kickoff (or another routine check) reports uncommitted .boards changes and a stale .git/index.lock
- [ ] #3 A test covers the skipped-commit log line
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
created: 2026-10-07 00:17
---
Ordered: the human moved this card to the top of Next on 2026-10-07. Sub-issue 1 of 1: started. Done still needs: criteria 1 to 3.

Done: nothing yet; a coder is being spawned. It writes board state (the commit path), so a refuter runs before merge (lead.md step 4).

Not done: a failed or skipped board commit still leaves no trace.
---
<!-- COMMENTS:END -->
