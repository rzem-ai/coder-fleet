---
id: CF-8
title: Align the design and board-conventions with the hooks
status: Blocked by human
assignee: []
created_date: '2026-09-26 14:28'
updated_date: '2026-09-27 03:08'
labels:
  - outcome/shipped
dependencies: []
references:
  - docs/fleet-design.md
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/README.md
  - claude/coder-fleet/agents/fleet-steward.md
  - docs/plans/CF-8.md
  - 'https://github.com/rzem-ai/coder-fleet/pull/2'
priority: Medium
type: docs
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Four places where docs/fleet-design.md and the board-conventions skill disagree with the hooks or with each other, found by reading the design on 2026-09-27 and confirmed by a scout pass. Decisions taken with the human in the same session:

1. Blocked via SubagentStop is dead code. `claude/coder-fleet/hooks/board-subagent-stop.sh:280` reads `.status // .completion_reason`, neither of which the shipped SubagentStop schema carries, so the Blocked write at lines 327-341 is unreachable (hooks/README.md:113 says so). The board-conventions skill still describes it as live. Decision: delete the dormant status branch from the hook, and correct the skill, hooks/README.md and design section 7 so only TaskCompleted writes Blocked.
2. Design section 3 is a hand-kept third copy of the glossary table that no check covers; it has already drifted (no Run article row, Project and Eval rows differ). Decision: replace the table with a pointer to the glossary skill.
3. Design section 7's "To do" row says "an agent proposing work" moves it; the skill and lead.md say the lead files proposals and fleet-steward files its own sweep. Decision: make the design match.
4. The steward's "Coder Fleet" project instruction (fleet-steward.md:28, design section 11 line 251) is CF-6; it is folded into this item's plan. Decision: drop the instruction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 board-subagent-stop.sh no longer reads a status field or writes Blocked; the contract tests that referenced that path are updated and bash claude/evals/lib/check-all.sh passes
- [x] #2 Design section 3 points at the glossary skill instead of carrying the table, and section 8's no-third-copy claim is true
- [x] #3 Design section 7's To do row matches board-conventions and lead.md
- [x] #4 fleet-steward.md and design section 11 no longer name a Coder Fleet project; CF-6 closes with this item
- [x] #5 migration-checklist run over fleet-steward.md, and a version bump in plugin.json and marketplace.json
- [x] #6 board-conventions skill, hooks/README.md, hooks.json, design section 7 and docs/limits.md all say Blocked is written by TaskCompleted only - when tests fail or a strict gate has no result
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 01:07
---
Plan docs/plans/CF-8.md approved by the human 2026-09-27: v0.25.1, drop BOARD_RUN_STATUS, section 8 port sentence, both TaskCompleted Blocked cases (AC amended), one fleet-steward smoke eval run to set a first baseline, CF-6 closed by its own marker task.
---

