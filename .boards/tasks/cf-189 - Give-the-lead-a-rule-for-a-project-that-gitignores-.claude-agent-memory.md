---
id: CF-189
title: Give the lead a rule for a project that gitignores .claude/agent-memory/
status: Done
assignee: []
created_date: '2026-11-10 04:28'
updated_date: '2026-11-12 00:17'
labels: []
dependencies: []
references:
  - claude/coder-fleet/agents/lead.md
  - CF-187
  - CF-183.2
priority: Medium
type: enhancement
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 2026-11-10, from CF-187's review: lead.md step 5 tells the lead to commit what changed under `.claude/agent-memory/` with each item's work, but once /init's step 2a ignores that directory `git add` refuses those paths. Interacts with CF-183.2, which moves memory into the state worktree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 lead.md says what the lead does with agent memory when `.claude/agent-memory/` is ignored by a project `.gitignore`: it neither force-adds it nor reports the refusal as a failure
- [x] #2 Where CF-183.2 has landed, the rule also covers memory written to the state worktree in an ignoring project
- [x] #3 `migration-checklist` findings are in the PR, since an agent body changes
- [x] #4 `bash claude/evals/lib/check-all.sh` passes
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
created: 2026-11-11 22:18
---
Sub-issue 1 of 1: started, 12 Nov 2026, by drain; the card is in Next, which is the human's order. Done still needs: criteria 1 to 4.

Lead notice: the lead's instructions say what it does with agent memory in a project whose `.gitignore` ignores `.claude/agent-memory/`: it neither force-adds it nor treats the refusal as a failure, and the rule covers memory the hook writes to the state worktree. What the human will see: a lead in an ignoring project that stops tripping over memory it cannot commit.

Lead defaults for the builder: since v0.51.0 the lead no longer commits memory with an item's work; the `memory-state.sh` hook commits it on the state branch. So the builder first finds out what that hook and the flush do in an ignoring project, and the rule describes that. The rule goes in the lead-procedures skill under Worktrees and memory, which the lead preloads, with the body's step 5 touched only if it now says something untrue; the card's "lead.md says" is read as the lead's instructions, body or preloaded skill. If the hook itself misbehaves in an ignoring project, that is a finding for the human, not a fix on this card.

Done: nothing yet. Not done: the lead has no rule for an ignoring project.
---

author: lead
created: 2026-11-11 22:26
---
Coder handoff, 12 Nov 2026: branch cf-189-ignored-memory-rule at c339193, one commit on e7c332e, up as draft PR https://github.com/rzem-ai/coder-fleet/pull/155. One 88-word paragraph at the end of Worktrees and memory in lead-procedures: in an ignoring project memory still lands on coder-fleet/state because the hook commits with plumbing and never `git add`; the lead never force-adds it; a refused ignored path is not a failure to report; memory that never reaches the default branch is not one either. lead.md's body is unchanged, since nothing in it is untrue for an ignoring project. The coder proved the behaviour with a scratch fixture: `git add` of a memory path is refused, the hook still commits both agents' notes on the state branch, the lead's note is removed from the main checkout at session end, and today's flush lands the ignored notes on the default branch, which CF-188 (PR #154) fixes. The port's lead says nothing about memory, so nothing changes there. Migration checklist: no findings. Coder's check-all.sh: exit 0, 258.8 s while other suites ran beside it.

Unverified by the coder: the behaviour after CF-188 lands; a project that tracked memory and ignored it later; the rule's phrase that nothing pushes the state branch rests on a grep of the plugin.

Review round 1 running. No break round: prose alone.
---

author: lead
created: 2026-11-11 22:41
---
Sub-issue 1 of 1: ready to merge in PR #155. Done still needs: the merge, which is the human's under drain, and Definition of Done 4, the version bump and tag. Merge it after or with CF-188 (PR #154), never ahead of it in a release.

Review round 1 (e7c332e..c339193): approve with follow-ups, no must-fix. Gates run by the reviewer from a review worktree at c339193: check-all.sh exit 0, scope-hook 916/0, board-hook 268/0, handoff-parity 32 agree. CI on c339193: deterministic pass.

Ticked on evidence: criterion 1 (the paragraph in lead-procedures, Worktrees and memory, read by the reviewer; the lead's default in comment 1 reads "lead.md says" as the lead's instructions, body or preloaded skill); 2 (the same paragraph covers memory on the state branch, and the reviewer checked its claims against memory-state.py and state-worktree.ts); 3 (the checklist's result, no findings, is in PR #155's body, written by the lead from the coder's handoff); 4 (the reviewer's and CI's runs). Definition of Done: 1 the same runs; 2 the review approved, no break round for prose; 3 as criterion 3; 5 not applicable: the port's lead says nothing about memory; 6 not applicable: no spec.

Follow-up, a merge-order matter: the paragraph's last clause says a flush that skips ignored paths leaves such memory on this machine's state branch alone. That is true only once CF-188 lands; before it, a flush still puts ignored notes on the default branch.

Done: on the branch, the lead has a rule for a project that ignores agent memory. Not done: not merged, not released.
---

author: lead
created: 2026-11-12 00:06
---
Sub-issue 1 of 1: merged to main at bb4da0b (PR #155, squash-merged by the lead on the human's order of 12 Nov 2026). CF-188 merged straight after it at 745bd1c, so the two ship in the same release, which is what the review's merge-order follow-up needed. Done still needs: Definition of Done 4, the release bump and tag, in PR #161.

Done: on main, the lead has a rule for a project that ignores agent memory. Not done: not released yet.
---

author: lead
created: 2026-11-12 00:13
---
Released in v0.52.0, 12 Nov 2026: bump 7479a72, tag v0.52.0 pushed, flush 95ddde7. Ticked: Definition of Done 4. Every criterion and Definition of Done item is now ticked.

Done: this card's change is in v0.52.0. Not done: it has not run in a live session yet.
---
<!-- COMMENTS:END -->
