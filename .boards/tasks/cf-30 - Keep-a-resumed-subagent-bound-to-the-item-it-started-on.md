---
id: CF-30
title: Keep a resumed subagent bound to the item it started on
status: Done
assignee: []
created_date: '2026-09-27 03:18'
updated_date: '2026-09-28 09:16'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-subagent-start.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - 'https://github.com/rzem-ai/coder-fleet/issues/10'
  - docs/plans/CF-30.md
  - 'https://github.com/rzem-ai/coder-fleet/pull/18'
priority: Medium
type: bug
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by spec-writer (CF-24/CF-25 drafting). A SendMessage resume re-fires SubagentStart, which rebinds the agent to whatever `.boards/.focus` says at resume time, not the item it was spawned on. On 2026-09-27 a resumed CF-12 spec-writer bound to CF-8 and posted its blocker there (CF-8 comment #8). Today only a lead practice in memory covers it (focus the agent's own item before resuming). Fix in the hook: on SubagentStart for an agent id that already has a binding record, keep the first binding and log the focus mismatch. Note CF-23's clock uses the same keep-the-first rule for its own record.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A second SubagentStart for the same agent id keeps the first item and logs when the focus differs; the record is never rewritten
- [ ] #2 resume-blocker-comments-first failed on the old hook and passes: bind to A, focus B, re-fire start, and the Blocker stop comments on A and moves A
- [ ] #3 resume-moves-blocked-human and live-resume-from-blocked-human pass, proving a resume moves a Blocked-by-human card back to In Progress; a resume on a Done card leaves it there
- [ ] #4 board-conventions, lead.md, the hooks README, limits.md and fleet-design.md state the resume rule, and migration-checklist ran over lead.md
- [ ] #5 check-all.sh passes, run once, and the plugin patch is bumped in the last commit
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 06:59
---
GitHub #10 folded in (2026-09-27). A resume re-fires SubagentStart and board-subagent-start.sh writes the in-progress column on every start, so on main a resume should already move a Blocked-by-human card back. Hypothesis for the plan to prove with a contract case: Fathom's stuck card was CF-42's board.env status mismatch failing every move, not a missing resume event. Plan adds that case alongside the keep-first-binding fix.
---

author: @lead
created: 2026-09-27 07:14
---
Plan docs/plans/CF-30.md approved by the human 2026-09-27, every open question on the recommended answer. Criteria replaced by the plan's Done when (the plan wins). Phase 1 of 3 starting: one coder, on its own branch from origin/main. CF-42 follows after this merges (same files).
---

author: @SubagentStop
created: 2026-09-27 07:34
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-30-resume-binding` was cut from a freshly fetched `origin/main` (32e995e), with its upstream unset, in worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abda209b3f8ea8adf`. `git rev-parse --git-common-dir` confirmed it is a linked worktree.
- 1c483cb "Add the approved CF-30 plan": `docs/plans/CF-30.md` is byte-identical to the main checkout's copy (`cmp` printed IDENTICAL).
- 58c4c5c "Add R17 resume-binding cases to the board hook contract, red": the stub in `claude/evals/lib/board-hook-contract.sh` now takes `STUB_FOCUS` (default BD-1, empty prints nothing) and `STUB_STATUS` on `task view`, and records a comment edit as `comment <id>` with its body in `$STUB_CALLS.body`.
- The same commit adds the `run_stub`, `stub_reset` and `calls_line` helpers, section R17 with eight stub cases, and `live-resume-from-blocked-human` after `live-comment-commits`.
- Baseline before any change: `bash claude/evals/lib/board-hook-contract.sh -v`, exit 0, 74 passed, 0 failed, live pass on bun against the checkout's `src/cli.ts`.
- Red run (same command, hook unchanged): exit 1, 77 passed, 6 failed, every existing case still green.
- Red, `resume-keeps-first-binding`: the second start re-reads the focus and logs "a-r picked up BD-2 (from the focus file)", so it writes `edit BD-2 In Progress`.
- Red, `resume-logs-focus-mismatch`: the old hook has no resume branch, so it never logs "keeping BD-1" or "focus is now BD-2".
- Red, `resume-blocker-comments-first`: the second start rewrote the agent's record to BD-2, so the stop logs "BD-2 -> Blocked by human" and "commented on BD-2".
- Red, `resume-same-focus-no-mismatch`: the log says "picked up BD-1", never "keeping BD-1".
- Red, `resume-unbound-stays-unbound`: the first start writes no record, so the resume binds BD-2 from the focus and moves it.
- Red, `resume-done-left`: there is no status check, so a second `edit BD-1 In Progress` is written over Done.
- #10 result: `resume-moves-blocked-human` was GREEN on the old hook.
- #10 result: `first-start-other-agent-reads-focus` was GREEN on the old hook.
- #10 result: `live-resume-from-blocked-human` was GREEN on the old hook, against the real binary. The item went from Blocked by human to In Progress, and the last commit is "Move BD-1 to In Progress on the board" with trailer `SubagentStart`.
- I took the plan's "Both green, as expected" branch. The hook side of #10 is proven; what is left is CF-42's override or an event that never fired on Fathom.
- 3384db7 "Keep a resumed subagent bound to the item it started on", `claude/coder-fleet/hooks/lib/board.sh`: `state_bind_agent` now creates the record only if it is absent (`set -C` in a subshell), returns 0, 3 or 1, accepts an empty item, and writes `last-item` only when it binds an item. It also adds `state_agent_bound`, `board_item_status` and `board_status_same`.
- 3384db7, `claude/coder-fleet/hooks/board-subagent-start.sh`: a resume branch comes before the rest of the chain, a first start with no item now writes an unbound record, and return code 3 no longer logs "could not write".
- Green run (same contract command): exit 0, 83 passed, 0 failed, live pass on bun.
- `shellcheck -x` on both hook files exited 1, but info-level only: SC2018/SC2019 on the `tr 'A-Z' 'a-z'` idiom the library already uses at line 269, plus SC1091.
- b128951 "State the resume rule in the hooks README, board-conventions, lead.md and the design", `claude/coder-fleet/hooks/README.md`: the resume paragraph in the convention, `SubagentStart` fallback step 0, the note on fallback 5, the state file described as write-once, a corrected clause in item 20's "Resume evidence", and new decision item 21.
- b128951, other files: the plan's sentence in `claude/coder-fleet/skills/board-conventions/SKILL.md`, and the rule plus "spawn a fresh one" in step 6 of `claude/coder-fleet/agents/lead.md`.
- b128951, other files: `docs/limits.md` now describes per-checkout binding for first starts only, `docs/fleet-design.md` gains "except a resumed agent's own first binding", and the contract header names R17.
- `lead.md` length: 48 lines before, 48 after (budget under 60).
- `bash claude/evals/lib/check-all.sh`, run once, output in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf30/check-all.txt`: exit 0, "Every deterministic check passes".
- Check-all section results: board-hook-contract 83/0, scope-hook-contract 376/0, roster 155/0, workflow-logic 115/0, handoff-extractor 132/0, board bun tests 68 pass, glossary up to date, versions 0.27.0.
- The migration-checklist ran over `lead.md`; its findings table is in the prose above this handoff.
---

author: @lead
created: 2026-09-27 07:36
---
Phases 1-3 built on cf-30-resume-binding at b128951 (not pushed, no version bump). R17: 6 cases red on the old hook, 83/0 green after; check-all green. GitHub #10 settled: resume-moves-blocked-human, first-start-other-agent-reads-focus and live-resume-from-blocked-human (real binary) were all green on the old hook, so a resume already moved a Blocked-by-human card; Fathom's symptom is CF-42's override or an event that never fired. Deviation: README decision went in as item 21, not 7, because items 12-20 are cited by number elsewhere. lead.md 48 lines before and after; migration-checklist clean. Reviewer and refuter running in parallel (data-write tier: board state files). Held for the fix round, not filed: live cases for a resume on a Done card and a Blocker after a refocused resume. Filed: CF-46 (OpenCode port check).
---

author: @SubagentStop
created: 2026-09-27 07:39
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. The only must-fix is the missing version bump. The hook change is correct against docs/plans/CF-30.md, and every other finding is a follow-up.
- must fix: claude/coder-fleet/.claude-plugin/plugin.json:5 - the version is still 0.27.0 (also `.claude-plugin/marketplace.json:17`). The plan's Done when requires a patch bump in the last commit, and without it no install sees the change.
- Examined: `git diff origin/main...HEAD` (1c483cb..b128951), the plan, `lib/board.sh`, `board-subagent-start.sh`, `board-subagent-stop.sh:250-295`, `board-task-completed.sh:40-75`, the board binary's `focus`, `task view --json` and status matching, the full R17 and live sections of `board-hook-contract.sh`, the hooks README, and the coder's check-all output. Also recalled the CF-30, CF-26 and CF-25 memories and the lead-practice memories.
- This is round 1, so there is no earlier round to compare against.
---

author: @SubagentStop
created: 2026-09-27 07:45
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline in the unmutated copy: `bash claude/evals/lib/board-hook-contract.sh -v` gave 83 passed, 0 failed, exit 0, about 62s wall-clock. This matches the claim in the brief.
- Budget set before the first mutant: eight mutants, one per priority target (the brief's list, except the return-3-as-0 variant), plus two probes on unmutated code. I ran all eight in parallel, then reran two sequentially.
- killed: M4, the resume branch disabled so the focus wins (`if false && [ -n "$agent_id" ] && state_agent_bound ...`). Exit 1, 78/5, killed by resume-keeps-first-binding, resume-logs-focus-mismatch, resume-same-focus-no-mismatch, resume-unbound-stays-unbound and resume-done-left.
- killed: M5, the Done guard removed (`&& board_status_same "$item_status" "$BOARD_COL_DONE"` changed to `&& false`). Exit 1, 82/1, killed by resume-done-left.
- killed: M7, no unbound record for a first start with no item (`state_bind_agent "$session_id" "$agent_id" "" "$agent_type"` changed to `:`). Exit 1, 82/1, killed by resume-unbound-stays-unbound.
- survived: in `state_bind_agent`, deleted `if [ -e "$file" ]; then umask "$old_umask"; return 3; fi` and the `set -C` - a second start with no agent_id now overwrites the `unknown-agent` record, and the probe shows the Blocker stop then lands on BD-2 instead of BD-1. The race guard has no test at all. This mutant first failed under 8-way parallel load (82/1, on live-start-doing-board), then passed sequentially: exit 0, 83/0.
- survived: in `board_status_same`, dropped `tr 'A-Z' 'a-z'` (case-sensitive compare) - with `BOARD_COL_DONE=done` and a card whose status is `Done`, a resume moves the card to In Progress, where the unmutated code leaves it in Done. Its parallel run failed on live-start-doing-board; the sequential rerun was exit 0, 83/0.
- survived: in `board_status_same`, dropped `tr -d ' '` (spaces now matter) - with `BOARD_COL_DONE="Done "`, a resume reopens a Done card. Exit 0, 83/0.
- survived: in `state_bind_agent`, the already-bound early exit changed from `return 3` to `return 1` - only the log changes, and it says "could not write the state file ... later hooks will not find item BD-2", which is false. Exit 0, 83/0. Low cost.
- Equivalent (not a finding): in `state_bind_agent`, dropped the `[ -n "$3" ]` guard on the `last-item` write. Exit 0, 83/0, but nothing observable changes: the unbound branch only runs after `state_session_page_id` has already failed, which means `last-item` is missing or unusable. Probe P3 confirms it: a second agent with an empty focus got BD-1 from the session's last item and never reached the unbound branch.
- Probe P1, unmutated code: with `BOARD_COL_DONE=Shipped` and the card's status `Done`, a resume moves the card to In Progress. This follows from Shipped being the Done column in that setup, so I don't think it is a bug.
- Probe P2, unmutated code, no agent_id on two starts (focus BD-1, then BD-2): the second start logs "already has a state file; its first binding stands", then still moves BD-2 to In Progress. The record keeps BD-1, so a later Blocker stop with no agent_id goes to BD-1, and BD-2 stays In Progress with nothing coming to close it. That comes from the design, not the tests: a reviewer-kind finding.
- Convergence: this is the first round, so there is nothing to compare against.
---

author: @SubagentStop
created: 2026-09-27 08:03
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- e47f6f7 "Add fix-round-1 R17 cases: write-once, no agent id, Done spelling, failed focus, dry run, two live resumes", in `claude/evals/lib/board-hook-contract.sh`: a new stub switch `STUB_FOCUS_FAIL`, eight stub cases and two live cases.
- Red run at e47f6f7 (`board-hook-contract.sh -v`): exit 1, 88 passed, 3 failed. The failures were `start-no-agent-id-records-nothing` (log "no id already has a state file; its first binding stands"), `start-focus-failed-no-record` (the resume logged "it started with no item, so it stays unbound") and `resume-dry-run-skips-done-check` (log "dry run: would move BD-1 to In Progress").
- M1, `set -C` and the already-bound pre-check deleted from `state_bind_agent`: `bind-is-write-once` fails, 87 passed, 4 failed. Reverted with `git checkout`.
- M2, every `return 3` changed to `return 1` in `lib/board.sh`: `bind-is-write-once` fails, 87 passed, 4 failed. Reverted.
- M3a, case folding dropped from `board_status_same`: `resume-done-left-lowercase-config` fails, 87 passed, 4 failed. Reverted.
- M3b, space stripping dropped from `board_status_same`: `resume-done-left-spaced-config` fails, 87 passed, 4 failed. Reverted.
- M4, the Done guard in the start hook changed to `&& false`: `live-resume-done-left` fails, along with `resume-done-left` and both Done-spelling cases, 84 passed, 7 failed. Reverted.
- M5, the start hook and `lib/board.sh` put back from `origin/main`: `live-resume-blocker-first-item` fails, and so do all 14 R17 stub and live-resume cases, 77 passed, 14 failed. HEAD's files restored with `git checkout HEAD --`.
- Every mutation run's other failures were the 3 cases already red at that commit. No case outside R17 failed under any mutation.
- 7f80a92 "Write no agent record for a start with no agent_id" (`board-subagent-start.sh`): no `unknown-agent` record, and the log says so. Contract 89 passed, 2 failed after it.
- 5198c5a "Write an unbound record only on a focus read that succeeded empty": in `lib/board.sh`, `board_focus_id` now returns 1 when nothing is focused and 2 when the read failed, timed out or the board is off. In the start hook, a 2 writes no record and logs "could not read the focus". Contract 90 passed, 1 failed after it.
- 71fb6f2 "Say a dry-run resume skipped the Done check instead of claiming a move": when the board will not be called, the resume logs "the Done check was skipped" and exits. Contract 91 passed, 0 failed after it.
- c9d15b4 "Document the fix-round-1 binding rules in the hooks README": fallback 5, a note on starts with no agent id, and item 21, including the full R17 case list. No dashes in the diff.
- Final contract run: `bash claude/evals/lib/board-hook-contract.sh -v`, exit 0, 91 passed, 0 failed, live pass on bun.
- `bash claude/evals/lib/check-all.sh`, run once, output in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf30/r1-check-all.txt`: exit 0, "Every deterministic check passes". Results: board-hook-contract 91/0, scope-hook-contract 376/0, roster 155/0, workflow-logic 115/0, handoff-extractor 132/0, board bun 68 pass, versions ok.
- The worktree is clean on `cf-30-resume-binding`. No amend, no version bump, nothing pushed, and the scope hook refused no command this round.
---

author: @lead
created: 2026-09-27 08:08
---
Fix round 1 at c9d15b4: write-once pinned (bind-is-write-once), no record for a start with no agent_id, Done compared ignoring case and spaces (two new cases), unbound record only on a successful empty focus read (board_focus_id returns 1 empty / 2 failed; its only callers are in the start hook, checked by the lead), dry-run resume says the Done check was skipped, and the two live resume cases. Every refuter survivor killed against its mutation. Contract 91/91; check-all green, run by the lead. Draft PR open (carries Closes #10). Done still needs: the plugin bump last when it is next to merge, the human's merge, the tag, ticking criteria; then CF-42 can start.
---

author: @lead
created: 2026-09-27 09:30
---
Release prep 2026-09-27: origin/main (v0.27.1) merged into cf-30-resume-binding cleanly (8171236), then v0.27.2 as the last commit (1823bdd, plugin.json and marketplace.json). check-all green at 1823bdd, run by the lead; versions agree. Pushed and PR #18 marked ready, first in the merge queue because CF-42 waits on it. After the human merges: tag v0.27.2, tick criteria, remove the worktree, then start CF-42.
---
<!-- COMMENTS:END -->
