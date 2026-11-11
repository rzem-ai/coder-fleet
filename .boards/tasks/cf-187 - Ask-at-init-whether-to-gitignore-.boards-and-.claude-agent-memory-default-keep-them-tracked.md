---
id: CF-187
title: >-
  Ask at /init whether to gitignore .boards/ and .claude/agent-memory/, default
  keep them tracked
status: In Progress
assignee: []
created_date: '2026-11-10 02:11'
updated_date: '2026-11-10 04:35'
labels: []
dependencies: []
priority: Medium
type: enhancement
ordinal: 316000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked (2026-11-10): "during the `/init` phase, it should check and ask about adding the directories `.board/` and `.claude/agent-memory/*` to .gitignore. these are creating too much noise in git history"

The board's directory is `.boards/`. Since v0.49.0 (CF-183) board writes commit on the coder-fleet/state branch and reach main as one commit per release, and CF-183.2 moves memory there too. Ignoring the directories makes them local-only: the board binary skips its commit when `.boards` is ignored (`board/src/git/operations.ts:122`), so there is no history, nothing to flush and nothing on another clone. The human chose, in the session: /init asks, with that trade-off stated, and the default keeps them tracked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /init checks with `git check-ignore -v` whether `.boards/` and `.claude/agent-memory/` are ignored by a `.gitignore` inside the project, treating `.git/info/exclude` and global excludes as absent, as it already does for `docs/runs/`
- [ ] #2 When either is not ignored, /init asks the human once with AskUserQuestion, stating the trade-off (local-only, no board history, no flush, not on other clones or web sessions) and with keeping them tracked as the first, recommended option
- [ ] #3 On yes, /init appends `.boards/` and `.claude/agent-memory/` to the root `.gitignore` without duplicating an existing entry, and untracks files already committed under them with `git rm -r --cached`, leaving them on disk and committing nothing
- [ ] #4 On no, when both are already ignored, or when a negation rule re-includes either path, /init changes nothing for them, and reports a negation rule rather than overriding it
- [ ] #5 /init's closing report says what was chosen and what was untracked, and does not remind the human to commit `.boards/` when it is ignored
- [ ] #6 `docs/board-config.md` says what an ignored `.boards/` or `.claude/agent-memory/` means for commits, the flush and other clones
- [ ] #7 `bash claude/evals/lib/check-all.sh` passes
- [ ] #8 On yes, /init also sets `auto_commit: false` in `.boards/config.yml`, so neither the main checkout nor the state worktree makes board commits and the flush has no board change to land; the question and `docs/board-config.md` say so
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
author: lead
created: 2026-11-10 02:12
---
Decision from the human in the session, 2026-11-10 (AskUserQuestion): "Ask, default no". /init asks per project with the trade-off spelled out; the default keeps `.boards/` and `.claude/agent-memory/` tracked through the state branch, and yes ignores both and untracks what is already committed.

