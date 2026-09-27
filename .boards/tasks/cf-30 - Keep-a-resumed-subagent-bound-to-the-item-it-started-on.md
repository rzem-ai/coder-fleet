---
id: CF-30
title: Keep a resumed subagent bound to the item it started on
status: In Progress
assignee: []
created_date: '2026-09-27 03:18'
updated_date: '2026-09-27 07:39'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/board-subagent-start.sh
  - claude/coder-fleet/hooks/lib/board.sh
  - 'https://github.com/rzem-ai/coder-fleet/issues/10'
  - docs/plans/CF-30.md
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
<!-- COMMENTS:END -->
