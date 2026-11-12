---
id: CF-200
title: Fast-forward the main checkout's default branch from a SessionStart hook
status: In Progress
assignee: []
created_date: '2026-11-12 06:33'
updated_date: '2026-11-12 07:25'
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
- [ ] #1 When a session starts in the main checkout with the default branch checked out and behind its remote, a SessionStart hook fast-forwards it, and the session is told how many commits it moved
- [ ] #2 With another branch checked out, the hook moves the local default branch forward without a checkout when it can fast-forward, and tells the session which branch is out
- [ ] #3 The hook never resets, stashes, rebases, merges with a commit or force-updates: when the fetch fails, the remote is unreachable, local commits diverge or a changed file is in the way, it changes nothing and tells the session why
- [ ] #4 A session started inside a linked worktree, or outside a git repository, is left untouched
- [ ] #5 The fetch is bounded by a short timeout, and no outcome of the hook blocks or fails the session start
- [ ] #6 lead.md and lead-procedures say the hook does the session-start fast-forward and the lead still does it after each merge and before cutting a worktree
- [ ] #7 A contract test covers behind, level, diverged, dirty in the way, other branch out, linked worktree, no remote and fetch timeout, and runs in check-all.sh
- [ ] #8 `bash claude/evals/lib/check-all.sh` passes
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
<!-- COMMENTS:END -->
