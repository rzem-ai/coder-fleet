---
id: CF-200
title: Fast-forward the main checkout's default branch from a SessionStart hook
status: In Progress
assignee: []
created_date: '2026-11-12 06:33'
updated_date: '2026-11-12 07:57'
labels: []
dependencies: []
priority: Medium
type: enhancement
ordinal: 325000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 12 Nov 2026 ("yes, file the SessionStart hook card"). Not ordered to build: it waits in To Do until the human moves it to Next.

CF-195 and CF-197 (v0.52.0) made keeping local main level with the remote an instruction in lead.md step 1 and lead-procedures' Worktrees and memory paragraph: `git fetch`, then `git merge --ff-only`, or `git fetch origin <default>:<default>` when another branch is out; fast-forward only, a refusal reported and never resolved by reset, stash, rebase or force. Nothing enforces it: a session whose lead skips it, or a session on an older plugin, builds on a stale main, as the Fathom checkout did at 18 commits behind. The plugin already runs three SessionStart hooks (board-focus-clear.sh, board-binary.sh, memory-state.sh start); this adds a fourth that does the fast-forward itself and tells the session what happened, so the lead's rule becomes a check on the hook rather than the only line of defence. The instruction stays for the after-merge and before-spawn moments, which a SessionStart hook cannot cover.