author: @SubagentStop
created: 2026-09-27 01:23
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commits, oldest first: `4f39596` Add the approved plan for CF-8; `8b8b275` SubagentStop reads no status and never writes Blocked; `57bd4fd` Say TaskCompleted is the only writer of Blocked; `a3d42a8` Point design section 3 at the glossary skill and align To do with board-conventions; `4d6031b` fleet-steward files board items without naming a project; `59f84c3` v0.25.1: SubagentStop reads no status, and the design points at the glossary.
- R15 red run (old hook, `bash claude/evals/lib/board-hook-contract.sh -v`, exit 1, "57 passed, 2 failed"): `FAIL stop-status-failure-ignored` with exit=0 and log "coder-fleet:scout finished with status failure"; `FAIL stop-completion-reason-ignored` with exit=0 and log "finished with status cancelled". Restoring the old `board-subagent-stop.sh` makes both fail again.
- The first red run used the old R15 fixture, which had `- none` in lower case. The old case only checked a log line, so it never noticed that the handoff was invalid. I changed it to `- None` so the second case sends a valid handoff, as the plan specifies. Then I put `main`'s hook back and re-proved red with the output above, and restored the new hook.
- R15 green (new hook, `-v`, exit 0, "59 passed, 0 failed"): `ok stop-status-failure-ignored`, `ok stop-completion-reason-ignored`.
- The other Phase 1 checks passed. `handoff-parity.sh` exit 0: 29 cases, and the hook and the eval gate agree. `handoff-extractor-parity.sh` exit 0: 132 passed, so the `extract_section` and `validate_handoff` bodies are byte-identical. The grep for leftover `status_raw`, `completion_reason`, `$status` or the old Blocked column in the hook returned nothing (exit 1).
- The Phase 2 grep has two hits and both are deliberate: `hooks/README.md:190` is the plan's own replacement wording, and `docs/limits.md:7` is the gap entry the plan keeps. `hooks.json` still parses with `jq`.
- Phase 3 checks passed: the section 3 table count (`^| Initiative |`) is 0, `gen-glossary-rule.sh --check` is up to date, `roster-contract.sh` is 155/0 and `instruction-file-contract.sh` is 13/0. Design line 167 and the section 10 line were not touched.
- Phase 4 checks passed: no "Coder Fleet" remains in agents, evals or the design; `fleet-steward.md` is 46 lines; the `board-conventions` diff against `main` touches only line 31. Design line 251 had moved to 225 after Phase 3 deleted the table.
- The migration checklist over `fleet-steward.md` passes 1-8 and 14-19, with 9-13 not applicable; the table is above this handoff.
- Eval (`claude/evals/run.sh fleet-steward`, run once on the Phase 4 commit, results in `claude/evals/results/20260927T011428Z/`, gitignored): rubric 62%, first score recorded, baseline unset, not compared. Rubric per prompt: 5/9, 5/8, 5/8 and 1/1. The deterministic checks passed on all four prompts. The verdict is FAIL because the handoff gate failed on all four: "missing heading(s): ## Done, ## Not done, ## Unverified, ## Decisions needed" and "3 other level-2 heading(s), first at line 3: ## What the diff shows". Each run also hit Bash permission denials inside the eval.
- Suite, the only run: `bash /Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a029aed46e75bdfba/claude/evals/lib/check-all.sh > /var/folders/3b/yg6wtc4j12g53bt8mx90jcrc0000gn/T/cf-8-check-all.txt 2>&1` printed exit 0. Grepping the file finds no `FAILED`, and line 337 reads "Every deterministic check passes." The board step ran in full: 68 pass, 0 fail, no network problem.
- The exact brief command, with `${TMPDIR:-/tmp}` and a relative path, was refused by the worktree guard before anything ran. The run above uses the literal value of `TMPDIR` and an absolute script path, so the suite ran once.
---

author: @SubagentStop
created: 2026-09-27 01:26
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups. No blocking defect. The code change is behaviourally identical on every path the runtime actually takes, and both R15 cases would fail on main.
- Examined `git diff main...cf-8-align-design-hooks` (commits 4f39596..59f84c3) against `docs/plans/CF-8.md` and the root `AGENTS.md`: the hook, the contract and parity tests, the hooks README, `hooks.json`, board-conventions, `fleet-design.md` sections 3, 7, 8 and 11, `limits.md`, the steward body and rubric, both manifests, and the OpenCode divergence register.
- Confirmed no unbound variable is left in `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/board-subagent-stop.sh`, and that `BOARD_RUN_STATUS` has a default in `lib/board.sh:45`.
- Confirmed the fixture's `- None` is required by the case-sensitive `RE_NONE` and the untyped-line rule under Decisions needed.
- Found two stale sentences the plan missed: `skills/handoff/SKILL.md:9` and `hooks/README.md:362`. Confirmed the known one at `hooks/README.md:278`.
---

author: @SubagentStop
created: 2026-09-27 01:48
---
Blocked by human. coder-fleet:refuter raised 3 blocker(s). From "## Decisions needed" in its handoff:

- m1b survives `check-all.sh` (exit 0). Inserting `case "$(printf '%s' "$input" | jq -r '.status // ""')" in failure) board_write "$HOOK" "$page_id" "$BOARD_COL_BLOCKED" "Blocked." ;; esac` before the handoff check makes a `status:"failure"` payload move a bound item to Blocked (dry-run log: `would move BD-1 to Blocked with a comment`). R15 `stop-status-failure-ignored` checks only exit 2 and the absent "finished with status" log. It binds no item and never asserts that no Blocked write happened.
- m2b survives `check-all.sh` (exit 0). The same insert keyed on `.completion_reason` == `cancelled` moves a bound item to Blocked and still logs "succeeded with no blockers". R15 `stop-completion-reason-ignored` cannot see the column.
- m5b survives `check-all.sh` (exit 0). Replacing `board_comment "$HOOK" "$page_id" "$comment"` in the clean-finish branch with `:` drops the `## Done` card comment, and the log still claims `commenting 1 "## Done" item(s)`. Probably a gap from before CF-8 (not run on `main`), but CF-8's header restates the claim.
---

