---
id: CF-161
title: Remove CF citations and history from code comments
status: Done
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-18 12:52'
labels: []
dependencies: []
type: chore
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word, 2026-10-18, extending CF-158's present-tense rule to code comments: opencode/coder-fleet/lib/scope.ts, the hook scripts, the board source the fleet changed, and the tests carry CF-nn citations and backstory.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No code comment in claude/ or opencode/ cites a CF item, PR number or date, or narrates past behaviour; comments state what the code does and why
- [x] #2 Test names that cite a CF item are renamed to describe the behaviour
- [x] #3 The vendored board fork's upstream NOTICE.md and LICENSE are untouched
- [x] #4 bash claude/evals/lib/check-all.sh and the OpenCode unit tests pass
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
created: 2026-10-18 10:41
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-4.

Done: nothing yet; a coder is stripping CF, PR and date citations from code comments and test names. fleet.ts, opencode/test/run.sh and live tests are left to CF-164.1; prose docs are left to CF-160. Not done: comments still carry history.
---

created: 2026-10-18 11:13
---
Sub-issue 1 of 1: ready to merge in PR #99, pending review. Done still needs: criteria 1-4 proven on main, review.

Done: code comments and test names in claude/ and opencode/ no longer cite CF items, PR numbers, rounds or dates; reasons that lived only as history are restated in the present tense. NOTICE.md and LICENSE untouched. check-all green on the final commit (exit 0, 217 s; board 319 pass, opencode-unit 56 pass). Not done: review; merge.

Coder's first check-all run had one red board test, git-commit.test.ts "retries a locked index and lands once the lock clears", which passed alone and in the next full run on a later commit. Not yet shown intermittent on one commit; the reviewer is rerunning it.

Out of scope and not filed (lead's handoff lists them for the human): the cf48_/cf70_/cf80_ helper names in board-hook-contract.sh, CF-90 citations in claude/evals/reviewer/rubric.md and claude/evals/fixtures/gates-app/README.md, and the claude/scripts/spike/cf-12.1/ directory name.
---

created: 2026-10-18 11:19
---
Review round 1 on PR #99: request changes. Done: every hunk is a comment, docstring or test name with no executable change; criterion 2 met (test names describe behaviour); criterion 3 met (NOTICE.md, LICENSE untouched); kept reasons spot-checked as true. Not done: criterion 1, since seven comment blocks still narrate past behaviour (board-subagent-stop.sh:437, board-hook-contract.sh:369, enforce-agent-scope.sh:158, scope-hook-contract.sh:1214, agent-pairs-contract.sh:778, review-round.js:727, workflow-logic.mjs:1558). Criterion 4 unproven by the reviewer: the scope hook refused check-all because AGENTS.md declares no gates block. Fix round 1 sent to the coder with those plus the lows; the lead runs check-all on the fixed head.
---

created: 2026-10-18 11:40
---
Sub-issue 1 of 1: ready to merge in PR #99 (head 9fe187e, v0.41.5). Done still needs: the human's merge, the tag, criteria ticked on main.

Done: fix round 1 restated the seven flagged blocks and about 75 more found on a re-sweep, plus the lows; the fix commit e15182d changes comment lines only (lead checked the diff). Gates run by the lead, independently, on e15182d: `bash claude/evals/lib/check-all.sh` exit 0, 281.4 s, every section ok, board 319 pass, opencode-unit 56 pass, git-commit "retries a locked index" passed. CI green on e15182d. Version bumped to 0.41.5 on the branch. Not done: merge; tag v0.41.5 on 9fe187e after merge.

The review cap is spent (one review round, one fix round). Anything still left after a re-sweep would go to a Polish sub-issue, not another round.
---

created: 2026-10-18 12:46
---
Definition of Done: #1 check-all passed on the branch (lead's run on e15182d, exit 0). #2 reviewer approved after fix round 1, and lead's own read of the fix diff and gate run; no refuter, because lead.md step 4 sends none to a comment-only change. #3 not applicable: no agent body or skill frontmatter changed. #4 v0.41.5 bumped in plugin.json and marketplace.json, tagged on 9fe187e and pushed. #5 not applicable: no ported artefact's behaviour changed, only comments. #6 not applicable: there is no spec for CF-161.
---

created: 2026-10-18 12:46
---
Sub-issue 1 of 1: merged to main at 052c237. Done still needs: nothing; closing.

Criteria evidence on main: #1 reviewer's diff read plus fix round 1's re-sweep, and the lead's check that the fix diff is comment lines only; #2 renamed section and test names listed in the coder's handoff, reviewer confirmed no reference to old names; #3 reviewer confirmed NOTICE.md and LICENSE not in the diff; #4 lead's check-all exit 0 on e15182d (board 319 pass, opencode-unit 56 pass) and CI green.

Done: code comments and test names state what the code does and why. Not done: the cf48_/cf70_/cf80_ helper names and the spike/cf-12.1 directory still carry CF ids, as identifiers outside this card.
---
<!-- COMMENTS:END -->
