---
id: CF-198
title: >-
  Stop a flush's restart deleting untouched files under a path the default
  branch ignores and has untracked
status: Done
assignee: []
created_date: '2026-11-11 23:51'
updated_date: '2026-11-12 03:59'
labels: []
dependencies: []
priority: High
type: bug
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 12 Nov 2026, answering CF-188.1's action 1: "Release, file a card (Recommended)". Not ordered: it waits in To Do for his go.

Proved by the CF-188.1 coder with a probe it then reverted. In a project whose default branch ignores `.claude/agent-memory/` and untracked it with `git rm --cached` (what /init's Ignore answer does), a flush that carries only a board change restarts the state branch and drops untouched memory files (the probe lost `coder-fleet-lead/MEMORY.md`) from both `coder-fleet/state` and the live state worktree. It happens with nothing held back and no carry, and with a carry. The files stay in the state branch's history. Cause: the restart takes the tip's untracking as a deletion for every path the state branch did not change. The same shape is expected for an ignored and untracked `.boards/`. It predates CF-188. The coder's suggested mechanism: on restart, keep the state branch's whole tree under any root the tip ignores.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In a project whose default branch ignores and has untracked `.claude/agent-memory/`, a flush leaves every memory file that was on the state branch still on it and in the live state worktree, whether or not the flush held anything back
- [x] #2 The same holds for an ignored and untracked `.boards/`
- [x] #3 A test with a real linked state worktree reproduces the loss on the unfixed code
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
created: 2026-11-12 02:03
---
Ordered by the human, 12 Nov 2026: he moved this card into Next, and asked which of the two Next cards to build first answered "CF-198 first (Recommended)". The description's "Not ordered" line is out of date.
---

author: lead
created: 2026-11-12 02:03
---
Sub-issue 1 of 1: started. Done still needs: criteria 1, 2, 3, 4.

Done: nothing yet. The human's order is recorded and the challenge gate passed (no spec to gate).

Not done: a flush in a project that ignores and has untracked `.claude/agent-memory/` or `.boards/` still deletes untouched files from the state branch and the live state worktree. A coder is being spawned to reproduce the loss in a test with a real linked state worktree, then fix the restart.
---

author: lead
created: 2026-11-12 02:21
---
Sub-issue 1 of 1: ready to merge in PR #162. Done still needs: Definition of Done 4 (the version bump and tag, which are the human's).

Done: a flush in a project that ignores and has untracked `.claude/agent-memory/` or `.boards/` now keeps every untouched file on the state branch and in the live state worktree, with or without anything held back, and through a failed restart. Head 377ee12.

Evidence for the ticks. Criteria 1 and 2: the four tests under `a root the default branch ignores and has untracked` in flush.test.ts (memory and board, no carry and carry), which the reviewer read against the unfixed code and found each would fail there. Criterion 3: those tests use a real linked state worktree; the coder saw `4 fail` before the fix and `0 pass, 5 fail` with the fix taken out. Criterion 4 and Definition of Done 1: the reviewer's own run of `check-all.sh` at 377ee12, exit 0, plus the three contract gates, all exit 0. Definition of Done 2: review-round round 1 verdict `approve with follow-ups`, no blocking finding; build phase, so no refuter round. Definition of Done 3, 5, 6: not applicable - no agent body or skill frontmatter changed, no ported artefact changed, and there is no spec.

Not done: nothing is released, so no install has the fix until the next version.

Dropped lows, recorded here and not built: no test pins the `ignoredAt` filter at flush.ts:650 (a card deliberately deleted on main without being ignored should stay deleted, and nothing guards that); docs/board-config.md step 4 still reads as if the Keep commit exists only when step 2 left something out.

Proposal from the review, not filed: decide how a flush should report files it carries only because the default branch ignores and untracked them. As built, every later flush in such a project prints `skipped N change(s)` counting the whole carried tree, which can hide a real held-back edit in the count. Reached by reading, not run.
---

author: lead
created: 2026-11-12 02:22
---
Sub-issue 1 of 1: merged to main at 8c63007. Done still needs: Definition of Done 4 (the version bump and tag, which are the human's).

Done: the fix is on main (PR #162, squash-merged after the review approved, CI green and GitHub reported it mergeable). The worktree and branch are removed.

Not done: it is in no release, so no install has it until the next version is bumped and tagged. The card stays out of Done until then.
---

author: lead
created: 2026-11-12 03:57
---
Definition of Done 4 ticked: released in v0.52.1 at the human's order ("Lead releases v0.52.1 (Recommended)", 12 Nov 2026). Version bumped in both files on 45916e2, release PR #165 merged as 4013d14 with CI green, annotated tag v0.52.1 on 45916e2 pushed.
---
<!-- COMMENTS:END -->