author: @SubagentStop
created: 2026-09-27 01:57
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-8-fix-1` is cut from `cf-8-align-design-hooks` at 59f84c3d1f1b929ca78d95314bbd8a5f8cdac156 (sha verified), in worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-ae0d0c1ec456a924f`. Nothing pushed, `.boards/` and the version untouched.
- 157737d "Bind an item in the R15 cases so a Blocked write is visible" (A), in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-ae0d0c1ec456a924f/claude/evals/lib/board-hook-contract.sh`. `run_hook_bound` sets `CODER_FLEET_BOARD=on BOARD_DRY_RUN=1 CODER_FLEET_BOARD_PAGE_ID=BD-1` as a prefix on the single call, as `start-env-binds` does, so there is nothing to restore. `log_moved_to_blocked` matches `would move BD-1 to Blocked( with a comment)?$`, so a "Blocked by human" line never matches. Case 2 now sends both `status:"failure"` and `completion_reason:"cancelled"`. I kept `! log_has "finished with status"` in both cases because the new assertion does not cover it: a status route could log without writing anything.
- 7448233 "Assert the SubagentStop board calls in dry run, not their log lines" (B and C) adds three cases to the same file: `stop-done-comment-posted` asserts `would comment on BD-1` and no `would move BD-1`; `stop-blocker-moves-to-human` asserts `would move BD-1 to Blocked by human`; `stop-blocker-comments` asserts `... with a comment` and no move to Blocked.
- b6fedf0 "Drop the success-run framing of SubagentStop from the prose" (D) edits `claude/coder-fleet/skills/handoff/SKILL.md:9`, `claude/coder-fleet/hooks/README.md` lines 109, 278 and 362, root `README.md:39`, and rejoins the stub comment at `claude/evals/lib/handoff-parity.sh:9-10`. `git diff -U0 cf-8-align-design-hooks` on the skill shows one hunk, at line 9, so the frontmatter is unchanged.
- The grep for leftover success-run wording found three more, all fixed in b6fedf0: `hooks/README.md:107` (the Done row's "clean success" now reads "valid handoff with no blockers"), `hooks/README.md:304` ("2b. stop, clean success" now reads "2b. stop, valid handoff with no blockers") and `board-hook-contract.sh:212` ("normal success log" now reads "normal no-blocker log"). Left alone on purpose: `docs/plans/CF-8.md` (the plan quoting the old text), `docs/limits.md:33` (not about the status route) and `opencode/docs/findings/...` (not the hook, and under opencode/).
- `opencode/docs/divergence-register.md` row 33 is still accurate. It paraphrases the passage as "the hook refusing to let you stop until the handoff parses", without the "successful run" qualifier.
- Baseline before any change: `bash .../board-hook-contract.sh -v` gave 59 passed, 0 failed.
- Mutants were applied by `scratchpad/mutate.py` from a byte copy of the hook, restored after each run, and checked with `cmp`; `git diff --stat` on `board-subagent-stop.sh` is empty afterwards.
- Mutant m1b, inserted before `# The run: the handoff must parse before anything is trusted from it.`: exit 1, 57 passed and 2 failed (`stop-status-failure-ignored`, `stop-completion-reason-ignored`).
- Mutant m2b, same insertion point: exit 1, 58 passed and 1 failed (`stop-completion-reason-ignored`).
- Mutant m5b, `    board_comment "$HOOK" "$page_id" "$comment"` replaced with `    :`: exit 1, 61 passed and 1 failed (`stop-done-comment-posted`).
- Mutant m3, deleting `  board_write "$HOOK" "$page_id" "$BOARD_COL_BLOCKED_HUMAN" "$comment"`: exit 1, 57 passed and 5 failed (`stop-blocker-moves-to-human`, `stop-blocker-comments`, and the live `live-blocker`, `live-comment`, `live-comment-commits`).
- Mutant m4, the same line with `$BOARD_COL_BLOCKED_HUMAN` changed to `$BOARD_COL_BLOCKED`: exit 1, 59 passed and 3 failed (`stop-blocker-moves-to-human`, `stop-blocker-comments`, live `live-blocker`).
- Mutant m5a, the same line with ` "$comment"` dropped: exit 1, 59 passed and 3 failed (`stop-blocker-comments`, live `live-comment`, `live-comment-commits`).
- Green after restoring the hook: 62 passed, 0 failed.
- E: `board-hook-contract.sh -v` gave 62 passed, 0 failed, and `handoff-parity.sh -v` exited 0 with all 29 cases agreeing.
- E: `bash /Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-ae0d0c1ec456a924f/claude/evals/lib/check-all.sh > /var/folders/3b/yg6wtc4j12g53bt8mx90jcrc0000gn/T/cf-8-fix-1-check-all.txt 2>&1` ran once: exit 0, no FAILED, line 342 reads "Every deterministic check passes."
---

