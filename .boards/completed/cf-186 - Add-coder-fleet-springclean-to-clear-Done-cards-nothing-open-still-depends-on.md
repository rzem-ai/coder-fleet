---
id: CF-186
title: 'Add /coder-fleet:springclean to clear Done cards nothing open still depends on'
status: Done
assignee: []
created_date: '2026-11-10 02:08'
updated_date: '2026-11-10 04:53'
labels: []
dependencies: []
priority: Medium
type: feature
ordinal: 315000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked (2026-11-10): "another command `/springclean`. this command marks all "Done" cards to "Completed" if there are no open cards that depend on it, if there are no open child cards"

"Completed" is the board's `task_complete`: it moves a Done card out of the board into `.boards/completed/`, and refuses any card not in Done. Run as `/coder-fleet:springclean`, as plugin commands are namespaced.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `claude/coder-fleet/commands/springclean.md` exists with a description frontmatter, runs as `/coder-fleet:springclean`, and is named in the commands paragraph of `claude/README.md`
- [x] #2 A card in Done is cleared to completed only when no open card (any status but Done) lists it under dependencies and none of its child cards (sub-issues by parent id) is open
- [x] #3 A Done card held by an open dependent or an open child stays in Done, and the report names it with the ids of the open cards holding it
- [x] #4 Every card that qualifies is cleared in one `task_complete` call given `ids`, so the board makes one commit; springclean writes no status and never uses `task_archive`
- [x] #5 The command ends with one line giving how many cards were cleared and how many were held, with their ids
- [x] #6 `bash claude/evals/lib/check-all.sh` passes
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
created: 2026-11-10 02:08
---
Lead defaults, 2026-11-10:

1. Springclean clears without asking first: `task_complete` is a committed folder move on the state branch, so it is reversible from git.
2. "Open" means any status but Done, Draft included. A child already cleared to completed counts as finished.
3. A Done child whose parent is still open is cleared like any other Done card, since the rule the human gave looks only at dependents and children.
4. Springclean does not check a card's criteria or DoD; a card reached Done through the TaskCompleted gate already.
---

author: lead
created: 2026-11-10 02:08
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-6.

Done: nothing yet. Not done: the human cannot yet run /coder-fleet:springclean; scripter is building the command file and README entry.
---

author: lead
created: 2026-11-10 02:12
---
Sub-issue 1 of 1: started (built at b43bc2c on cf-186-springclean-command, review round 1 running). Done still needs: criteria 1-6.

Done: the command file and README clause are on a branch; the scripter's check-all.sh run exited 0 in 92.6 s. Not done: the human cannot run /coder-fleet:springclean yet; it is under review and unmerged, and has never run against a live board. Dependents are read from task_view's Dependency Graph because task_list carries no dependencies; the reviewer is asked to check that holds.
---

author: lead
created: 2026-11-10 02:26
---
Sub-issue 1 of 1: started (review round 1 done, fix round 1 running). Done still needs: criteria 1-6.

Review round 1 on b43bc2c: request changes, 2 blocking. Gates in the review worktree: check-all.sh exit 0 (184.5 s with 85 s lock wait, every section 0 failed), scope-hook 773/0, board-hook 269/0, handoff-parity 32 agree.
- must fix: children were read from `task_list`'s parentTaskId, which it does not print; take them from each candidate's `task_view` Subtasks list.
- must fix: dependents came only from task_view's Dependency Graph, which never sees Drafts; list Drafts and read their Depends on.
Rides along: a mid-batch `task_complete` failure has already cleared some cards, so the report names them and still prints the closing line.

Lead default added: a candidate is held while any descendant is open, not only a direct child (CF-183.2 has its own sub-issue). The reviewer's follow-up about the /init gitignore request is covered by CF-187.

Done: command built and reviewed on a branch. Not done: the hold rule fix; unmerged; never run against a live board.
---

author: lead
created: 2026-11-10 02:39
---
Sub-issue 1 of 1: ready to merge in PR #136. Done still needs: criteria 1-6 proven on main (merge), and the release (version bump, tag, flush).

Review round 2 on the fix b43bc2c...ddd43aa: approve, nothing blocking. Gates at ddd43aa: check-all.sh exit 0 (92.1 s; board bun 112/0 and 359/0), scope-hook 773/0, board-hook 269/0, handoff-parity 32 agree. Two lows dropped under the round cap: after a thrown (not refused) task_complete the report should re-list Done rather than trust the error text; a Draft's Depends on tree is transitive, so a Draft can over-hold a card it depends on only indirectly. Unverified: a child cleared to completed while it still had an open sub-issue hides that grandchild from the walk.

Done: /coder-fleet:springclean is reviewed and up as draft PR #136. Not done: unmerged, so the human cannot run it yet; never run against a live board; no version bump. The merge is the human's. #135 and #136 each add one clause to the same README line, so the second to merge needs a one-line conflict resolved.
---

author: lead
created: 2026-11-10 04:49
---
Sub-issue 1 of 1: merged to main at d7bf1fb (PR #136). Ticked on evidence, 2026-11-10. Criteria 1-5 are instruction prose in claude/coder-fleet/commands/springclean.md and the README paragraph; round 2 (b43bc2c...ddd43aa) approved after checking each against the board source (task_view Subtasks, Draft handling in viewTask, task_complete ids in handlers.ts), and the README merge resolution 864492e was approved in a narrow review. Criterion 6: CI passed on 864492e and on the release head 829ab6f.

DoD 1: check-all.sh exit 0 at ddd43aa. DoD 2: reviewer approved; no refuter, prose on no code path, build phase. DoD 3: not applicable: no agent body or skill frontmatter changed. DoD 4: 0.50.0 bumped, v0.50.0 tagged and pushed. DoD 5: not applicable: the OpenCode port carries no board. DoD 6: not applicable: no spec.

Done for the human: /coder-fleet:springclean runs on 0.50.0. Not done: never run against a live board; the dropped lows are CF-191.
---
<!-- COMMENTS:END -->
