---
id: CF-3
title: review-round silently ignores unknown input keys; accept a branch as target
status: In Progress
assignee: []
created_date: '2026-09-18 04:14'
updated_date: '2026-09-29 12:33'
labels: []
dependencies: []
references:
  - memory-tree BD-26
priority: High
project: Claude Agents
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Formerly BD-1 on the claudecode-agents board, renumbered when the boards were folded into the coder-fleet repo on 26 September 2026. Log entries below keep the old ids.

Original title: "Qualify the agent type names in the review-round workflow script". That defect was fixed by 508e4eb (see comment #3), so on 2026-09-29 the human reshaped this card around the second defect, which is still live.

`claude/coder-fleet/workflows/review-round.js` reads its input as `input.range`, or `input.base` + `input.head`, and otherwise defaults to `HEAD~1...HEAD` (lines 205-206). It also reads `issue`, `maxRounds`, `fix`, `refute` and `round`. It ignores any other key without saying so. On myassist-researcher RZE-289 it was invoked with `{ round, target, issue, phase }`: `target` was dropped, the run reviewed the previous commit on main (a docs commit) instead of the branch, and it returned "request changes" with four blocking findings against the wrong code. Reviewing the wrong thing without an error is worse than failing to start.

The fix does two things. It rejects unknown top-level keys, and it accepts a branch name as `target`, because pointing a review at a branch is the common case and `range` makes the caller build it by hand. `git diff <default>...<branch>` already diffs from the merge-base, so `target` can resolve to that triple-dot range. Where the default branch name and a branch-existence check come from depends on what the workflow runtime can reach. The builder establishes that and says so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 review-round.js throws before any agent() call when `input` (the object form) has a top-level key it does not read, and the error names each unknown key and lists the accepted keys
- [ ] #2 review-round.js accepts `target: "<branch>"` and reviews `<default-branch>...<branch>`, and the resolved range appears in the run's result
- [ ] #3 Passing `target` together with `range`, `base` or `head` throws before any agent() call, naming the conflict
- [ ] #4 A `target` naming a branch that does not exist fails before the review starts with an error naming the branch, and never falls back to HEAD~1...HEAD
- [ ] #5 The string form (`args` as a range string) and the existing keys keep working unchanged
- [ ] #6 workflow-logic.mjs has a test for each criterion above, and `bash claude/evals/lib/check-all.sh` is green
- [ ] #7 spec-to-card.js and deep-research.js are checked for the same silent-ignore pattern: fixed the same way if present, or noted on the card as absent
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-18 04:26
---
A second defect in the same script, and the worse of the two: unknown arguments are silently ignored.

Invoked with { round, target, issue, phase }, the script reads only `range` (line 156: `input.range || (input.base && input.head ? ... : 'HEAD~1...HEAD')`). `target` is not a parameter, so it fell through to the HEAD~1...HEAD default and reviewed the previous commit on main - a docs commit - instead of the branch it was pointed at. The run completed, reported "request changes" with four blocking findings, and named a range in its result that nobody reads as carefully as they read the verdict.

Silently reviewing the wrong thing is worse than failing to start. The agent-name defect at least announced itself in eighteen seconds.

Two fixes worth considering together: reject unknown top-level keys in `input` rather than ignoring them, and accept a branch or worktree name as a target by resolving it to `<merge-base>...<branch>`, since pointing a review at a branch is the common case and `range` makes the caller construct it by hand.

Found the same way as the first defect, on myassist-researcher RZE-289 phase 1.
---

author: @SubagentStop
created: 2026-09-26 14:01
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- /Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/hooks.json:18 matcher: `^(coder-fleet:)?(lead|scout|spec-writer|coder|scripter|reviewer|ui-designer|tech-writer|researcher|fleet-steward|refuter)$` — lists 11 agent names: lead, scout, spec-writer, coder, scripter, reviewer, ui-designer, tech-writer, researcher, fleet-steward, refuter.
---

author: lead
created: 2026-09-29 12:12
---
Triage 2026-09-29 (scout, against main at 458312f).

Defect 1 (bare agent type names) is gone. All three workflows use qualified names: `claude/coder-fleet/workflows/review-round.js:110-113` (`coder-fleet:scout`, `:reviewer`, `:coder`, `:refuter`), `spec-to-card.js:56-58` and `deep-research.js:35-36`. The qualified form came in with 508e4eb (plugin rename to coder-fleet). The hooks.json:18 SubagentStop matcher `^(coder-fleet:)?(...)$` accepts both forms, which answers the description's question about which form the hook receives. `claude/evals/lib/workflow-logic.mjs` asserts the qualified names (e.g. lines 292, 399, 1287). The script now lives only under `workflows/`; `skills/review-round/` no longer ships it.

Defect 2 (unknown input keys silently ignored) is still live. `review-round.js:205-206` reads `input.range`, or `base`+`head`, and otherwise defaults to `HEAD~1...HEAD`. It also reads `issue`, `maxRounds`, `fix`, `refute` and `round`. It has no unknown-key check and no `target` or branch resolution, and no test covers either. A caller passing `target` still gets the previous commit on main reviewed without any error.

Not re-verified: a live run showing the runtime still resolves `coder-fleet:`-qualified names. The tests show the expectation only.
---

author: lead
created: 2026-09-29 12:14
---
Decisions from the human, 2026-09-29 session: reshape CF-3 around the live input-handling defect (option: reject unknown keys and accept `target`), and build it now. Defaults the lead set for the builder, which the human can overrule: `target` together with `range`, `base` or `head` is an error, not a precedence rule; a missing branch is a hard error before the review starts; the resolved range is echoed in the result so the caller can see what was reviewed.
---

author: @SubagentStop
created: 2026-09-29 12:25
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Branch `worktree-agent-a93e733198391dfd5` in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a93e733198391dfd5`. `git rev-parse --git-common-dir` showed the main .git, and this is a linked worktree. It was clean at the start.
- One commit, 45b0c89 "Refuse unknown input keys in the workflows and accept a branch as review-round target". It touches `claude/coder-fleet/workflows/review-round.js`, `claude/coder-fleet/workflows/spec-to-card.js`, `claude/coder-fleet/workflows/deep-research.js` and `claude/evals/lib/workflow-logic.mjs`. The brief asked for small steps; I committed the tests and the fix together, so it is one commit.
- Criterion 1: review-round.js throws before any agent() call on any top-level key outside `range, base, head, target, issue, maxRounds, fix, refute, round`. The error names each unknown key and lists the accepted ones. I grepped the file first: every `input.` read is in that list.
- Criterion 2: `target: "<branch>"` reviews `<default>...<branch>`. The result's `range` shows that, `reviewedRange` shows the pinned shas, and there is a new `target` field.
- Criterion 3: `target` together with `range`, `base` or `head` throws before any agent() call, naming the target and the conflicting keys. A `target` that is not a plain branch name (`BRANCH_RE`, no `..`) also throws before anything runs, because the name goes into a lane's git command.
- Criterion 4: a missing branch throws `review-round target "<branch>" does not exist in this checkout ... Nothing was reviewed.` The check runs on the pin lane's result: after that one lane, before every scope, mechanical, verdict, refuter and fix lane. It never falls back to HEAD~1...HEAD. If the lane cannot name a default branch, that also throws, with "Pass a range instead."
- Criterion 5: the string form, `base`+`head`, `range` and the empty default each have a test, and the 316 existing checks stayed green.
- Criterion 7: both other scripts had the same silent-ignore pattern, so I fixed both the same way. spec-to-card.js accepts `issue, stage, brief, context`. deep-research.js accepts `question, q, inCodebase, angles, rounds`.
- Found by the new guard: an existing deep-research test (workflow-logic.mjs line 90) passed `maxRounds: 1`, which the script never read (it reads `rounds`), so the cap was really 2. I changed it to `rounds: 1` and it still passes.
- What the runtime can reach: a workflow script gets only `agent, parallel, pipeline, phase, log, args`, so it cannot run git. Git runs only through agentType-less `gitLane` calls. I extended the existing "pin refs" lane: with a `target` its prompt finds the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD` minus `origin/`, else `main`, else `master`) and reports it in a new schema field `defaultBranch`. `rawRange` became `let` and is rewritten to `<defaultBranch>...<target>` once the lane reports. Early returns before the pin show `(default branch)...<target>` as the range.
- Tests were added first, in two new sections of `claude/evals/lib/workflow-logic.mjs`. With the fix absent, the review-round tests gave "301 passed, 15 failed" and the spec-to-card and deep-research tests gave "318 passed, 6 failed". The "known keys accepted", string-form, `base`+`head` and default-range checks are regression guards and pass on the old code by design. After the fix: "324 passed, 0 failed".
- `bash claude/evals/lib/check-all.sh` (run once, via a wrapper script, output at `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/07cdc965-df32-40e9-b0ea-2517094167aa/scratchpad/check.out`): exit 0. Summary lines: "versions: ok" (0.27.17 in plugin.json and marketplace, no bump), "agent pairs: ok", "Every deterministic check passes."
---

