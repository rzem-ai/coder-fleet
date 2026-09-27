---
id: CF-31
title: Reserve Blocker lines for questions only the human can answer
status: In Progress
assignee: []
created_date: '2026-09-27 03:22'
updated_date: '2026-09-27 05:26'
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

author: @SubagentStop
created: 2026-09-27 05:14
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- `2018d66` "Read Survived mutation N: and N survived: keys, and zero counts as none", in `claude/coder-fleet/workflows/review-round.js` and `claude/evals/lib/workflow-logic.mjs`.
- Item 1: `SURVIVOR_KEY` now accepts a number or a `mutation N` phrase after the keyword, and a number before it.
- Item 4: `NOTHING_SURVIVED` now reads `0 of 12` and `none (all killed)` as nothing surviving, under the limits above.
- Red run on the 95048e7 code with the nine new cases: exit 1, 139 passed, 4 failed.
- The four red cases: `survivor-key-survived-mutation-n`, `survivor-key-n-survived`, `survived-zero-of-n`, `survived-none-with-parenthesised-reason`.
- Green after the fix: `node .../workflow-logic.mjs` exit 0, 143 passed, 0 failed. Every fix-round-1 case stayed green.
- Item 2: the mutant `/^(?:none|nothing|0)/i` failed 4 cases (exit 1, 139 passed): `survivor-text-starting-nothing`, `survivor-text-starting-none`, `survivor-text-starting-0`, `survivor-text-0-then-parenthesis`.
- Item 3: the mutant `replace(/[*_]/g, '')` failed 1 case (exit 1, 142 passed): `survived-none-in-backticks`.
- Both mutants were reverted, which `git diff` confirmed, and the rerun gave 143 passed, 0 failed.
- `bash .../handoff-parity.sh`: exit 0, 32 cases, and the skill example still matches the fixture byte for byte.
- `df83c2c` "Correct the handoff-parity fixture count in check-all.sh" (item 5): the header now says 32 fixtures.
- `bash .../claude/evals/lib/check-all.sh`, run once at HEAD `df83c2c`: exit 0, "Every deterministic check passes.", every section ok.
- check-all output: `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf-31/check-all-r3.txt`
---

