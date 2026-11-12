---
name: releases-on-request
description: The lead cuts a coder-fleet release after every merge that touches the plugin; the human chose per-merge cadence over batching
metadata:
  type: feedback
---

The lead cuts the release itself after every merged change under `claude/coder-fleet/` or `.claude-plugin/`: a `release-vX.Y.Z` branch, a minor bump for an added or removed feature and a patch bump otherwise, the release PR merged with a merge commit once CI is green and it is mergeable, then the annotated tag pushed on the release commit (the branch head, not the merge commit). A merge touching only docs, AGENTS.md or the board cuts no release. AGENTS.md (#177, d1be590f) now says this.

**Why:** on 2026-11-13 the human said "this is surely something you can manage?", then "update AGENTS.md so that you can do them". Asked about cadence, he chose every merge over batching per session, so installs never lag behind main.

**How to apply:** never end a ship at "the release is yours". Release straight after each qualifying merge, one release per merge. See [[shipping-a-stack-overnight]] for the merge-command shape.