Lead defaults: one question covers both directories; /init commits nothing (the human commits, as for the rest of /init's output); `/kickoff` is out of scope unless it repeats /init's gitignore step.
---

author: lead
created: 2026-11-10 02:12
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-7.

Done: nothing yet. Not done: /init does not yet ask about ignoring the board and memory; scripter is building it.
---

author: lead
created: 2026-11-10 02:16
---
Criterion 8 added by the lead, 2026-11-10, from the scripter's handoff on bf34b56: a root `.gitignore` edit alone does not silence the board, because the state worktree is cut from the default branch's commit and keeps committing until the ignore lands there, and `board flush` builds its commit in a scratch index that may not consult `.gitignore`. `auto_commit: true` is the only switch for board commits (docs/board-config.md, `auto_commit`), so turning it off on yes makes the human's choice hold. Memory written to the state worktree once CF-183.2 lands is not covered here.

Propose item (from scripter, not filed): decide what `board flush` does with `.boards` or memory paths the default branch's `.gitignore` ignores, since it may re-add them.
---

author: lead
created: 2026-11-10 02:21
---
Sub-issue 1 of 1: started (built at 0883780 on cf-187-init-gitignore-board-memory, review round 1 running). Done still needs: criteria 1-8.

Done: /init's new step 2d and the board-config.md paragraph are on a branch; on yes it ignores both directories, untracks what is committed and sets `auto_commit: false` in the live board's config (the state worktree's, and the main checkout's when different). The scripter's check-all.sh runs exited 0 (114.6 s, then 183.2 s). Not done: unmerged and under review; step 2d has never run end to end; agent memory written to the state worktree after CF-183.2 is not covered.
---

author: lead
created: 2026-11-10 02:35
---
Sub-issue 1 of 1: started (review round 1 done, fix round 1 running). Done still needs: criteria 1-8.

Review round 1 on 0883780: request changes, 1 blocking. Gate: check-all.sh exit 0 in the review worktree (118 ok, 0 failed, 396.1 s after a 240 s lock wait).
- must fix: step 2b's `board.sh state` moves and commits the whole board on coder-fleet/state before step 2d asks, so with "Ignore both" the next release flush still pushes the board to main. Fix: ask before the move and write the ignore and `auto_commit: false` first. For installs whose board moved earlier, /init now says unflushed state commits will still land, rather than promising otherwise.
Rides along: check-ignore -v exits 0 on a negation rule (detect by the `!` pattern); stale operations.ts line refs in board-config.md; a divergence register row if the OpenCode port carries init.

Propose items (not filed; the human says whether):
1. Give `board flush` a rule for `auto_commit: false` or a default branch that ignores `.boards`/`.claude/agent-memory` (skip, refuse, or drop those paths), so state commits made before an ignore are not pushed back. Needed for projects whose board already moved.
2. lead.md step 5 tells the lead to commit `.claude/agent-memory/` with each item's work; once /init ignores it, `git add` refuses those paths, so the lead needs a rule for an ignored memory directory.

Done: the step and docs are on a branch. Not done: the ordering fix; unmerged; never run end to end.
---

author: lead
created: 2026-11-10 02:46
---
Sub-issue 2 of 2: started (CF-187.1, the Polish). Done still needs: criteria 2 and 8 (question text), CF-187.1, then one PR for both.

Review round 2 on the fix 08837809...aad3e98: request changes, 1 blocking. The ordering fix holds (the move's first commit is skipped after Ignore, confirmed in state-worktree.ts). Blocking: the rewritten question dropped "the release flush has no board change to land", which criteria 2 and 8 require. Two lows: a state branch whose worktree was deleted escapes the edit; step 2b still says board writes are always committed and always adds .boards/ to the commit reminder. Gates at aad3e98: check-all.sh exit 0 (90.5 s, board 359/0), board-hook 269/0, scope-hook 773/0, handoff-parity 32 agree.

The item's one review and one fix round are spent, so all three went to Polish sub-issue CF-187.1, built on top of cf-187-init-gitignore-board-memory (pushed) and shipped in the same PR.

Done: /init asks before the board moves and turns board commits off on Ignore; branch pushed. Not done: the question's flush clause; the two gaps; no PR yet.
---

author: lead
created: 2026-11-10 02:56
---
Sub-issue 2 of 2: ready to merge in PR #137 (CF-187 and CF-187.1 together, from cf-187.1-init-question-polish). Done still needs: criteria 1-8 proven on main (merge), and the release (version bump, tag, flush).

Done: /init's step 2a asks before the board moves; on Ignore it ignores both directories, untracks committed copies and turns board commits off, and says plainly when earlier state commits will still land. Not done: unmerged, so the human cannot use it yet; never run end to end; memory commits after CF-183.2 and a flush guard are the two unfiled proposals in comment #5.
---

author: lead
created: 2026-11-10 04:35
---
Sub-issues 1 and 2 of 2: merged to main at e13674b (PR #137, CF-187 and CF-187.1). Done still needs: the v0.50.0 release (bump, tag, flush), then ticking criteria and DoD.

Merged at the human's word, 2026-11-10, after CI passed on f3001d2 and GitHub reported it mergeable against main with #135 in.

Done: /init's step 2a is on main. Not done: installs still run 0.49.0 until v0.50.0 ships; step 2a never run end to end. Follow-ups filed at the human's word: CF-188 (flush guard), CF-189 (lead rule for ignored memory), CF-191 (wording polish).
---
<!-- COMMENTS:END -->
