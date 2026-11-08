---
id: CF-183
title: >-
  Keep board and memory commits off main until a release tag, then land them as
  one commit
status: In Progress
assignee: []
created_date: '2026-11-08 02:49'
updated_date: '2026-11-08 05:42'
labels:
  - board
  - hooks
dependencies: []
references:
  - claude/coder-fleet/board/src/git/operations.ts
  - claude/coder-fleet/hooks/lib/board.sh
  - claude/coder-fleet/agents/lead.md
  - docs/board-config.md
  - docs/limits.md
priority: High
type: enhancement
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 8 Nov 2026: "currently a project that uses this plugin has a git history that is polluted by commits related to memories and boards. to clean this up, I would like all these changes to be made on a worktree and only pushed as a single commit when a new tag is added" - and, pointing at Fathom: "look at the fathom repo `/Users/alex/Dev/Work/fathom/fathom` as an example".

Seen on Fathom, 8 Nov 2026: of the last 300 commits on main, about 190 are board auto-commits (Add a comment to, Move, Create, Reorder tasks in Next, Tick action) and 82 touch .claude/agent-memory/; 11 of the 15 newest commits on main are board writes. The board binary's commitBoard (claude/coder-fleet/board/src/git/operations.ts) commits .boards on whatever branch the main checkout has out, and memory rides each feature PR (lead.md step 5, coder.md and scripter.md).

Shape: a dedicated state worktree on its own branch holds the live board and the agents' memory and takes every per-write commit; nothing board- or memory-shaped lands on main or in a feature branch between releases; when a release tag is pushed, the state branch's delta lands on the default branch as one commit and is pushed.

Related: CF-169 (board writes out of agent worktree branches) - its criterion 1 assumes the main checkout's .boards is the live board, which this card replaces.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Between releases, no board write and no agent memory write creates a commit on the default branch or on any feature branch; a test with a real linked worktree pins both
- [ ] #2 Every board write the binary makes (CLI, MCP, hooks, web UI) reads and writes the state worktree's .boards and auto-commits there, and every reader - hooks, MCP server, web UI - sees the same live board whichever checkout or agent worktree it runs from
- [ ] #3 Agent memory written by any agent, in the main checkout or an agent worktree, lands in the state worktree and is committed there, and the scope hook still confines each agent to its own memory directory
- [ ] #4 When a release tag is pushed, one command lands the state branch's changes since the last flush on the default branch as exactly one commit, pushes it, and leaves the state branch based on the new default branch; with nothing to flush it makes no commit
- [ ] #5 The flush never rewrites or force-pushes the default branch, and on a push race it re-fetches and retries rather than overwriting
- [ ] #6 lead.md's shipping step runs the flush at tag time, and a project that never tags has a documented manual way to flush
- [ ] #7 A merged feature branch carries no .boards or .claude/agent-memory changes, and review-round's scope lane reports any it finds
- [ ] #8 docs/board-config.md, docs/fleet-design.md and help-boards say where board and memory writes go and when they reach the default branch
- [ ] #9 The state worktree is the default for every project on the next plugin version: the first board write in a project without one creates it and migrates to it, losing no uncommitted or unpushed board or memory change, and a migration that fails leaves the board readable and writable where it was and says why in hooks.log; /coder-fleet:init and /coder-fleet:kickoff create it up front
- [ ] #10 Every criterion of CF-169 that still holds is met here: a board write made while an agent runs in a linked worktree never lands in that worktree's branch
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
created: 2026-11-08 02:50
---
Decisions from Alex, 8 Nov 2026, in the session (AskUserQuestion):
1. Tag order: "Right after the tag". The release tag stays on the commit CI proved; the flush lands the one state commit on the default branch after the tag is pushed, untagged.
2. Memory: "All agents". Every agent's memory, coder and scripter included, goes to the state worktree; feature PRs carry only product changes.
3. Rollout: "Default on for everyone". The next plugin version moves every project to the state worktree, migrating on first use (criterion 9 reworded to make that safe).
4. CF-169: "Fold into CF-183". CF-169's surviving criteria live here.

Lead defaults, not asked: the flush is a fast-forward push straight to the default branch, never a PR (a PR would add a merge commit); a project that never tags flushes with a documented manual command.
---