author: @SubagentStop
created: 2026-09-27 02:02
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve, with follow-ups. Examined `git diff cf-8-align-design-hooks..cf-8-fix-1` (157737d, 7448233, b6fedf0) against `board-subagent-stop.sh`, `hooks/lib/board.sh`, `board-task-completed.sh:150-224` and the whole of `board-hook-contract.sh` at `cf-8-fix-1`.
- Round-1 findings 1, 2, 3, 4, 5 and 7 are closed. Finding 6 was left as a note, as agreed.
- The new cases are bound correctly, leak no environment into later cases, and assert on the dry-run line `board.sh` writes at the call. The `with a comment` departure is correct against `board_write`.
- This round's findings are new, not a repeat of round 1's.
---

author: @SubagentStop
created: 2026-09-27 02:11
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline on the scratch copy of main plus the `cf-8-fix-1` diff: `check-all.sh` exit 0; board contract 52/0 without bun and 62/0 with bun.
- Re-applied my round-1 m1b, m2b, m5b, m3, m4 and m5a, plus m5a2 (comment argument dropped). All die in the dry-run cases alone with the live pass skipped, so they would die in CI.
- Attacked the new tests: the Blocked check doesn't match "Blocked by human", assertions sit on the call rather than the log line before it, and a blanked binding (t4) is caught by three sibling cases. t3 dies.
- Convergence: round 1's three survivors are gone and nothing survives from that set. The two t survivors are new and narrower. A round 3 is not warranted.
- Scratch runner and outputs: `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/r2/` (`mut.sh`, `nobun.sh`, `m-<name>.diff`, `m-<name>.bhc-{nobun,live}.out`, `specs/`).
---

author: @SubagentStop
created: 2026-09-27 02:17
---
Blocked by human. coder-fleet:spec-writer raised 1 blocker(s). From "## Decisions needed" in its handoff:

- Q18's strip conflicts with the "no section refuses" edge case, so any second planning run on a stripped spec gets refused (a `spec-to-plan` plan-stage rerun, or a re-plan after the human rejects a plan). Should the gate also pass when the spec's git history holds a "Close the challenges on <issue>" commit (the lean in the spec), or does the human want another tie-break? Criterion 8's fixtures and `lead.md` step 3 can't be finished without it.
---

author: @lead
created: 2026-09-27 02:18
---
Correction: a SubagentStop comment from coder-fleet:spec-writer around 2026-09-27 02:17 UTC, about the CF-12 spec, belongs to CF-12, not CF-8. The agent was resumed while the checkout's focus was CF-8, and a resume re-binds to the current focus. It has no bearing on CF-8.
---