author: lead
created: 2026-09-29 12:25
---
Sub-issue 1 of 1 (single build). Scripter committed 45b0c89 on branch `worktree-agent-a93e733198391dfd5`. It is not on main yet. workflow-logic.mjs: 324 passed, 0 failed; check-all.sh exit 0, per scripter.

Criterion 7: spec-to-card.js (accepts issue, stage, brief, context) and deep-research.js (accepts question, q, inCodebase, angles, rounds) both had the silent-ignore pattern, and both now refuse unknown keys. An existing deep-research test had been passing `maxRounds: 1` to a script that reads `rounds`, so its cap was silently 2. The test now passes `rounds: 1`.

Criterion 4, deviation to be judged in review: a workflow script cannot run git, so a missing `target` branch cannot be caught before every agent() call. It is caught in the 'pin refs' git lane, before any scope, verdict, refuter or fix lane, and there is no fallback to HEAD~1...HEAD. Default-branch discovery (origin/HEAD, then main, then master) has only run against stubs.

Done still needs: review, a refuter run (High item), merge to main, and a version bump.
---

author: @SubagentStop
created: 2026-09-29 12:29
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. I reviewed 45b0c89 against CF-3 criteria #1 to #7 and comments #4 and #5, covering correctness, edge cases, injection, whether the tests can fail, and design fit. The report went back through SubagentHandback; this message re-emits it so the handoff is well formed.
- must fix: claude/coder-fleet/workflows/review-round.js:233 - `{ target: null }` falls through to HEAD~1...HEAD without an error; a present `target` key of any value should count as a target and go to the shape check.
- must fix: claude/evals/lib/workflow-logic.mjs:1115 - `known-keys-not-rejected` matches `/not accepted/`, which the error never contains, so the check cannot fail; match `/does not accept/`.
- low: claude/evals/lib/workflow-logic.mjs:1159 - `missing-target-no-review` passes with the fix reverted; `missing-target-throws` does catch the revert.
- low: claude/evals/lib/workflow-logic.mjs:1151 - `target-reviews-pinned` passes with the fix reverted, because the stub returns the same shas whatever it is asked.
- low: claude/evals/lib/workflow-logic.mjs:1163 - only one bad target shape is tested; add a leading `-`, `a..b` and `a@{1}`.
- low: claude/coder-fleet/workflows/review-round.js:655 - the "could not find the default branch" error has no test.
- low: claude/coder-fleet/workflows/review-round.js:649 - when the pin lane returns nothing, the error says the target does not exist, blaming the branch for a lane failure.
- low: claude/coder-fleet/workflows/review-round.js:647 - the refs the lane reports are not checked against `target` and `defaultBranch`.
- `ACCEPTED_KEYS` is complete in all three scripts. The missing-branch check runs before every review, verdict, refuter and fix lane. The `rawRange` rewrite is safe, and `BRANCH_RE` is tight enough.
---