created: 2026-11-08 02:50
---
Split into three sub-issues: CF-183.1 (the state worktree, the board's root and migration), CF-183.2 (memory into the state worktree), CF-183.3 (the flush at tag time). .2 and .3 build on .1.
---

created: 2026-11-08 02:51
---
Sub-issue 1 of 3: started. Done still needs: criteria 1-10, CF-183.1, CF-183.2, CF-183.3.

Done: nothing you can see yet. A coder is building the state worktree (CF-183.1), so board writes stop committing on main or feature branches.
Not done: board writes still commit on main; memory still rides feature PRs (CF-183.2); no flush at tag time yet (CF-183.3).
---

created: 2026-11-08 03:32
---
Proposed by the coder on CF-183.1, 8 Nov 2026 (not filed; the human says whether to):
1. Have CF-183.3's flush, or `board state`, deal with what the move leaves in the main checkout's .boards/: uncommitted copies already on the state branch, and a stale .focus. Lead note: worth folding into CF-183.3, since a human committing those leftovers would put stale board content on main.
2. Have the MCP server and web UI re-check their board root on each write, so a session that started before the move follows it instead of refusing to commit until a restart.
3. Update this repo's own .boards/config.yml auto_commit comment to match the template, through the board rather than a feature branch.
---

created: 2026-11-08 03:32
---
CF-183.1 coder decisions (from its handoff): state worktree at <main checkout>/.claude/worktrees/coder-fleet-state on branch coder-fleet/state, found from git rev-parse --git-common-dir and excluded through .git/info/exclude. The state branch is cut from the default branch and the main checkout's working .boards/ copied over it, so its delta is board-only. Nothing pushes coder-fleet/state; a fresh clone rebuilds it from the default branch's .boards/, so unflushed board commits stay on the machine that made them until CF-183.3 flushes. A failed migration is sticky (.git/coder-fleet/state-migration-failed) until `board state` retries. The move runs on any board call, reads included, because the MCP server and web UI fix their root at start.
---

created: 2026-11-08 03:44
---
Sub-issue 1 of 3: started (review round 1 done, fix round 1 running). Done still needs: criteria 1-10, CF-183.1, CF-183.2, CF-183.3.

Review round 1 on CF-183.1 (0b51812): request changes, 2 blocking. Gates run independently: check-all.sh exit 0 (97.3 s, board bun 347 pass), scope-hook 773/0, board-hook 269/0, handoff-parity 32 agree, tsc and build clean.
- must fix: review-round's reviewer reads the card from its own checkout's .boards/, which is frozen after the move, so it reviews against stale or missing criteria.
- must fix: a session still on the old plugin version keeps writing the main checkout's .boards/ after another session moved the board, and board-git-check calls those writes clean.
Both plus two lows (lock timeout throws instead of falling back; race test can't tell one move from two) went to one fix round.

Lead defaults on the follow-ups: keep the full checkout for the state worktree (a sparse checkout flips extensions.worktreeConfig in the shared repo config); do not merge or release CF-183.1 ahead of CF-183.3, because until the flush exists board commits never leave the machine.

Done: nothing you can use yet; the state worktree is built and reviewed on a branch.
Not done: board writes still commit on main; the two review fixes; memory (CF-183.2); the flush (CF-183.3).
---

created: 2026-11-08 04:05
---
Sub-issue 3 of 3: started. Done still needs: criteria 1-10, CF-183.1 (narrow review of its fix round running), CF-183.2, CF-183.3.

Done: nothing you can use yet. CF-183.3 (the flush at tag time) is being built on top of CF-183.1's branch, at Alex's word on 8 Nov 2026: "start CF-183.3 while that review runs".
Not done: board writes still commit on main; CF-183.1 awaits its narrow review; memory (CF-183.2) not started; nothing merged or released.
---

created: 2026-11-08 04:13
---
Sub-issue 1 of 3: ready to merge in PR #127. Done still needs: criteria 1-10, CF-183.2, CF-183.3, and the release (version bump, tag, flush).

CF-183.1 review round 2 (fix commits 0b51812..a57f82f): approve with follow-ups, 4 lows dropped under the build phase. Gates at a57f82f: check-all.sh exit 0 (81.2 s), scope-hook 773/0, board-hook 269/0, handoff-parity 32 agree, tsc and build clean. PR #127 is a draft and says not to merge before CF-183.3, because until the flush exists board commits on the state branch never leave the machine.

Incident, 8 Nov 2026 ~14:44: the fix coder read its card with the branch's own board.sh, which moved this repo's live board into .claude/worktrees/coder-fleet-state while the installed 0.48.0 sessions kept writing to main. The state branch tip was an ancestor of main with no uncommitted changes, so nothing was lost; the lead removed the worktree and branch, and briefed the CF-183.3 coder not to run the branch's CLI against the real repo.

Done: the state worktree, its migration and the review fixes are built, reviewed and up as draft PR #127.
Not done: nothing has merged, so board writes still commit on main; the flush (CF-183.3) is being built; memory (CF-183.2) not started.
---

created: 2026-11-08 04:22
---
Sub-issue 2 of 3: started. Done still needs: criteria 1-10, CF-183.2, CF-183.3, and the release.

The human moved CF-183.2 to the top of Next at 15:09, so it is being built now, stacked on CF-183.1 beside CF-183.3 instead of after it.

Done: CF-183.1 is up as draft PR #127.
Not done: memory still rides feature PRs (CF-183.2 building); no flush yet (CF-183.3 building); nothing merged, so board writes still commit on main.
---

created: 2026-11-08 04:35
---
Sub-issue 3 of 3: started (built, review round 1 running). Done still needs: criteria 1-10, CF-183.2, CF-183.3's review, the fleet-design flush paragraph, and the release.

Done: on branches, the state worktree (draft PR #127) and the flush (`board flush --tag vX.Y.Z`, /coder-fleet:flush, run by the lead right after the release tag) are built; the flush lands everything since the last flush on main as one `Board and memory at vX.Y.Z` commit and pushes it without force.
Not done: nothing merged, so board writes still commit on main; memory still rides feature PRs (CF-183.2 building); CF-183.3 under review; docs/fleet-design.md does not yet describe the flush.
---

created: 2026-11-08 05:29
---
Sub-issues 1 and 3 of 3: ready to merge in PR #129 (v0.49.0). Done still needs: criteria 1-10 proven on main; CF-183.2 (memory, building, stacked on the old CF-183.1 branch and to be rebuilt on #129's branch at its PR); after the merge, the v0.49.0 tag on the bump commit, its push, and the first `board flush --tag v0.49.0`.

Done: board writes leaving main and the one-commit flush after each tag are reviewed and up as release PR #129, with merge order CF-184 (#128) first so v0.49.0 carries it too.
Not done: nothing merged, so board writes still commit on main; memory still rides feature PRs until CF-183.2 lands; the merge, tag and flush are the human's, since this repo grants the lead no step past opening the PR.
---
<!-- COMMENTS:END -->
