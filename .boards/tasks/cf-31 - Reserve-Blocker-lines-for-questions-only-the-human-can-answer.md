---
id: CF-31
title: Reserve Blocker lines for questions only the human can answer
status: In Progress
assignee: []
created_date: '2026-09-27 03:22'
updated_date: '2026-09-27 05:11'
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

author: @SubagentStop
created: 2026-09-27 04:38
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups; no must-fix defect found.
- Read the diff `origin/main...cf-31-blocker-questions` (d43dfc4, 0a4f9c0, 807fbe6, 492777a) against `docs/plans/CF-31.md` and its Status line.
- Traced `survivorsOf`, `refutationStop`, the refutation stage (:857-893), the result assembly (:1175-1213) and the fix-prompt Blockers (:1095, :1098) in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-ad115e3a1698ad2d3/claude/coder-fleet/workflows/review-round.js`.
- Confirmed the precedence order is blocker > refuted > clean, the reviewer `blocking` path is unchanged, and a 0.25.x refuter's survivors-as-Blocker lines fail closed.
- Confirmed the handoff format did not change: `RE_TYPED` in the hook and `handoff-check.sh` accept `- must fix:` and `- survived:` Done bullets and reject `- survived:` under Decisions needed; the three new fixtures agree across validators in the check-all output.
- Grepped `claude/`, `docs/`, README and AGENTS.md: no remaining instruction raises a finding as a Blocker.
- Read the coder's check-all output at `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf-31/check-all.txt`: every step green, workflow-logic 123 passed, "Every deterministic check passes."
- Checked memory: CF-31's decisions and the 20-minute refuter rule are recorded; nothing here reopens them.
---

author: @SubagentStop
created: 2026-09-27 05:02
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a59f326e9d2cbd346` is linked (common dir is the main `.git`) and was clean; `cf-31-fix-1` was created there at `492777a`, the tip of `cf-31-blocker-questions`.
- `affd7de` (items 2, 4, 5): in `review-round.js`, `survivorsOf` uses `SURVIVOR_KEY`, matching `survived:`, `Survivors:`, `Surviving mutations:` and `Mutation 3 survived:` at the start of a Done bullet, with markup allowed.
- `affd7de`: `survivorsOf` strips markup, then tests `NOTHING_SURVIVED` (none, nothing or 0, alone or followed by punctuation or ` - ` and a reason).
- `affd7de`: `refuted` is set from carried survivors, `((last.refutation || {}).survivors || []).length > 0`, not from the stop reason.
- `affd7de`: the refuter-blocker case in `claude/evals/lib/workflow-logic.mjs` now asks a plan-versus-spec question.
- Red run of `node .../workflow-logic.mjs`: exit 1, 127 passed, 7 failed.
- The seven red-first cases: `survivor-key-survivors`, `survivor-key-surviving-mutations`, `survivor-key-mutation-n-survived`, `survived-none-with-a-reason`, `survived-none-in-bold`, `survived-none-with-punctuation`, `refuted-flag-follows-carried-survivors`.
- Four guard cases also passed on the red run, so they are pins, not red-first tests: `survivor-key-in-backticks`, `survived-nothing`, `survived-zero`, `survivor-under-unverified-is-ignored`.
- Green run of the same command: exit 0, 134 passed, 0 failed.
- Reverting `SURVIVOR_KEY` to the old `survived`-only regex fails the three key cases.
- Reverting the none test to `^(none|nothing|0)\.?$` on unstripped text fails the three none cases.
- Reverting `refuted` to `stopped === 'refuted'` fails the refuted-flag case.
- Making `survivorsOf` read Unverified as well fails the Unverified case.
- `d438053` (item 6): `claude/evals/lib/handoff-parity.sh` now `cmp`s the first fenced block after `## A finding is not a blocker` in the skill against `valid-review-finding-not-blocker.txt`.
- Seen failing: changing "config." to "configuration." in the fixture gave exit 1 ("... differ. Keep them identical."). Reverted, it passed with exit 0.
- `88fad89` (item 1): `claude/coder-fleet/skills/handoff/SKILL.md:43` now reads "a failed check in the work you were reviewing". The diff from `492777a` changes only line 43, so the frontmatter is untouched.
- The fixture copies the example block, not line 43, so it needed no change, and the new pin confirms the two still match.
- `95048e7` (item 3): `docs/limits.md:41` now names `survivorsOf`.
- `95048e7`: `docs/limits.md:47` now says the refuter's wording, not coder's, and gives the plan's reason: survivors were already a parsed obligation moved from Decisions needed to Done, riding the keyed Done bullets `fixHints` reads.
- A scan of the five changed files for en and em dashes printed nothing.
- `bash .../claude/evals/lib/check-all.sh`, run once at HEAD `95048e7708d1ac2a05c4fc71d2af5ec67efadc85`: exit 0, "Every deterministic check passes.", every section ok.
- check-all output: `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf-31/check-all-r2.txt`
---

