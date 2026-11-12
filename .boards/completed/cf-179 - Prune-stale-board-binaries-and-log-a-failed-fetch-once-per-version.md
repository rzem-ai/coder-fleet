---
id: CF-179
title: Prune stale board binaries and log a failed fetch once per version
status: Done
assignee: []
created_date: '2026-11-07 03:57'
updated_date: '2026-11-11 16:09'
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
- [x] #1 When the fetch for the current plugin version fails, board-binary.sh still removes every board-* binary in ${CLAUDE_PLUGIN_DATA}/bin whose version is older than the current one, never one that is newer, and leaves a current-version binary in place
- [x] #2 A failed fetch for a given version and platform is logged once; later session starts for the same version and platform write no further fetch-failure line, and a new version logs afresh
- [x] #3 A successful fetch after earlier failures still installs the binary and logs the install
- [x] #4 The board-binary contract suite (claude/evals/lib/board-binary-contract.sh, where the stubbed-release-URL cases live) covers all three behaviours with a stubbed release URL (CODER_FLEET_BOARD_RELEASE_URL) and passes in check-all.sh
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-08 06:12
---
Spotted by the lead, 8 Nov 2026 (not filed; same hook, different fault): on the first session of a new plugin version the board MCP server starts before board-binary.sh finishes fetching the release binary, so it falls back to `bun src/cli.ts mcp` from the plugin cache, which has no node_modules. The task tools still work through bun's auto-install, but the web UI's page returns 500 Internal Server Error because its HTML bundle needs bun-plugin-tailwind. Seen on 0.49.0: MCP started 06:11:09Z, `installed the board binary for v0.49.0` logged 06:11:14Z; /api/tasks 200, / 500. A server reconnect after the fetch picks up the binary. Fix options: board.sh waits briefly for an in-flight fetch, or the MCP server re-execs onto the binary once it appears, or the UI says why it cannot build its page instead of a bare 500.
---

author: lead
created: 2026-11-08 08:27
---
Built on cf-179-prune-binaries-log-once (from origin/main 095d136), one commit 6b4d359: board-binary.sh prunes every regular `board-*` file except the current version's (and its .exe) before any fetch, logs a failed asset or SHA256SUMS fetch once per version and platform behind a `.fetch-failed-<version>-<platform>` marker in the plugin data bin folder, and on a successful install clears the marker and prunes again. 14 new checks in claude/evals/lib/board-binary-contract.sh (where the existing stub-URL BoardBinary cases live, not board-hook-contract.sh, which the card names; that suite is untouched): 5 failed against the original hook; two failed first for a fixture reason and were not separately watched failing on the original. Contract 48/0. Scripter's check-all.sh exit 0, 179.5 s, at the budget's edge under load.

Scripter's unverified points: pruning now runs before the fetch, so old binaries go slightly earlier (harmless on Unix for a running old server, Windows untested); a current-version .exe on a non-Windows platform is kept; the marker needs a writable data folder. Review round 1 next.
---

author: lead
created: 2026-11-08 08:33
---
Review round 1 (095d136..6b4d359): approve with follow-ups. Gates from the review worktree: check-all.sh exit 0 (93.7 s, board-binary 48/0), scope-hook 773/0, board-hook 269/0, handoff-parity agree.

Lead decisions on the follow-ups (criteria revised, easily reversed): (1) the hook runs on every SessionStart with no matcher, so with pruning before the fetch an old-version session that compacts while its fetch fails would delete the newer binary every current session uses, and its once-only marker - criterion 1 now says prune only versions older than the current one, and leave newer versions' markers alone; (2) criterion 4 now names board-binary-contract.sh, where the checks went. One fix round follows, with the lows riding: the stale header comment at board-binary.sh:13, a log-once test for the SHA256SUMS fetch failure, and a check that older versions' .fetch-failed markers are removed.
---

author: lead
created: 2026-11-08 08:45
---
Sub-issue 1 of 1: ready to merge in PR #133. Done still needs: criteria 1-4 ticked once proven on main; the release bump and tag.

Fix round 1, 8d3f611: prune_old removes only strictly older versions (numeric per field, unparseable kept), the header comment matches, a SHA256SUMS log-once check and an older-marker check added; 3 new checks failed on round 1's hook. Review round 2 (6b4d359..8d3f611): approve. Gates from the review worktree: check-all.sh exit 0 (90.5 s, board-binary 56/0), scope-hook 773/0, board-hook 269/0, handoff-parity agree. One low dropped (a duplicated hook copy in the contract). Reviewer's unverified: a plugin version with a pre-release suffix would turn pruning off; no release has had one. The branch merges clean with origin/main 61bb049.

Done: old binaries pruned on a failed fetch, never a newer one, and one log line per version and platform, reviewed and up as draft PR https://github.com/rzem-ai/coder-fleet/pull/133. Not done: not merged.
---

author: lead
created: 2026-11-11 13:13
---
Sub-issue 1 of 1: merged to main at 280b42d (PR #133, 10 Nov 2026). Done still needs: Definition of Done 4, the release bump and tag; this merged after v0.50.0, so it ships in the release the human ordered on 12 Nov 2026 for when every In Progress and Next card is finished.

Ticked on evidence from review round 2 on 8d3f611 (comment 4): criteria 1 (prune_old removes only strictly older versions, never a newer one, and keeps the current), 2 (one fetch-failure line per version and platform behind a marker, a new version logs afresh), 3 (a successful fetch after failures installs and logs), 4 (board-binary-contract.sh 56/0 inside check-all.sh, exit 0, 90.5 s). Definition of Done: 1 that check-all run; 2 review round 2 approved, no refuter in the build phase; 3 not applicable: no agent body or skill frontmatter changed; 5 not applicable: no ported artefact changed; 6 not applicable: no spec.

Done: on main, a failed fetch prunes only older binaries and logs once. Not done: not released, so installs still run the old hook.
---

author: lead
created: 2026-11-11 16:05
---
Released in v0.51.0, 12 Nov 2026: bump b53330a, tag v0.51.0 pushed, flush e552c9d. Ticked: Definition of Done 4. Done still needs: nothing on this card.
---
<!-- COMMENTS:END -->
