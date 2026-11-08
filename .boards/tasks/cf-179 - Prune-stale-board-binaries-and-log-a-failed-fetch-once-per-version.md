---
id: CF-179
title: Prune stale board binaries and log a failed fetch once per version
status: Next
assignee: []
created_date: '2026-11-07 03:57'
updated_date: '2026-11-08 04:09'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-binary.sh
  - claude/coder-fleet/board/board.sh
priority: Low
type: bug
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked for this card on 2026-11-07 ("file that as a card").

`claude/coder-fleet/hooks/board-binary.sh` only removes older `board-*` binaries from `${CLAUDE_PLUGIN_DATA}/bin` after a fetch succeeds. While `rzem-ai/coder-fleet` was private (first 404 on 2026-11-04T23:04Z, last good install 2026-10-19), every fetch 404'd. A 70 MB `board-0.42.5` sat in plugin data across v0.45.0 to v0.47.0, and the hook wrote 46 "could not fetch" lines, one per session start. Bun answered in the meantime through `board/board.sh`'s fallback, so nothing broke, but the stale binary and the log noise were the only visible signs, and they were easy to miss.

The repo is public again and the fetch works. This card covers the hook's behaviour when a fetch fails.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the fetch for the current plugin version fails, board-binary.sh still removes every board-* binary in ${CLAUDE_PLUGIN_DATA}/bin whose version is not the current one, and leaves a current-version binary in place
- [ ] #2 A failed fetch for a given version and platform is logged once; later session starts for the same version and platform write no further fetch-failure line, and a new version logs afresh
- [ ] #3 A successful fetch after earlier failures still installs the binary and logs the install
- [ ] #4 The board-hook contract suite covers all three behaviours with a stubbed release URL (CODER_FLEET_BOARD_RELEASE_URL) and passes in check-all.sh
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
