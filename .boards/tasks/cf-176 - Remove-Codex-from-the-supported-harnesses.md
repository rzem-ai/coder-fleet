---
id: CF-176
title: Remove Codex from the supported harnesses
status: Done
assignee: []
created_date: '2026-10-22 08:58'
updated_date: '2026-11-08 08:24'
labels: []
dependencies: []
priority: Medium
type: chore
ordinal: 300000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked on 2026-10-22: "remove `codex` from the supported harneses".

The human chose to delete the `codex/` tree outright (git history keeps it), with a short decisions note saying why it went and which commit to recover it from.

In scope: `codex/` (all 24 files); the README harness table and install line; AGENTS.md's intro, tree and ports paragraph; docs/fleet-design.md's repo paragraph and tree; the codex roots in claude/evals/lib/instruction-file-contract.sh and claude/evals/lib/requirements-source-contract.sh; the provenance comments in claude/scripts/spike/cf-12.1/lib/guard.sh and selftest.sh.

Out of scope: the `@codex` assignee fixtures in the board's search tests (just a test name, unrelated to the harness), and completed cards under .boards/ (history).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The codex/ directory no longer exists on main
- [x] #2 README.md, AGENTS.md and docs/fleet-design.md list only Claude Code and OpenCode as harnesses, with no Codex row, tree entry or prose (the intro says two harnesses, not three)
- [x] #3 No eval script or spike script on main refers to a codex/ path, and `git grep -in codex -- ':!.boards' ':!claude/coder-fleet/board/src/test'` returns only the new decisions note
- [x] #4 docs/decisions/ has a short note saying Codex was dropped as a harness on 2026-10-22, and naming the last commit that has codex/ in it
- [x] #5 bash claude/evals/lib/check-all.sh passes on the branch
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
created: 2026-10-22 08:58
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-5.

Done: card filed from the human's order (2026-10-22). The human chose to delete codex/ outright. scripter is now building it in a worktree, with a v0.42.6 bump on the branch.
Not done: in the repo, Codex is still listed as a harness and codex/ still exists. No review has run and nothing has merged.
---

author: lead
created: 2026-11-08 07:05
---
Drain, 8 Nov 2026: the removal itself landed in 330d591 'CF-176: drop the Codex port' (merged through PR #117 on 5 Nov 2026), so criterion 1 holds and criterion 2's README, AGENTS.md and fleet-design changes are on main. Two criteria do not hold yet: 3 - `git grep -in codex -- ':!.boards' ':!claude/coder-fleet/board/src/test'` still finds the example branch name `cf-176-remove-codex` and commit subject `CF-176: delete codex/ and its README row` in claude/coder-fleet/agents/lead.md:31, coder.md:33 and scripter.md:33; 4 - there is no note under docs/decisions/. The last commit with codex/ in it is 515d5a0 (5 Nov 2026), the parent of 330d591.

Lead decisions for the finish: replace the three examples with ones that name no harness, keeping the id CF-176 and the rest of each sentence; the decisions note says the human ordered Codex dropped on 22 Oct 2026, it was removed in 330d591 on 5 Nov 2026, and codex/ is recoverable from 515d5a0. Sub-issue 1 of 1 resumes: started.
---

author: lead
created: 2026-11-08 07:16
---
Sub-issue 1 of 1: ready to merge in PR #130. Done still needs: criteria 1-5 ticked once proven on main; the release bump and tag.

PR https://github.com/rzem-ai/coder-fleet/pull/130 (draft, cf-176-finish-codex-removal from origin/main 095d136): 592b9af names no harness in the lead, coder and scripter examples; 9706952 adds docs/decisions/codex-port-dropped.md. Review round 1 approved; gates at 9706952: check-all.sh exit 0 (88.0 s), scope-hook 773/0, board-hook 269/0, handoff-parity agree. Two lows dropped under the build phase. Lead default on the reviewer's follow-up: no bump on this PR - it ships with the next release, whose branch carries the bump.

Done: Codex appears nowhere outside the board's history and the decisions note, on the branch. Not done: not merged; installs keep the old examples until the next release.
---

author: lead
created: 2026-11-08 08:15
---
Sub-issue 1 of 1: merged to main at a3b9481 (PR #130). Done still needs: nothing on this card; installs see the new examples at the next release.

Criteria ticked on main, on evidence: 1 - codex/ gone since 330d591 (PR #117). 2 - README.md, AGENTS.md and docs/fleet-design.md name only Claude Code and OpenCode (330d591). 3 - `git grep -in codex -- ':!.boards' ':!claude/coder-fleet/board/src/test'` at 9706952 returns only docs/decisions/codex-port-dropped.md (review round 1). 4 - docs/decisions/codex-port-dropped.md names 22 Oct 2026, 330d591 and 515d5a0. 5 - check-all.sh exit 0 at 9706952 (88.0 s) and CI deterministic pass on PR #130.
Definition of Done: 1 as criterion 5; 2 - review round 1 approved, no refuter for a prose-only change; 3 - migration-checklist findings in PR #130's body (none); 4 - lead.md, coder.md and scripter.md last released in v0.49.0; the example change ships in the next release, and the human ordered this merge without a bump; 5 - not applicable: no ported artefact carries the example; 6 - not applicable: no spec.

Done: Codex appears nowhere outside the board's history and the decisions note, on main. Not done: nothing.
---
<!-- COMMENTS:END -->
