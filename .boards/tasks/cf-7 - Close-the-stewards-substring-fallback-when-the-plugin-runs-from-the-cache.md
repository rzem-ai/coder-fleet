---
id: CF-7
title: Close the steward's substring fallback when the plugin runs from the cache
status: To Do
assignee: []
created_date: '2026-09-26 13:21'
labels: []
dependencies: []
priority: Low
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the plugin cache (~/.claude/plugins/cache/rzem/coder-fleet/<version>/) the steward's repo-root probe in claude/coder-fleet/hooks/enforce-agent-scope.sh cannot resolve, so its Bash redirect check falls back to a */coder-fleet/* substring match (about lines 876-880). That allows writes to ~/.local/state/coder-fleet, ~/.config/coder-fleet/board.env (which hooks/lib/board.sh sources, so writing it runs code in the hooks) and the cached hook itself. The sandbox's denyWrite covers the worst of these only while the sandbox is on. The gap predates the coder-fleet rename. Fix: probe CLAUDE_PROJECT_DIR for the .claude-plugin/marketplace.json plus claude/coder-fleet shape, or exclude $HOME/.config, $HOME/.local/state and $HOME/.claude from the fallback, and add a scope-hook-contract case that runs the hook from a copy laid out like the cache. The comment at claude/evals/lib/scope-hook-contract.sh around lines 217-221 should then stop implying the gap is closed. Found in the second review of the migration branch.
<!-- SECTION:DESCRIPTION:END -->
