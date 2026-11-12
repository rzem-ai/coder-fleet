---
name: releases-on-request
description: The human wants the lead to cut coder-fleet releases (bump, release PR, tag) when asked, despite AGENTS.md reserving them for the human
metadata:
  type: feedback
---

When the human asks for a release, the lead does the whole thing: picks the version, bumps `plugin.json` and `marketplace.json` on a `release-vX.Y.Z` branch, opens the release PR, merges it with a merge commit once CI is green, then makes the annotated tag on the release commit (the branch head, not the merge commit) and pushes it.

**Why:** on 2026-11-13, after CF-202 merged and the lead said the bump was the human's, he replied "what's the new version number? this is surely something you can manage?". AGENTS.md's Releasing section still reserves the bump and tag for the human, so the in-session ask is the go-ahead.

**How to apply:** don't stop at "the release is yours" once a change merges. Offer to cut it, or cut it when asked. Use minor for new or removed features and patch for fixes, matching the tag history. Subject: `vX.Y.Z: <what it releases> [card ids]`. See [[shipping-a-stack-overnight]] for the merge-command shape.
