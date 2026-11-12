---
id: CF-195
title: Make the lead keep the local default branch level with the remote's
status: In Progress
assignee: []
created_date: '2026-11-11 21:47'
updated_date: '2026-11-11 21:59'
labels: []
dependencies: []
priority: Medium
type: enhancement
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human in the session, 12 Nov 2026: "you have to add something into the `lead` agents to keep local main in line with remote main. for example, the agent in `/Users/alex/Dev/Work/fathom/fathom` is 18 commits behind the remote".

The lead merges pull requests on GitHub and never brings the main checkout's default branch forward afterwards, so the local branch falls behind. Agent worktrees are cut from the lead's current HEAD, so a stale local default branch means builders start from old code, and the human's own checkout shows old files.

Both leads change: the Claude Code plugin's and the OpenCode port's.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Claude Code lead's instructions tell it to fetch and fast-forward the main checkout's default branch from the remote at the start of a session and after each pull request merges, before any worktree is cut from it
- [x] #2 They tell it what to do when the fast-forward cannot happen (local commits the remote lacks, a changed file in the way, or the main checkout on another branch): report it to the human and leave the checkout as it is, with no reset, stash, rebase or forced update
- [x] #3 The OpenCode port's lead carries the same rule, or the divergence register has a row saying why not
- [x] #4 `bash claude/evals/lib/check-all.sh` passes with the changed lead and skill
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-11 21:47
---
Sub-issue 1 of 1: started, 12 Nov 2026. Done still needs: criteria 1 to 4.

Lead notice: both leads gain a rule to fetch and fast-forward the main checkout's default branch from the remote at session start, after each merge and before a worktree is cut, and to report rather than force when it cannot fast-forward. What the human will see: a project's local main no longer sits commits behind the remote after the lead has merged work.

The lead builds this itself: it is under the size floor (no endpoint, no schema, no credential path). Lead defaults: fast-forward only, by `git merge --ff-only` on the default branch or `git fetch origin <default>:<default>` from another branch; a refusal is reported and nothing is reset, stashed or rebased, because local commits and changes are the human's. The decision goes in the lead body's step 1 and the how in lead-procedures under Worktrees and memory; the port's lead takes it in its own step 1.

Done: nothing yet. Not done: neither lead says anything about a stale local main.
---

author: lead
created: 2026-11-11 21:59
---
Sub-issue 1 of 1: merged to main at e7c332e (PR #151, squash-merged by the lead under the Shipping line, 12 Nov 2026). Done still needs: Definition of Done 4, the version bump and tag, which are the human's.

Review round 1 (e552c9d..4e00e02): approve with follow-ups, no must-fix. Gates run by the reviewer from the worktree at 4e00e02: check-all.sh exit 0 (122.5 s), scope-hook 916/0, board-hook 268/0, handoff-parity 32 agree. CI on 4e00e02: deterministic pass, 5m44s. No break round: prose alone.

Ticked on evidence: criterion 1 (lead.md step 1 and lead-procedures, Worktrees and memory, read by the reviewer), 2 (the refusal clause, read by the reviewer; lead default: a main checkout on another branch is handled by `git fetch origin <default>:<default>` rather than reported, as comment 1 recorded), 3 (opencode/coder-fleet/agent/lead.md step 1 carries the rule), 4 (the reviewer's and CI's suite runs). Definition of Done: 1 the same runs; 2 the review approved, no break round called for; 3 the checklist's result, no findings, is in PR #151; 5 not applicable: the port carries the same rule, so there is no divergence to register; 6 not applicable: no spec.

Three Low findings, dropped under the build phase and recorded here: nothing says what to do when the plain `git fetch` fails, or how to find the remote and default branch names other than `origin`; when the main checkout is on another branch, worktrees are still cut from that branch and the human is not told which branch is out; a flush that says it did not fast-forward should be read as a refusal, and the text says to fetch nothing more.

Unverified: whether the lead follows the new prose in a live session, in either port; the lead eval was not run. The worktree and branch are removed, and this repo's local main was fast-forwarded to e7c332e.

Done: on main, both leads are told to keep local main level with the remote and to report rather than force. Not done: not released, so no install has it yet.
---
<!-- COMMENTS:END -->
