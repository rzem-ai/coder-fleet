---
id: CF-7
title: Close the steward's substring fallback when the plugin runs from the cache
status: To Do
assignee: []
created_date: '2026-09-26 13:21'
updated_date: '2026-09-30 14:02'
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
- [ ] #1 Provisional: the spec settles what done means here, and its criteria replace this one
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