author: @SubagentStop
created: 2026-09-27 05:19
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline on the untouched copy at `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/refuter-cf31-r2/base`: `node claude/evals/lib/workflow-logic.mjs` exited 0 with 143 passed, 0 failed, and `bash claude/evals/lib/handoff-parity.sh` exited 0 with 32 cases. Both green, matching the brief. Budget was 20 minutes from 15:15:55; finished at 15:18:17.
- Probes on unmutated code ran through runWorkflow (FIX args, approving reviewer), with a probe loop injected into a copy of the suite at `refuter-cf31-r2/e2e`. That run exited 0 with 143 passed; output is in `refuter-cf31-r2/e2e.out`.
- Fail-open, ranked first: `survived (m4): inverted the guard ...` (and the brief's `- survived (m4): ...` form) stopped `clean` with `approved: true`. The regex allows only `#?\d+` after the keyword, so a parenthesised or alphanumeric id misses the key.
- Fail-open: `Mutation m4 survived: ...`, `m4 survived: ...`, `M4 survived: ...` and `M-4 survived: ...` each stopped `clean` and approved, because only digit ids are allowed before the keyword.
- Fail-open: `Survived (m4): ...` and `Survived [m4]: ...` each stopped `clean` and approved.
- Fail-open: `Mutation 4 (inverted guard) survived: ...` stopped `clean` and approved.
- Fail-open: `survived mutations (2): inverted the guard; deleted the bound` stopped `clean` and approved.
- Fail-open, lowest rank because it is outside the prompted format: `survived - inverted the guard ...`, with a dash instead of a colon, stopped `clean` and approved.
- Fail-open because the "nothing survived" test is too loose: a leading `none`, `nothing` or `0` followed by ` - ` or `(` clears the whole bullet, whatever comes after. The plausible case is `survived: 0 - deleting the guard at src/a.ts:40 went unnoticed`, which stopped `clean` and approved.
- The same looseness, in contrived cases that also stopped `clean` and approved: `survived: none - except inverting the guard at src/a.ts:40, which no test noticed`, `survived: nothing (deleting the guard at src/a.ts:40 was not noticed)` and `survived: none (m4 survived: inverted the guard)`.
- Behaving as intended, stopped `refuted`: `Survived mutation 3: ...`, `3 survived: ...`, `survived: 0 (the default) replaced with 1`, `Survivor: ...`, `Survived: m4 - ...`, `Survived #4: ...`, and a survivor text containing backticked code.
- Behaving as intended, stopped `clean`: `Surviving mutations: 0 of 12`, `survived: none (all killed)`, `survived: none; all 14 killed`, `no survivors`, `Survivors: none`, `survived: None`, `survived: none.` and `Survived mutations: none, all 14 killed`.
- Fail-closed, lower rank: `survived: 0/12`, `survived: n/a`, `survived: - (none)`, `survived: zero` and `survived: 0 of 14 (all killed)` stopped `refuted` with no survivor. The last is inconsistent with `none (all killed)` reading clean.
- Each mutation ran against both suites with `python3 refuter-cf31-r2/mut.py <name> claude/coder-fleet/workflows/review-round.js <old> <new>`, trees at `refuter-cf31-r2/m-<name>`. Every kill below came from workflow-logic exiting 1; handoff-parity exited 0 each time.
- Killed: round 1's m03 (backticks no longer stripped from the text), by `survived-none-in-backticks`.
- Killed: round 1's m05 (NOTHING_SURVIVED relaxed to `/^(?:none|nothing|0)/i`), by the four `survivor-text-starting-*` cases.
- Killed: dropping the `mutation N` allowance after the keyword (`(?:\s*#?\d+)?`), by `survivor-key-survived-mutation-n`.
- Killed: dropping the `mutation\s*#?\d+\s+` prefix, by `survivor-key-mutation-n-survived`.
- Killed: dropping the leading-number allowance, by `survivor-key-n-survived`.
- Killed: dropping the zero-count clause, by `survived-zero-of-n`.
- Killed: dropping the parenthesised-reason clause, by `survived-none-with-parenthesised-reason`.
- Killed: letting a bare 0 take the parenthesis clause, by `survivor-text-0-then-parenthesis`.
- Killed: dropping the `(?:\s+mutations?)?` suffix, by `survivor-key-surviving-mutations` and `survivor-key-survived-mutation-n`.
- survived: `if (!plain || NOTHING_SURVIVED.test(plain))` -> `if (NOTHING_SURVIVED.test(plain))` in `survivorsOf` - an empty `survived:`, `**survived:**` or ``survived: `` `` bullet becomes a survivor (`[""]`), so the round stops refuted, where the base code gives `[]` and clean. Confirmed by `node refuter-cf31-r2/p7.mjs` on both trees; both runs exited 0 and the suites exited 0 and 0. This fails closed, not open.
- Convergence: round 1's survivors are closed, and none of this round's findings repeats round 1's. What is left is phrasing coverage of the key, not the edits already covered.
- No run article was asked for, so none was written.
---

author: @SubagentStop
created: 2026-09-27 05:24
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- `a41dda3` "Make survivorsOf fail closed on any Done bullet that mentions surviving", in `claude/coder-fleet/workflows/review-round.js`, `claude/evals/lib/workflow-logic.mjs` and `docs/limits.md`.
- Rule: strip markup from the Done bullet. If it contains `\bsurviv` (case-insensitive), it is a survivor unless the whole bullet, anchored at both ends, matches `NOTHING_SURVIVED`. Bullets that never mention surviving are ignored.
- The allowlist is an optional key (`survived:`, `survivors:`, `surviving mutations:`, `survived mutations:`) then one of none, nothing, zero, no survivors, 0, 0 of N, 0/N, none of N.
- After that it allows an optional all-killed clause: `(all [N] killed)`, `; all N killed`, `, all N killed` or `- all N killed`, followed only by trailing punctuation.
- Also allowed: the empty key, and the sentence forms none survived, no mutation(s) survived and no survivors, optionally after `ran N mutations,` or `all N mutations (were) killed,`.
- The survivor is recorded as the text after a short key ending in a colon, or as the whole bullet when there is no key.
- The `survivorsOf` comment and `docs/limits.md:47` now describe the fail-closed rule. The limits entry also names the one shape still read as clean: a survivor in prose that never says "survived" or "survivor".
- Red run on the `df83c2c` code with the new cases: exit 1, 153 passed, 17 failed.
- The twelve fail-open cases among the 17: `survivor-key-parenthesised-id`, `survivor-key-bracketed-id`, `survivor-key-mutation-id-survived`, `survivor-key-id-survived`, `survivor-key-dashed-id-survived`, `survivor-key-mutation-with-description`.
- Continued: `survivor-key-survived-mutations-count`, `survivor-key-dash-no-colon`, `survivor-zero-dash-then-survivor`, `survivor-none-dash-except`, `survivor-nothing-parenthesised-survivor`, `survivor-none-parenthesised-survivor`.
- Also red: the fail-safe clean forms `survived-zero-of-n-all-killed`, `survived-zero-slash-n` and `survived-zero-word`, and the recording checks `survivor-text-after-the-key` and `survivor-text-whole-bullet-without-key`.
- These passed on `df83c2c` and are pins: `survivor-n-a`, `survived-none-semicolon-all-killed`, `survived-no-survivors`, `survived-survivors-none`, `survived-none-capitalised`, `survived-none-full-stop`.
- Also pins: `survived-mutations-none-comma-all-killed`, `survived-sentence-none-survived`, `survived-empty-key`, `survivor-under-not-done-is-ignored`.
- Green after the change: `node .../workflow-logic.mjs` exit 0, 170 passed, 0 failed. Every earlier case stayed green.
- Empty-key pin: making the group after `NONE_KEY` mandatory failed only `survived-empty-key` (exit 1, 169 passed). I reverted it, confirmed by grep, and the rerun gave 170 passed, 0 failed.
- `bash .../handoff-parity.sh`: exit 0, 32 cases, the skill example matches the fixture byte for byte, and both validators agree.
- `bash .../claude/evals/lib/check-all.sh`, run once at HEAD `a41dda3dd666ca6ca3caec9f20214891e9fafac4`: exit 0, "Every deterministic check passes.", every section ok.
- check-all output: `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf-31/check-all-r4.txt`
---

author: @SubagentStop
created: 2026-09-27 05:26
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- survived: removing `\b` in `survivorsOf` (`/\bsurviv/i` to `/surviv/i`) - all 170 tests still pass (exit 0), yet `mutation_4_survived: inverted the guard` and `m4survived: ...` go from clean on the base to refuted on the mutant. No test pins the boundary either way, and the mutant is actually the safer reading.
- Mutation killed: dropping `^` from NOTHING_SURVIVED - exit 1, 4 failed (`survivor-text-starting-0`, `survivor-none-dash-except`, `survivor-text-after-the-key`, `survivor-text-whole-bullet-without-key`).
- Mutation killed: dropping `$` from NOTHING_SURVIVED - exit 1, 17 failed (including `a-survivor-is-not-clean`, `survivor-key-survivors`).
- Mutation killed: widening KILLED_CLAUSE to `.*` - exit 1, 8 failed (`survivor-text-starting-nothing`, `-none`, `-0`, `-0-then-parenthesis`, and others).
- Mutation killed: not stripping markup (`const plain = item.trim()`) - exit 1, 2 failed (`survived-none-in-bold`, `survived-none-in-backticks`).
- Mutation killed: reading Not done as well as Done - exit 1, 1 failed (`survivor-under-not-done-is-ignored`).
- Fail-open finding, the likeliest real shape: a Done bullet `- Survived mutations:` with nested `  - m4: inverted the guard at src/a.ts:40 - no test noticed` comes back clean and approved. The nested line is dropped by `handoffSection`, and the bare key is allowlisted.
- Fail-open finding: `- survived:` wrapped onto an indented next line comes back clean and approved (also with CRLF).
- Fail-open finding: a survivor split over two Done bullets, with the stem only in the first (`- survived:` or `- survived: none`, then `- m4 ...`), comes back clean and approved.
- Fail-open finding: a word character before the stem (`mutation_4_survived:`, `m4survived:`) comes back clean and approved.
- Fail-open finding: a zero-width space, soft hyphen, Cyrillic `у`, split HTML (`<b>surv</b>ived`) or stemless wording (`lived`, `NOT killed`, `not noticed`) comes back clean and approved.
- Fail-closed noise: `12 mutations ran; none survived`, `killed all 12; none survived`, `no mutation survived the suite`, `Survived: 0 of 6. All six died.`, and `a kill, not a survival` all come back refuted.
- Baseline: workflow-logic 170/170 exit 0, handoff-parity 32/32 exit 0. Scratch tree at `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/refuter-cf31-r3/`, one copy per mutation (`m_*`), each run's output in `m_*/out.txt`.
---
<!-- COMMENTS:END -->
