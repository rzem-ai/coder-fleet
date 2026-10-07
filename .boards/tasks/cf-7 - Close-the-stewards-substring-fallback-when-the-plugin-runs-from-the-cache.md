---
id: CF-7
title: Close the steward's substring fallback when the plugin runs from the cache
status: To Do
assignee: []
created_date: '2026-09-26 13:21'
updated_date: '2026-10-07 04:08'
labels: []
dependencies: []
priority: Low
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the plugin cache (~/.claude/plugins/cache/rzem/coder-fleet/<version>/) the steward's repo-root probe in claude/coder-fleet/hooks/enforce-agent-scope.sh cannot resolve, so its Bash redirect check falls back to a */coder-fleet/* substring match (about lines 876-880). That allows writes to ~/.local/state/coder-fleet, ~/.config/coder-fleet/board.env (which hooks/lib/board.sh sources, so writing it runs code in the hooks) and the cached hook itself. The sandbox's denyWrite covers the worst of these only while the sandbox is on. The gap predates the coder-fleet rename. Fix: probe CLAUDE_PROJECT_DIR for the .claude-plugin/marketplace.json plus claude/coder-fleet shape, or exclude $HOME/.config, $HOME/.local/state and $HOME/.claude from the fallback, and add a scope-hook-contract case that runs the hook from a copy laid out like the cache. The comment at claude/evals/lib/scope-hook-contract.sh around lines 217-221 should then stop implying the gap is closed. Found in the second review of the migration branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Run from a copy laid out like the plugin cache (~/.claude/plugins/cache/rzem/coder-fleet/<version>/), the steward's Bash redirect check no longer allows writes to ~/.local/state/coder-fleet, ~/.config/coder-fleet/board.env or the cached hook files: the repo root is found by probing CLAUDE_PROJECT_DIR for the .claude-plugin/marketplace.json plus claude/coder-fleet shape, or $HOME/.config, $HOME/.local/state and $HOME/.claude are excluded from the */coder-fleet/* fallback
- [ ] #2 A scope-hook-contract case runs the hook from a cache-shaped copy and denies each of those three writes, seen failing first
- [ ] #3 bash claude/evals/lib/check-all.sh passes on the branch
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
created: 2026-10-07 04:08
---
2026-10-07, lead, on the human's request to check every To Do card has acceptance criteria: the provisional criterion is replaced with criteria written from this card's own description (its stated fix and test); nothing added. Not ordered.
---
<!-- COMMENTS:END -->
