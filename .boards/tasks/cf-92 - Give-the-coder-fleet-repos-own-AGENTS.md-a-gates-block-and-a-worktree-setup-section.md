---
id: CF-92
title: >-
  Give the coder-fleet repo's own AGENTS.md a gates block and a worktree setup
  section
status: In Progress
assignee: []
created_date: '2026-09-30 09:12'
updated_date: '2026-10-18 12:52'
labels: []
dependencies:
  - CF-52
  - CF-90
priority: Medium
type: docs
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-52 and CF-90, 2026-09-30. CF-52 adds a Worktree setup section to templates/AGENTS.md that coders follow before building; CF-90 adds a ```gates``` block that the reviewer may run. This repo's own AGENTS.md has neither, so coders here don't know that the board tests need `bun install --frozen-lockfile` in claude/coder-fleet/board, and reviewers here have no gates to run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md has a Worktree setup section saying how a fresh worktree gets its dependencies (bun install --frozen-lockfile in claude/coder-fleet/board for the board tests)
- [ ] #2 AGENTS.md has a gates block naming the deterministic suite and the contract suites a reviewer may run, and the CF-90 hook allows each from a linked worktree
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-18 11:19
---
2026-10-18: hit again on CF-161. The reviewer on PR #99 could not run check-all because the scope hook refuses it without a gates block in AGENTS.md, so the lead ran the gate instead. The same happened on CF-158 and CF-165 reviews.
---

created: 2026-10-18 11:22
---
2026-10-18: the human, via AskUserQuestion, "Yes, add to Next". Taken now, alongside CF-161 and CF-164.1, because it touches only AGENTS.md and lets the reviewers on those PRs run the suite.

Sub-issue 1 of 1: started. Done still needs: criteria 1-3. Done: nothing yet. Not done: reviewers here still cannot run the suite.
---

created: 2026-10-18 11:30
---
Sub-issue 1 of 1: ready to merge in PR #100, pending review. Done still needs: criteria 1-3 proven on main, review.

Done: AGENTS.md has a gates block (suite, scope-hook, board-hook, handoff-parity) and a Worktree setup section (jq, python3, node; bun install --frozen-lockfile in claude/coder-fleet/board). The scripter ran the real hook from a linked worktree of a scratch repo carrying the new AGENTS.md: all four gates allowed, evil.sh and rm -rf denied. check-all green (276.8 s, under load). Not done: review; merge. Reviewers can run the suite only once this is on main, because the hook reads AGENTS.md from the main checkout.
---

created: 2026-10-18 11:34
---
Review round 1 on PR #100: approve with follow-ups; no gate ran, because the hook refuses gates until main has the block. Lead's default on the reviewer's open question, recorded here: the Worktree setup line says what the suite does. The coder installs board dependencies first, so a review in the coder's worktree installs nothing, and in a worktree without node_modules the suite installs them itself. Fix round 1 sent: that wording, the 'read from the main checkout' wording, run from the worktree root, drop the jq/python3/node repeat and name bun, plus a scope-hook-contract case for a `bash <path>` gate. Criteria 2 and 3 get a real reviewer-scope run after merge.
---

created: 2026-10-18 12:01
---
Sub-issue 1 of 1: ready to merge in PR #100 (head 19e340f), after PR #99. Done still needs: the human's merge, version bump and tag, criterion 2 proven by a real reviewer run on main.

Done: fix round 1 (19e340f) says the hook reads gates from main's AGENTS.md, names bun, says what check-all installs and when, and adds a scope-hook-contract case for a `bash <path>` gate (allow declared, deny other.sh), watched failing first. The lead read the diff. Gates run by the lead on 19e340f: `bash claude/evals/lib/check-all.sh` exit 0, 218.9 s, every section 0 failed (board 319 pass, opencode-unit 56 pass). CI deterministic: success. Not done: version bump, held until #99 merges because both edit the version line.
---

created: 2026-10-18 12:52
---
Sub-issue 1 of 1: ready to merge in PR #100 (head 10817a1, v0.41.6). Done still needs: the human's merge, tag v0.41.6, criterion 2 proven by a real reviewer run on main.

Done: merged main after #99. One code conflict in scope-hook-contract.sh, resolved by keeping this PR's two `bash -c` cases with main's present-tense comment; scope-hook-contract.sh alone 773 pass, 0 fail. A second merge took main's board card files where the branch carried stale ones; the PR's diff against main is now AGENTS.md, scope-hook-contract.sh and the two version files. check-all on the merged branch exit 0. Not done: merge.
---
<!-- COMMENTS:END -->
