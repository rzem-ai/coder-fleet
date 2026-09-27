---
id: CF-45
title: Cap a refuter at eight mutants and tier when the lead runs one
status: In Progress
assignee: []
created_date: '2026-09-27 06:59'
updated_date: '2026-09-27 09:39'
labels: []
dependencies:
  - CF-23
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/9'
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/agents/refuter.md
  - docs/plans/CF-23.md
  - docs/plans/CF-45.md
priority: Medium
type: enhancement
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From GitHub issue rzem-ai/coder-fleet#9 (read as data). CF-23 (v0.27.0) landed the time half: a 20-minute round in lead.md step 4 and refuter.md, and agent-clock.sh denying every tool call at 25 minutes. Still open: (1) a mutant cap, at most 8 per round, named in every refuter brief; (2) tiering, so the lead runs a refuter only on phases touching authentication, authorisation, secrets, data writes, or an item marked High. Today lead.md step 4 spawns one whenever a reviewer leaves the phase's gates Unverified, which is almost every review. Tiering changes the escalation policy and needs the human's call on the exact trigger.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 refuter.md, the looping skill, lead.md's brief rule and the review-round refuter prompt all say "at most eight mutants", with the ranking and probe rules in the refuter's body; mutant-cap-one-phrase and refuter-prompt-caps-mutants failed first
- [ ] #2 lead.md step 4 runs a refuter only on authentication, authorisation, secrets, data writes or a High item, or when a reviewer suspects a test would pass with the fix reverted, and names review-round's lanes or else the lead as the gate runner on other phases; still 48 lines, refuter.md:44 unchanged
- [ ] #3 refute: false overrides fix: true, pinned by a case that failed first, and fix-refutes-by-default passes
- [ ] #4 fleet-design.md, limits.md and the refuter and lead rubrics are updated; the migration-checklist table is in the PR; check-all passes, run once
- [ ] #5 The patch bump is the last commit; after merge: tagged and pushed
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-45.md approved by the human 2026-09-27: trigger = the issue's list plus a reviewer's revert doubt; gates on other phases = review-round's lanes, else the lead once in the coder's worktree. Criteria replaced by the plan's Done when, criterion 3 unconditional since tiering was taken. Build waits for PR #6 (CF-31) to merge.
---

author: @SubagentStop
created: 2026-09-27 09:34
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- The worktree's git common dir is the main `.git`; I work in the linked worktree `agent-a8b3ef6fb682b9d34`. I fetched `origin/main` (da81f28, v0.27.1), cut `cf-45-refuter-cap-tiering` from it and unset its upstream. Nothing is pushed and the worktree is clean.
- `eada3b3 Add the approved CF-45 plan`: `docs/plans/CF-45.md`, byte-identical to the main checkout's copy (`cmp` printed nothing and exit was 0).
- `31d7053 Cap a refuter at eight mutants and tier when the lead spawns one` covers Phases 1 and 2 in one commit, because `mutant-cap-one-phrase` pins all four hunks together. The next five items are its files.
- `claude/evals/lib/workflow-logic.mjs`: four cases in their own section, added just before the final summary line, so the CF-44 merge can keep both blocks.
- `claude/coder-fleet/agents/refuter.md:34`: the cap (at most eight mutants, a ceiling), the ranking order, the probe rule, and full-gates baseline versus narrowest-suite mutants. `:44` is unchanged, and the file is 48 lines before and after.
- `claude/coder-fleet/skills/looping/SKILL.md:19`: the cap in the refuter sentence.
- `claude/coder-fleet/agents/lead.md:32`: step 4 rewritten in place. The refuter runs on authentication, authorisation, secrets, data writes (with examples), a High item, or when a reviewer suspects a test would pass with the fix reverted. On other phases `review-round`'s lanes run the gates (with `refute: false` passed under `fix: true`), or the lead runs them once in the coder's worktree. Refuter briefs say 20 minutes and at most eight mutants. The file is 48 lines before and after.
- `claude/coder-fleet/workflows/review-round.js`: one new line in the refuter prompt, and `:173` (the plan's :169, moved by the longer comment) is now `input.refute === true || (autoFix && input.refute !== false)`, with the comment updated.
- Red run: `node claude/evals/lib/workflow-logic.mjs` exited 1, with 179 passed and 3 failed.
- Red detail: `refuter-prompt-caps-mutants` failed because the prompt had neither phrase.
- Red detail: `mutant-cap-one-phrase` failed because none of the three files said it.
- Red detail: `refute-false-overrides-fix` failed because a refuter was spawned (got `[true,"clean"]`) while `refute` still read `autoFix ||`.
- Red detail: `fix-refutes-by-default` passed, as the plan expected.
- Green run: the same command exited 0 with 182 passed and 0 failed.
- I watched the guard fail too: with `:173` changed to `input.refute === true`, the suite exited 1 (136 passed, 46 failed) and `fix-refutes-by-default` was among the failures. Then I restored the file.
- `2375e52 Record the refuter's mutant cap and trigger in the design, limits and rubrics` covers the four files in the next item.
- `docs/fleet-design.md` gets the new trigger at :45 and "at most eight mutants" at :49; `docs/limits.md` gets a "Nothing counts mutants." paragraph under "The refuter's time cap"; `claude/evals/refuter/rubric.md` gets RF-ALLb; `claude/evals/lead/rubric.md` gets LD05e, under prompt 05.
- `bash claude/evals/lib/check-all.sh > <scratchpad>/cf-45/check-all.txt 2>&1` exited 0. I ran it once. Grepping the file gives every sub-suite "0 failed" and "Every deterministic check passes." at line 364.
- The plugin version is not bumped, as briefed.
---

author: @SubagentStop
created: 2026-09-27 09:39
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. One must-fix (finding 1) plus follow-ups.
- must fix: claude/coder-fleet/workflows/review-round.js:781 - with `refute: false`, a tests or types-and-build lane that returned nothing is dropped, and the result gives only finding counts (`:1232`), so the result says `approved: true` and the lead can't tell whether the independent gate run that `lead.md:32` relies on happened.
- Reviewed `git diff origin/main...HEAD` (eada3b3..2375e52) against `docs/plans/CF-45.md` and its Status line: `lead.md:32`, `refuter.md:34` and `:44`, `looping/SKILL.md:19`, `review-round.js:161-173` and `:885`, the four new `workflow-logic.mjs` cases, `fleet-design.md:45,49`, `limits.md:45`, and the lead and refuter rubrics.
- Read the surrounding code: `review-round.js` input parsing, mechanical lanes, clean stop, sensitive re-derivation and result shape; `reviewer.md`; `handoff/SKILL.md`; lead eval prompts and `roster-contract.sh`'s prompt cap.
- Checked memory. No earlier decision settles findings 1-3.
- No run article: the spawn prompt didn't ask for one.
---
<!-- COMMENTS:END -->