author: lead
created: 2026-09-29 12:33
---
Review round 1 on 45b0c89. Reviewer verdict: request changes, with 2 must-fix and 6 low findings. Refuter: 8 mutants, 5 killed and 3 survived. Refuter baseline in the worktree: check-all.sh exit 0, 1376 passed and 0 failed; workflow-logic.mjs 324/0.

Must fix: `target: null` falls through to HEAD~1...HEAD without an error, and `known-keys-not-rejected` matches the wrong wording, so it can never fail. The three survivors are all gaps in the target and default-branch shape tests: an empty or malformed defaultBranch, `a..b`, and a leading dash. All of these, plus the lows, went back to scripter as fix round 1 on the same branch.

Follow-ups the reviewer proposed are filed as CF-66, CF-67 and CF-68. They are not ordered.

Done still needs: the fix commit, a verification pass, merge to main, and a version bump.
---

author: @SubagentStop
created: 2026-09-29 12:33
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline (full gate): `bash claude/evals/lib/check-all.sh` in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a93e733198391dfd5`, exit 0, 401 s, 1376 passed and 0 failed across suites, ending "Every deterministic check passes."
- Baseline (narrow suite): `node claude/evals/lib/workflow-logic.mjs`, exit 0, 1 s, 324 passed and 0 failed. It was also 324/0 in the scratch copy before and after the mutants.
- Budget: eight mutants and 20 minutes. All eight were run, using about 8 minutes.
- The mutants ran against a scratch copy at `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/07cdc965-df32-40e9-b0ea-2517094167aa/scratchpad/refuter-1790684735/base` via `mut.py` in the same directory. The committed files were never touched.
- survived: in review-round.js, `if (!def || !BRANCH_RE.test(def) || !SHA_RE.test(reviewBase)) {` -> `if (!SHA_RE.test(reviewBase)) {` - an empty or malformed `defaultBranch` from the pin lane goes into the range (`...feature/b`, `$(touch x)...feature/b`) instead of throwing. Should be caught by a workflow-logic case using `targetPin` with `defaultBranch: ''` or a string that is not a branch name, expecting a throw. None exists.
- survived: in review-round.js, `!BRANCH_RE.test(target) || target.includes('..')` -> `!BRANCH_RE.test(target)` - target `a..b` is accepted and gives `main...a..b`. Should be caught by `target-shape-refused` with a `..` input, but it only tries `x; rm -rf /`.
- survived: in review-round.js, `const BRANCH_RE = /^[A-Za-z0-9._][` -> `/^[A-Za-z0-9._-][` - targets starting with a dash (`--all`, `-foo`, `--git-dir/tmp/x`) are accepted and reach `git rev-parse --verify` in the pin lane prompt. Should be caught by `target-shape-refused` with a leading-dash input.
- killed: C - a missing branch sets `rawRange = 'HEAD~1...HEAD'` instead of throwing. Exit 1, 323/1, `missing-target-throws` failed.
- killed: E - the conflict check disabled (`if (false && clash.length)`). Exit 1, 318/6, all six `target-conflict-*` checks failed.
- killed: F - `rawRange = def + '...' + target` removed. Exit 1, 323/1, `target-resolves-range` failed.
- killed: G - `'round'` dropped from review-round's ACCEPTED_KEYS. Exit 1, crashed with no summary line: an existing test that passes `round` threw uncaught.
- killed: H - spec-to-card's unknown-key guard disabled. Exit 1, 321/3, all three `unknown-key-*:spec-to-card.js` checks failed.
- Each script's ACCEPTED_KEYS matches every `input.*` read in it, with nothing missing and nothing extra (checked by grep over the three scripts).
- On the claims: CF-3 criterion #4 holds. A missing target fails before the review but after one agent call (the pin lane), and the code comment says so.
- low: claude/evals/lib/workflow-logic.mjs, test `known-keys-not-rejected` - it matches `/not accepted/i`, but the error text is "does not accept", so it can never fail. Mutant G was still caught, by an older test.
- Convergence: first round, so there is no earlier round to compare against.
---
<!-- COMMENTS:END -->
