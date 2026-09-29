---
id: CF-3
title: review-round silently ignores unknown input keys; accept a branch as target
status: In Progress
assignee: []
created_date: '2026-09-18 04:14'
updated_date: '2026-09-29 12:15'
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
<!-- COMMENTS:END -->
