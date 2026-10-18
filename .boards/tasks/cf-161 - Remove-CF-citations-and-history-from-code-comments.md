---
id: CF-161
title: Remove CF citations and history from code comments
status: In Progress
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-18 11:19'
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
- [ ] #1 No code comment in claude/ or opencode/ cites a CF item, PR number or date, or narrates past behaviour; comments state what the code does and why
- [ ] #2 Test names that cite a CF item are renamed to describe the behaviour
- [ ] #3 The vendored board fork's upstream NOTICE.md and LICENSE are untouched
- [ ] #4 bash claude/evals/lib/check-all.sh and the OpenCode unit tests pass
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
<!-- COMMENTS:END -->
