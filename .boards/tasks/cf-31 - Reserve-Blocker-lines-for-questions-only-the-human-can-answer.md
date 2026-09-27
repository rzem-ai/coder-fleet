---
id: CF-31
title: Reserve Blocker lines for questions only the human can answer
status: In Progress
assignee: []
created_date: '2026-09-27 03:22'
updated_date: '2026-09-27 04:34'
labels: []
dependencies: []
references:
  - claude/coder-fleet/agents/reviewer.md
  - claude/coder-fleet/agents/refuter.md
  - claude/coder-fleet/skills/handoff/SKILL.md
  - claude/coder-fleet/workflows/review-round.js
  - 'https://github.com/rzem-ai/coder-fleet/issues/3'
  - docs/plans/CF-31.md
priority: High
type: bug
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pulled forward from CF-25 by the human, 2026-09-27 (GitHub issue #3 point 1). `reviewer.md:42` says "A defect that must be fixed before merge is a `Blocker:` line" and `refuter.md:48` says a surviving behaviour-changing mutation is a `Blocker:` line, so every request-changes review and every refutation with a survivor moves its item to Blocked by human for work the lead routes itself (CF-8 on 2026-09-27; Fathom FTH-001.12, fathom commit 7475a38). The `review-round` workflow depends on it: its refuter prompt (`review-round.js:836`) asks for survivors as Blocker lines and its result parsing (`:233`, `:851-861`) reads them. Change the reviewer and refuter bodies, the handoff skill (with a worked example of a finding that is not a blocker), and the workflow's prompts and parsing together, so Blocker: means only "the human must answer this before work continues". Takes over CF-23 AC7. CF-25 keeps the Actions for Human section.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The handoff skill states the rule with one worked example of a must-fix review finding that is not a Blocker
- [ ] #2 migration-checklist findings for both bodies in the PR; check-all.sh passes; version bump and release tag
- [ ] #3 reviewer.md and refuter.md say a must-fix finding and a surviving mutant are reported in the findings and as `must fix:` / `survived:` Done bullets, never as Blocker: and never as Propose item:; Blocker: is reserved for a question only the human can answer
- [ ] #4 review-round.js asks for and reads refuter survivors from `survived:` Done bullets, not Blocker: lines, and still stops the round as refuted on them; a refuter Blocker gets its own stop, `refuter raised a blocker`; proven by workflow-logic tests that fail first
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 04:26
---
Plan docs/plans/CF-31.md approved by the human 2026-09-27 after a walkthrough, all ten open questions on the recommended answer. Card brought into line with the plan (the human's rule: the plan wins): AC1 and AC3 replaced - a must-fix finding is never a Propose item, and survivors stop the round as refuted rather than starting a fix round (they never did). One coder phase next.
---

author: @SubagentStop
created: 2026-09-27 04:34
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- d43dfc4 "Add the approved CF-31 plan": `docs/plans/CF-31.md`, byte-identical to the main checkout's copy (`cmp` printed nothing).
- 0a4f9c0 "Read refuter survivors from survived: Done bullets, not Blocker lines": `claude/coder-fleet/workflows/review-round.js` (`survivorsOf`, `refutationStop`, the refuter prompt now asks for `- survived: ` Done bullets, both fix-prompt Blockers asked as questions ending in `?`, NEXT_STEP `refuter raised a blocker`), `claude/evals/lib/workflow-logic.mjs`, three fixtures and three rows in `claude/evals/fixtures/handoff-cases/expected.tsv`.
- Red run, before `review-round.js` changed: `node .../workflow-logic.mjs` exited 1 with 116 passed, 7 failed: a-survivor-is-not-clean (got clean,true), the-survivor-is-carried, survived-key-tolerates-markup, refuter-blocker-is-its-own-stop (got refuted), refuter-blocker-outranks-survivors, refuter-prompt-asks-for-survived-bullets, fix-prompt-blockers-are-questions (got 0).
- Green run: `node .../workflow-logic.mjs -v` exited 0 with 123 passed, 0 failed. The coder-blocker cases, cap-commissions-no-final-fix and the silent, empty and blank refuter cases pass unchanged.
- The three guard cases pass on both sides, so I watched each fail against a mutant, all three at once, then reverted all three: 120 passed, 3 failed, each failure its own guard.
- Guard mutants: survived-none-is-not-a-survivor fails when the `none|nothing|0` filter is dropped from `survivorsOf`.
- Guard mutants: refuter-blocker-has-a-next-step fails when the NEXT_STEP key is renamed, and falls back to the generic next step.
- Guard mutants: reviewer-prompt-names-no-blocker fails when "Raise a Blocker" is added to the verdict prompt.
- Fixture guards: `handoff-parity.sh` 32 cases, hook and gate agree on every one; `handoff-extractor-parity.sh` 144 passed, 0 failed. `valid-review-finding-not-blocker.txt` is byte-identical to the skill's new example (`diff` printed nothing).
- `grep -n Blocker review-round.js`: the only instructions to write one are the refuter "never" line (:865) and the two fix-prompt questions (:1095, :1098). The other hits are the header comment, the `readHandoff` parser and the `refutationStop` comment.
- 807fbe6 "Reserve Blocker lines for questions only the human can answer": `claude/coder-fleet/agents/reviewer.md:42`, `claude/coder-fleet/agents/refuter.md:48`, `lead.md:48`, `fleet-steward.md:46`, `claude/coder-fleet/skills/handoff/SKILL.md` (lines 34, 43 and 57, plus a new section "A finding is not a blocker"), `docs/agent-contract.md:62`, `docs/fleet-design.md:57`, `docs/limits.md:41` and `:47`. Each file stays one line per paragraph.
- Only refuter.md line 48 and lead.md line 48 were edited, so CF-23's lines are untouched.
- `grep -c 'is a \`Blocker:\` line'` on reviewer.md and refuter.md: 1 each before, 0 each after.
- 492777a "Grade Blocker lines as questions in the smoke eval rubrics": `claude/evals/reviewer/rubric.md` (RV02d, new RV04e, ALLd), `claude/evals/refuter/rubric.md` (RF01c, new "All prompts" with RF-ALLa), `claude/evals/fleet-steward/rubric.md` ALLc, `claude/evals/scripter/rubric.md` SC02d. Every Blocker mention in those rubrics now forbids one or limits it to a question.
- `run.sh` makes the judge grade the "All prompts" heading by name, and rubric IDs are free text, so `RF-ALLa` needs no other change.
- check-all, one run on HEAD 492777a with a clean tree: `bash .../claude/evals/lib/check-all.sh > .../scratchpad/cf-31/check-all.txt 2>&1` exited 0.
- check-all per-suite counts: 144/0, 62/0, 327/0, 155/0, 123/0, 5/0, 13/0.
- check-all last line (345): "Every deterministic check passes." No FAIL line, so no rerun was needed.
---
<!-- COMMENTS:END -->