author: @lead
created: 2026-09-27 05:02
---
Phase 1 of 1: fix round 1 done on branch cf-31-fix-1 (95048e7, on top of 492777a), check-all green; not on main. Done still needs: refuter (queued behind CF-23's and CF-12.2's), then PR with a patch bump and release tag. Held for the refuter or a last fix round rather than filed: survivorsOf fails closed on `Surviving mutations: 0 of 12` and `survived: none (all killed)`, and fails open on `Survived mutation 3:` / `3 survived:`; and check-all.sh's header says 28 handoff-parity fixtures where there are 32.
---

author: @SubagentStop
created: 2026-09-27 05:11
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Scratch tree `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/refuter-cf31-r1/base`, copied from `95048e7` with the `ls-files | rsync` command. `cmp` showed all 20 changed files are byte-identical to the worktree. Nothing was written to the worktree or the project.
- Baseline, all green: `node claude/evals/lib/workflow-logic.mjs` gave 134 passed, 0 failed, exit 0. `bash claude/evals/lib/handoff-parity.sh` gave 32 cases, exit 0.
- Budget: 20 minutes, one mutation per brief item. It started 15:06:41 and the last run was at 15:10:06, so the list ran out before the time did.
- How to reproduce: `python3 <scratch>/mut.py <name> <file> <old> <new>` copies `base` to `m-<name>`, makes one exact replacement, runs both suites and records both exit codes. A mutation only survives if both exit with 0.
- killed: m01, swapping the two `if` lines in `refutationStop`. `refuter-blocker-outranks-survivors` failed (wl exit 1).
- killed: m02, `for (const item of said.done || [])` changed to `[...(said.done || []), ...(said.unverified || [])]`. `survivor-under-unverified-is-ignored` failed.
- killed: m04, `(?:none|nothing|0)` changed to `(?:none)`. `survived-nothing` and `survived-zero` failed.
- killed: m06, `refuted:` put back to `stopped === 'refuted'`. `refuted-flag-follows-carried-survivors` failed.
- killed: m07, the `'refuter raised a blocker'` entry removed from NEXT_STEP. `refuter-blocker-has-a-next-step` failed.
- killed: m08, the refuter prompt asking for `"- Blocker: "` lines again. `refuter-prompt-asks-for-survived-bullets` failed.
- killed: m09a and m09b, `as a question ending in "?", ` removed from the first fix-prompt Blocker line, then from the second. `fix-prompt-blockers-are-questions` failed each time.
- killed: m10, `const blocking = []`, which ignores the findings (79 passed, 55 failed). Also m10b, which replaces the `commissionFixes` call with `null` (81 passed, 53 failed).
- survived: `const NOTHING_SURVIVED = /^(?:none|nothing|0)(?:$|[.;,:!]+(?:\s|$)|\s+-\s)/i` changed to `/^(?:none|nothing|0)/i` - with this change, a real survivor whose text starts with one of those words is read as nothing surviving, so the round approves. Examples: `survived: nothing asserts the retry cap; set MAX_RETRIES=0 ...`, `survived: none of the TTL tests notice ...` and `survived: 0-length token accepted ...`. The unmodified code reads all three correctly, but no test covers a survivor starting with one of those words. Both suites exited 0.
- survived: `text.replace(/[`*_]/g, '')` changed to `text.replace(/[*_]/g, '')` in `survivorsOf` - `survived: \`none\`` is then read as a survivor, so the round stops as refuted instead of clean. That fails safe, but it is still a behaviour change. Tests cover backticks around the key, not around the value. Both suites exited 0.
- survived: `if [ -s "$TMP/example.txt" ] && cmp -s "$TMP/example.txt" "$EXAMPLE_FIXTURE"; then` changed to `if true; then` in `handoff-parity.sh` - nothing tests the checker itself. The check does work: I added one bullet to the fixture copy and the unmodified script exited 1, while the mutated one exited 0. This is the usual limit of a check that compares two files, so it needs no fix round.
- survived: `if [ -s "$TMP/example.txt" ] && cmp -s` changed to `if cmp -s` - this only matters when both the extracted example and the fixture are empty, so it is close to equivalent. No fix needed.
- Probes, run end to end through `runWorkflow` in a scratch copy of the tests (`<scratch>/e2e`, exit 0). The next five bullets give each probe's result, worst first.
- probe, fails open: `Survived mutation 3: inverted the guard - no test noticed` gives `clean`, approved true. The survivor is missed.
- probe, fails open: `3 survived: inverted the guard - no test noticed` gives `clean`, approved true. The survivor is missed.
- probe, fails safe: `Surviving mutations: 0 of 12` gives `refuted`, approved false.
- probe, fails safe: `survived: none (all killed)` gives `refuted`, approved false.
- probe, correct: `survived: \`none\`` gives `clean` on the unmodified code.
- The two fail-open probes happen because `SURVIVOR_KEY` only allows `mutation #?N` in front of the keyword. A number or a phrase after it isn't recognised.
- No new result repeats an earlier one; this was round 1 against CF-31.
---
<!-- COMMENTS:END -->