author: @SubagentStop
created: 2026-09-27 02:18
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree confirmed: the top level is `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4fd75fdec9bae35e` and it was clean. It had been cut at 92e68a1, so I verified `cf-8-fix-1` = b6fedf024891d0d4779c208ad24bea6297b8c85c and branched `cf-8-fix-2` from that sha.
- Commit `2450e48` "Make three CF-8 prose claims exactly true" (with the Co-Authored-By trailer). It touches three files, 9 insertions and 5 deletions. `git diff -U0 cf-8-fix-1` shows exactly one hunk per file, and the SKILL.md hunk is at line 9, below the frontmatter.
- 1. `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4fd75fdec9bae35e/claude/coder-fleet/skills/handoff/SKILL.md:9` now reads: "a `SubagentStop` hook checks every typed stop that does not end on a StructuredOutput call, parsing `last_assistant_message` when the stop event carries it and the text your transcript ends in when it does not, and refuses to let you stop until it parses; an empty message fails, and the only other stop it lets through unchecked is one whose transcript it cannot read." Checked against board-subagent-stop.sh:262 (a null or absent field both count as absent), :275-278 (untyped stops skipped), :324-342 (the structured case exits 0, the text case is recovered and validated, an unreadable transcript exits 0) and :345 (an empty message present in the event still fails).
- 2. `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4fd75fdec9bae35e/claude/evals/lib/board-hook-contract.sh:252-258`, comment only: "These dry-run cases prove the calls are made, on every machine. The live cases further down run against the binary and skip on a machine without bun - which includes CI - and they cover the Blocker route only: that the item moves to Blocked by human and that a comment holding the blocker line lands. No live case covers the Done comment, and nothing checks the rest of either comment's text - headline, layout, the Done items; a board item tracks that gap. Each dry-run case asserts the dry-run line board.sh writes at the moment of the call, ..."
- Where item 2 departs from the brief: `live-comment` (lines 555-557) runs `test("which key")` against the comment body, so the blocker text is checked. What goes unchecked is everything else in the comment.
- 3. `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4fd75fdec9bae35e/claude/coder-fleet/hooks/README.md:109`, still one table line. The comment cell now reads: "`Blocked. The test gate failed on "<task title>", so the task could not be marked complete.` for a failed result on a titled task; `Blocked. The test gate failed, so the task could not be marked complete.` for a failed result on a task with no title, and always under a strict gate with no result. The body depends on where the verdict came from: from `CODER_FLEET_TEST_COMMAND`, the command, its exit code and the last 15 lines of its output; from the status file, `<file> reports a failure.` then lines 2 to 16 of that file; from a strict gate with no result, that no result was available and how to supply one". Checked against board-task-completed.sh:127-128, :156, :191-194 and :209-211.
- Command run: `bash .../claude/evals/lib/board-hook-contract.sh -v` exited 0 with "62 passed, 0 failed".
- Command run: `bash .../claude/evals/lib/handoff-parity.sh` exited 0 with "29 cases. The hook and the eval gate agree on every case, and every verdict is the expected one."
- Command run, once: `bash /Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4fd75fdec9bae35e/claude/evals/lib/check-all.sh > /var/folders/3b/yg6wtc4j12g53bt8mx90jcrc0000gn/T/cf-8-fix-2-check-all.txt 2>&1; echo "exit $?"` exited 0. A grep finds no FAILED, and line 342 reads "Every deterministic check passes."
- No tests were added, since all three changes are prose or comments, so there is no fail-first evidence to report.
---

author: @SubagentStop
created: 2026-09-27 02:20
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Reviewed round 3 of CF-8, `git diff cf-8-fix-1..cf-8-fix-2` (2450e48), against `board-subagent-stop.sh` (`:207-230`, `:244-357`), `board-task-completed.sh` (`:98-224`), `hooks/README.md` item 16 (`:419-434`), and the dry-run, transcript and live sections of `board-hook-contract.sh`.
- Verdict: request changes on finding 1 (with finding 2 as the suggested way to fix it). Finding 3 is a one-word fix plus correcting a carried-over condition. Finding 4 is accurate as written.
- Round comparison: the findings are new against the replacement text, not round 2's findings coming back. Round-2 findings 1, 2 and 4 are addressed in substance.
- Checked memory: no prior decision covers the skill wording. One memory confirms the dry-run "with a comment" suffix the contract comment relies on.
---