Things to settle in the build: only the main checkout (a session started inside a linked worktree must not move that worktree's branch); a short network timeout so a slow or absent remote never delays a session; the default branch from `origin/HEAD` as prune-worktrees reads it, with a remote not named origin; how the result reaches the lead (additionalContext) and the human; and whether the OpenCode port gets the same, or a divergence-register row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When a session starts in the main checkout with the default branch checked out and behind its remote, a SessionStart hook fast-forwards it, and the session is told how many commits it moved
- [x] #2 With another branch checked out, the hook moves the local default branch forward without a checkout when it can fast-forward, and tells the session which branch is out
- [x] #3 The hook never resets, stashes, rebases, merges with a commit or force-updates: when the fetch fails, the remote is unreachable, local commits diverge or a changed file is in the way, it changes nothing and tells the session why
- [x] #4 A session started inside a linked worktree, or outside a git repository, is left untouched
- [x] #5 The fetch is bounded by a short timeout, and no outcome of the hook blocks or fails the session start
- [x] #6 lead.md and lead-procedures say the hook does the session-start fast-forward and the lead still does it after each merge and before cutting a worktree
- [x] #7 A contract test covers behind, level, diverged, dirty in the way, other branch out, linked worktree, no remote and fetch timeout, and runs in check-all.sh
- [x] #8 `bash claude/evals/lib/check-all.sh` passes
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
created: 2026-11-12 06:34
---
Ordered by the human, 12 Nov 2026: "go ahead and build CF-200". The description's "Not ordered" line is out of date.

Lead's defaults for what the description leaves to the build, recorded because each is easy to reverse: the fetch is bounded at 5 seconds; the result reaches the session as SessionStart additionalContext in one line, and says nothing when the branch was already level; the default branch is read as prune-worktrees reads it; the OpenCode port gets a divergence-register row unless the port has an equivalent session-start hook point, in which case it is ported.

Sub-issue 1 of 1: started. Done still needs: criteria 1 to 8.

Done: nothing yet. Not done: a session still starts on whatever local main it has unless the lead remembers to fast-forward it. A coder is being spawned.
---

author: lead
created: 2026-11-12 07:25
---
Built on PR #168, head 0fef96ea; review round 1 running. Seven automated security review passes on the pushed hook were folded in before the handoff: remote text and credentials kept out of the session's context and log, option-injection guards, a protocol allowlist on every git call, alternates and partial clones refused, remote URLs checked whole at every scope, and local and worktree git config held to an allowlist of keys git itself writes. Consequence for the human: a repository whose own .git/config holds any other key (core.sshCommand, a credential helper, insteadOf, submodule.recurse and so on) gets a fixed sentence and no fast-forward, and the lead does it by hand; the same keys in global or system config still work. Mutation testing found and fixed one real hole (a local protocol.ext.allow overriding the command-line never).

Proposals from the coder, not filed: lead-procedures could say what to do when the hook reports the allowlist skip (tell the human which local key blocked it); hooks/README.md's table has no row for memory-state.sh though hooks.json registers it.

Unverified by the coder: Linux (CI is the first run of the set -m watchdog there), a real network fetch (all through an ssh stub), and the parallel SessionStart race with memory-state.sh start.
---

author: lead
created: 2026-11-12 07:36
---
Review round 1 on PR #168 at 0fef96ea: approve with follow-ups, no blocking finding; all four declared gates green; the reviewer read the memory-state.sh race and found it cannot collide (it writes nothing to the main checkout's index). Sent one fix round anyway, because the follow-up defeats the card in ordinary JS and LFS repos: the allowlist refused inert keys husky, git-lfs and gh write, so the hook would refuse every session there.

Lead's default, recorded because it is easy to reverse: add `core.hookspath` (overridden on every call), `lfs.repositoryformatversion`, `remote.<n>.gh-resolved` and `branch.<n>.pushremote` to the allowlist; `filter.lfs.*` at local scope stays refused. Riding the same round: skip the update-ref move during a rebase or bisect on the default branch, as git's own fast-forward refuses; and make lead-procedures' reading of the hook's silence accurate. A narrow round 2 follows, as this hook runs unsandboxed on every session start.
---

author: lead
created: 2026-11-12 07:56
---
Sub-issue 1 of 1: ready to merge in PR #168. Done still needs: Definition of Done 4 (the version bump and tag, which are the human's).

Done: a SessionStart hook (hooks/main-fast-forward.sh) fast-forwards the main checkout's default branch and tells the session in one line; with another branch out it moves the local default branch by update-ref after an ancestry check; it refuses and says why on a diverged branch, a file in the way, a failed or timed-out fetch, unsafe local git config, or a rebase or bisect in progress; it does nothing in a linked worktree or outside a repository; the fetch is cut off after 5 seconds and every exit is 0. Head e62da4d2.

Evidence for the ticks. Criteria 1 to 5 and 7: fast-forward-contract.sh, 207 passed, run in check-all.sh as section fast-forward - B01-B03, U01, T01 (behind), V01-V02 (level), O01-O04 (other branch out), D01, W01-W03, F01, N01 (refusals, uncommitted changes byte-identical), L01, X01 (untouched), F02, F03, E01-E03 (bounded, never fails), S01-S29 and A01-A02, R01-R04 (security, allowlist, rebase and bisect). Round 1's reviewer found every card-named check fails if the hook is reverted; round 2's found the same for the fix round's cases. Criterion 6: lead.md step 1 and lead-procedures' Worktrees and memory, read by both reviewers. Criterion 8 and Definition of Done 1: round 2 reviewer's check-all.sh at e62da4d2 exit 0, scope-hook 928 passed, board-hook 268 passed, handoff-parity ok; CI green on the same head, its first Linux run. Definition of Done 2: round 1 approve with follow-ups, one fix round, narrow round 2 approve with follow-ups, no blocking finding in either; build phase, no refuter round. Definition of Done 3: migration-checklist findings for lead.md are in the PR description (no finding needing a fix). Definition of Done 5: divergence-register row added (OpenCode has no once-per-session hook point). Definition of Done 6: no spec.

Not done: not released. Never run against a real remote (every fetch went through an ssh stub) or a real main checkout.

Still open after the item's review round and fix round, recorded and not built: (1) git-lfs is believed to write `lfs.<url>.access` and `lfs.<url>.locksverify` at local scope after a first push, which the allowlist lacks, so an LFS repository that has pushed would still be refused each session and the line cannot name the key; needs checking against a real git-lfs push. (2) A rebase with --update-refs listing the default branch is not detected. Dropped lows: the pushremote comment's safety argument is wrong (safe because the hook never pushes); the refusal says `in a worktree` when the rebase is in the main checkout; lead-procedures' list of silent cases omits a remote with no URL and the ERR trap. Reviewer left a duplicate memory note (cf-200-session-fast-forward.md, marked superseded) for the lead to remove.
---

author: lead
created: 2026-11-12 07:57
---
Sub-issue 1 of 1: merged to main at fbd0ac8d. Done still needs: Definition of Done 4 (the version bump and tag, which are the human's).

Done: the hook is on main (PR #168, squash-merged after round 2 approved, CI green and GitHub reported it mergeable). The coder's memory notes are on the state branch; the worktree and branches are removed.

Not done: it is in no release, so no session runs the hook until the next version.
---
<!-- COMMENTS:END -->