author: @SubagentStop
created: 2026-09-27 02:25
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a44a4c86cca0a748e`; `cf-8-fix-2` confirmed at 2450e48; branch `cf-8-fix-3` cut from it.
- Commit 26c8a3d "Reduce the handoff skill to the rule and make hooks README item 16 the account" (skill, `claude/coder-fleet/hooks/README.md`, `claude/evals/lib/board-hook-contract.sh`).
- New SKILL.md:9 opening (the Deviate/eval-gate sentences after it are kept from main): "If your spawn gave you an output schema, finish by calling StructuredOutput with it. Otherwise end your final message with a handoff, as text."
- SKILL.md:9 continued: "It is a machine contract, not a style guide: a `SubagentStop` hook checks it and will not let you stop until it parses, and an empty final message fails."
- Dropped from main's line: "on a successful run", false now that the event carries no status field.
- New README row: "| `tool_use` with any other name, or `thinking` | the agent stopped mid-turn, with no closing text to validate | passes unchecked, as intended, and says the transcript could not be read (`stop-transcript-trailing-tool-passes`) |"
- README text after the table: "The last two rows are the residual gap"; `:221-227` last-block-then-classify; `:338-341` shared pass; no contract case feeds a trailing `thinking` block.
- README new paragraph: "This table is the whole account of which typed stops are checked." A present event message is validated as it stands.
- README new paragraph, continued: StructuredOutput exemption only with no event message (`:324`); missing jq exits 0 (`:244-247`, no case); no `agent_type` exits 0 (`:275-278`, `stop-untyped-stands-down`).
- Contract comment, verbatim: "The live SubagentStop cases further down run against the binary and skip where neither bun nor an installed board resolves through the shim, and they cover the Blocker route only:"
- Contract comment, continued: "that the item moves to Blocked by human, that a comment holding the blocker line lands, and that the comment is its own commit."
- Mirrors: no file under claude/evals/ or claude/ quotes the old sentence (handoff-check.sh and handoff-parity.sh mention the field only).
- Mirrors: the opencode handoff skill was rewritten per register row 33 to say nothing validates the handoff, so it is not stale.
- Register row 33 records three enforcement passages rewritten as untrue under OpenCode, and the CI-gate sentence dropped.
- `bash claude/evals/lib/board-hook-contract.sh -v`: exit 0, "62 passed, 0 failed"; live pass ran on bun against the checkout's src/cli.ts.
- `bash claude/evals/lib/handoff-parity.sh`: exit 0, 29 cases, "The hook and the eval gate agree on every case".
- check-all.sh run once to /var/folders/3b/yg6wtc4j12g53bt8mx90jcrc0000gn/T/cf-8-fix-3-check-all.txt: exit 0, no FAILED, line 342 "Every deterministic check passes."
---

author: @SubagentStop
created: 2026-09-27 02:28
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups. Round 4 fixes round-3 findings 1-3; the whole CF-8 branch (`main...cf-8-fix-3`) is ready to merge once the gates pass.
- Checked the new skill opening against `git show main:claude/coder-fleet/skills/handoff/SKILL.md`: true, no exception list, no event field or path, keeps every still-true claim from main.
- Checked README item 16 against `board-subagent-stop.sh` at cf-8-fix-3: all five validation-skipping exit-0 paths for typed stops appear once, and the cited line numbers and contract case names are right.
- Checked the contract comment at `board-hook-contract.sh:252-258` against `:490-580`: accurate except the fallback wording (finding 1).
- Re-read the full-branch prose diff (design, limits, board-conventions, README, hooks.json) for consistency with round 4: no contradictions.
- Round 4's findings are new and minor, not a repeat of round 3.
---

author: @lead
created: 2026-09-27 02:29
---
PR #2 opened 2026-09-27: https://github.com/rzem-ai/coder-fleet/pull/2 (branch cf-8-align-design-hooks = cf-8-fix-3 tip 26c8a3d; 11 CF-8 commits plus board commits). Review converged over four rounds (final: approve with follow-ups, none blocking), refuter converged over two. Waiting on the human's merge; if squash-merged, keep the v0.25.1: subject.
---

author: @lead
created: 2026-09-27 02:36
---
Merged 2026-09-27T02:34Z as a84db3b (PR #2), released as v0.25.1. outcome/shipped. The lead could not close the card through TaskCompleted: this session has no native task tools, so no [board:CF-8] task could be completed. The human moves it to Done, or a later session with task tools completes the marker task.
---

author: @lead
created: 2026-09-27 03:08
---
All six acceptance criteria ticked by the lead after merge: #1 check-all exit 0 on every fix-round tip and independently by the refuter; #2-#4 and #6 confirmed by review rounds 1-4; #5 migration-checklist table in PR #2 and v0.25.1 in both manifests.
---
<!-- COMMENTS:END -->
