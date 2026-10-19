---
id: CF-48
title: Stop an unfocused spawn binding to the session's last item
status: Done
assignee: []
created_date: '2026-09-27 07:39'
updated_date: '2026-09-30 08:22'
labels: []
dependencies:
  - CF-30
references:
  - claude/coder-fleet/hooks/board-subagent-start.sh
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/agents/lead.md
priority: Medium
type: bug
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-30 reviewer, 2026-09-27 (pre-existing since the import, c094a3d). board-subagent-start.sh:86-88 binds a first start to sessions/<sid>/last-item whenever the focus is empty. So once a session has bound anything, clearing the focus does not stop a scout or any unrelated spawn binding to that item: its SubagentStop comments land on it and a Blocker moves it. This contradicts board-conventions ("an unfocused checkout moves nothing"), lead.md step 6 ("clear the focus before work that is not the item's") and the lead's own practice. With CF-30 the binding is also kept across the spawn's resumes, and CF-30's unbound record (its design decision 3) is only reached in a session that has never bound anything.

Decide: drop the last-item fallback for SubagentStart (TaskCompleted no longer reads it, per the reviewer), or keep it and say plainly in board-conventions and lead.md that clearing the focus is not enough. A contract case either way: bind BD-1, clear the focus, start a new agent, and assert what happens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SubagentStart (claude/coder-fleet/hooks/board-subagent-start.sh) has no session last-item fallback: with no resume record, no Board-Item line, no focus and no CODER_FLEET_BOARD_PAGE_ID, a new agent binds nothing and moves nothing. Contract case in claude/evals/lib/board-hook-contract.sh: bind BD-1, clear the focus, start a new agent, assert it binds nothing and moves nothing
- [x] #2 SubagentStart never moves the column of a Done item, whatever binds it. Contract case: bind an agent to a Done item and assert its column stays Done
- [x] #3 sessions/<sid>/last-item: every reader is checked, TaskCompleted included. If none is left, the write in hooks/lib/board.sh (~line 189) is removed; if one is left, the handoff names it and the write stays
- [x] #4 SubagentStop's log lines in hooks.log carry the agent id and the item it comments on (or say it bound none); a contract case asserts both appear
- [x] #5 skills/board-conventions/SKILL.md (lines 53 and 59), agents/lead.md step 6 and hooks/README.md describe the new binding exactly; the phrase 'clearing the focus is not enough' and its equivalents appear nowhere
- [x] #6 Gates: board-hook-contract.sh passes; the board package tests pass, with no failures beyond the pre-existing set tracked in CF-76; bash claude/evals/lib/check-all.sh passes; migration-checklist run over lead.md, with its result in the handoff
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead (fathom session)
created: 2026-09-30 03:51
---
30 Sep 2026, observed three times in the fathom repo (session fbe8b655): after task_focus clear, two scouts with no Board-Item bound to the session's last item (hooks.log 12017 'picked up FTH-004.1.2 (from the session's last item)'; 12459 'picked up FTH-56 (from the session's last item)') and their SubagentStop comments landed on those cards. Worse than this card says: the SubagentStart move also reopens a Done card - FTH-56, merged and closed at 03:33 UTC, was moved to In Progress by the 03:47 scout's start and had to be closed again through a [board:FTH-56] task. So the fallback can undo a finished item's column, not only misfile a comment. Alex (30 Sep) asked for this to be recorded here and the workflow-lane case filed separately.
---

created: 2026-09-30 03:56
---
The human ordered this on 2026-09-30, with these decisions: drop the last-item step from SubagentStart, so an unfocused checkout binds nothing, as board-conventions line 59 already promises. Keep last-item only if something else still reads it: check TaskCompleted, and remove the write in board.sh:189 if nothing does. Separately, SubagentStart must never move a Done item's column, whatever binds it. The fallback chain to keep, in order: resume record (~line 56), Board-Item line (104-115), focus file (119), CODER_FLEET_BOARD_PAGE_ID (125-127). The session last-item step (122) goes. `task_focus clear` (board/src/core/focus.ts:33-35) deletes only the focus file. Also, for both CF-48 and CF-80: SubagentStop logs the agent id and the item it comments on; docs are updated in board-conventions, lead.md step 6 and hooks/README.md. The work is split one sub-issue per card, with CF-48 first and CF-80 after it (CF-80 depends on CF-48, and both edit board-subagent-start.sh and the same docs). Released together as a patch version once both merge. Sub-issue 1 of 2 starting now.
---

author: @SubagentStop
created: 2026-09-30 03:57
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- Side investigation (not CF-48): the log shows one stop for a51b554e099c0e5ff and no SubagentStart line. I could not determine what spawned it.
- Log path confirmed. `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/lib/board.sh:73` has `BOARD_LOG_FILE="${BOARD_LOG_FILE:-$CODER_FLEET_STATE_DIR/log/hooks.log}"`.
- Q1, the only id lines are in `~/.local/state/coder-fleet/log/hooks.log`. Line 12475 is `2026-09-30T03:49:05Z [SubagentStop] no board item bound to coder-fleet:lead a51b554e099c0e5ff; the column will not change`.
- Q1, line 12476 is `2026-09-30T03:49:05Z [SubagentStop] handoff from coder-fleet:lead is malformed; exit 2 to make it re-emit`.
- Q1, no SubagentStart line exists for this id. A grep for `SubagentStart.*lead` in the log returns 0 hits, so no lead id has a start line.
- Q1, the log records no session id, cwd or parent for it. `board-subagent-stop.sh:249-260` reads `session_id` and `cwd` from the hook input but does not log them, and line 259 reads `agent_type`.
- Q1, neighbouring lines show the fathom checkout was active. Line 12480 has `no usable /Users/alex/Dev/Work/fathom/fathom/.claude/test-status` and `FTH-56 -> Done`. That does not tie the id to a session.
- Q1, no transcript file exists for the id. `find ~/.claude/projects -name "*a51b554e099c0e5ff*"` returns nothing.
- Q1, the id appears inside three session files, each as tool output from grepping the log. None is a spawn.
- Q1, `/Users/alex/.claude/projects/-Users-alex-Dev-Work-fathom-fathom/fbe8b655-0449-4eca-ab32-b5ded91816aa.jsonl:1782` is the fathom session's own grep of hooks.log.
- Q1, the other two files are this repo's session, `00593183-3e22-416e-a69e-a08b7ca61b43.jsonl`, and its subagent file `subagents/agent-a8599d9309885d195.jsonl`.
- Q2, many other lead stops sit around it, none with a start line. Examples are lines 12462 (a33ba82353ba56b1c), 12466 (a80e037418896f616), 12468 (a1441a0774153b773), 12470 (a8d3e421aada2aa3b), 12472 (a4f47f04b9ace48e2), 12481 (a81ba6e8d92225a3d), 12491, 12497, 12499, 12504, 12510 and 12512.
- Q2, lead stops are not new today. The first in the log is `9:2026-09-26T14:13:37Z ... coder-fleet:lead a2e13bd914dc4ab7d`. The log has 3496 "malformed" lines and 3589 `coder-fleet:lead a` lines in total.
- Q2, workflow agent() calls with no `agentType` include `spec-to-card.js` at about 379 and about 464, and `review-round.js` at `:559` and about `:437`. The stop hook logs a typeless subagent as "an untyped subagent" (`board-subagent-stop.sh:283-284`), not as `coder-fleet:lead`. A comment at `spec-to-card.js:375` says "No agentType ... The SubagentStop matcher skips an agentType-less lane".
- Q2, no workflow names lead. The `agentType` values in `deep-research.js`, `spec-to-card.js` and `review-round.js:918` are RESEARCHER, SCOUT and SPEC_WRITER. I did not read the constants for the other agent() calls.
- Q2, the repo settings make lead the default agent. `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/settings.json:3` has `"agent": "coder-fleet:lead"`. `~/.claude/settings.json` has no `agent` key.
- Q2, untyped returns are logged near the time. Lines 12487 and 12493 read `AgentReturn ... an untyped agent ... async_launched`. The id cannot be tied to them.
- Q3, there is one stop line for a51b554e099c0e5ff, so the log shows no loop for it. Other lead ids also show one stop each.
- Q3, the hook has no retry cap or counter. A grep of `board-subagent-stop.sh` for `stop_hook_active|retry|attempt|cap` finds no such logic.
- Q3, every malformed handoff reaches `board-subagent-stop.sh:363-364`, which logs `handoff from ${agent_type:-an untyped subagent} is malformed; exit 2 to make it re-emit` and then runs `exit 2`.
---

author: @SubagentStop
created: 2026-09-30 04:12
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commit `e076aa4` "Drop the session last-item fallback and keep Done cards Done on SubagentStart (CF-48)" changes `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4316eb1fb2c45450/claude/coder-fleet/hooks/board-subagent-start.sh`: the last-item step is gone, so the chain is resume record, then Board-Item line, then focus, then `CODER_FLEET_BOARD_PAGE_ID`. A first start on a Done card records the binding, logs `picked up <id>, which is Done; leaving it there` and moves nothing, and a dry run says the Done check was skipped.
- The same commit removes the `last-item` write and `state_session_page_id` from `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4316eb1fb2c45450/claude/coder-fleet/hooks/lib/board.sh`.
- The same commit changes `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4316eb1fb2c45450/claude/coder-fleet/hooks/board-subagent-stop.sh` so each outcome line (StructuredOutput, recovered text, unreadable transcript, malformed, blockers, Done comment, empty Done) reads `<type> <agent_id> (on <id>)` or `(bound to no item)`.
- Commit `c0dda05` "Describe the focus-only binding and the Done guard in the docs (CF-48)" updates board-conventions lines 53 and 59, `lead.md` step 6 (one clause added) and `hooks/README.md` with the new binding text, adds a "Done stays Done (CF-48)" paragraph, and removes `last-item` from the README's fallback list and state-file table.
- The phrase "clearing the focus is not enough" never existed anywhere. The only equivalents were the claims about the session's last item, all removed from Claude-side docs; the one left is the Codex spec (Propose item below).
- Who reads `last-item` (AC3): I checked every file in `claude/` and `opencode/`, the board TypeScript source included. The only reader was the SubagentStart step being dropped. `board-task-completed.sh` reads only the `[board:]` marker (its lines 55 and 80 mention the old guess in comments only), so the write was removed.
- New contract cases in `claude/evals/lib/board-hook-contract.sh` were each seen failing before the fix: the first run had 7 failed and 148 passed.
- `start-cleared-focus-binds-nothing` and `stop-cleared-focus-comments-nowhere` fail when the `state_session_page_id` fallback step is restored.
- `start-done-focus-stays-done`, `start-done-env-stays-done` and `start-dry-run-skips-done-check` fail when the new `board_status_same ... BOARD_COL_DONE` block in the first-start path is removed, or the dry-run message is reverted.
- `stop-log-names-agent-unbound` and `stop-log-names-agent-and-item` fail when the `$run_who ($run_on)` log text is reverted.
- `bind-is-write-once` now asserts no `last-item` file is written. It failed (154 passed, 1 failed) until the write came out of `board.sh`.
- Gate 1: `bash claude/evals/lib/board-hook-contract.sh > scratchpad/gate-contract.txt` exited 0 with 155 passed, 0 failed, live cases included.
- Gate 2: `bun install --frozen-lockfile`, then `bun test --timeout=10000` in `claude/coder-fleet/board`, exited 1 with 1583 pass and 5 fail, all five the known CF-76 set: McpServer bootstrap, the package bin wrapper, `cli-launcher.test.ts` and `resolveBinary.test.ts` on the missing `resolveBinary.cjs`, and one `actions-for-human-core` failure ("tick-with-leave: the tick lands first...", a name not on CF-76's list). Nothing else failed, and the board package was not touched.
- Gate 3: `bash claude/evals/lib/check-all.sh > scratchpad/gate-checkall.txt` exited 0 with "Every deterministic check passes." (roster-contract 155/0, agent-pairs 71/0, versions 0.28.1 ok).
- migration-checklist over `lead.md` found nothing failing: 48 lines (limit 60), six How you work steps, the four H2s in order, frontmatter parses, skills is a list and all three skills exist, no bare `: ` in values, name matches, model opus, effort high.
- The same checklist run found no en or em dashes and no double-check or think scaffolding; the only US spelling is the `color` frontmatter key, and the new clause describes what the hooks do and tells no agent to write a column.
- Checklist checks 4, 8 and 11 to 13 do not apply to a prose edit (no tools list, no effort change, no SDK code), and check 10 (no stated length) predates this change.
- The version is not bumped, as briefed.
---

author: @SubagentStop
created: 2026-09-30 04:15
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups. I reviewed e076aa4 and c0dda05 against CF-48 criteria 1-6 and the human's decisions in comment #2.
- I checked the binding order and the Done guard on every start path. The resume path's guard is older than this diff and unchanged, and the new first-start guard covers Board-Item, focus and env.
- I audited every reader of `last-item` and `state_session_page_id` across claude/, opencode/ and codex/. None is left. Old `last-item` files on disk are harmless, and test R06 already covers them.
- I read all seven new contract cases and the edited `bind-is-write-once`. Each should fail with the fix reverted. None passes either way.
- low: claude/coder-fleet/skills/board-conventions/SKILL.md:59 - "a Done item stays Done whatever bound it" overclaims; a stop with a Blocker line still moves a Done card (board-subagent-stop.sh:391). Limit the sentence to starts.
- low: claude/coder-fleet/hooks/board-task-completed.sh:55 - stale comments at 55 ("the last-item guess below") and 76-77 ("a session with exactly one item in flight"), neither matching the code.
- low: claude/coder-fleet/hooks/board-subagent-stop.sh:379 - with nothing bound, the log reads "(bound to no item); moving to Blocked by human", which contradicts itself.
---

author: @SubagentStop
created: 2026-09-30 04:29
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline, contract suite: `bash claude/evals/lib/board-hook-contract.sh` in the worktree gave 155 passed, 0 failed, exit 0, 103s.
- Baseline, deterministic suite: `./claude/evals/lib/check-all.sh` exited 0 ("Every deterministic check passes."), 276s. The board-conventions edit made after the coder's last run passes.
- Baseline, board tests: `bun test --timeout=10000` in `claude/coder-fleet/board` exited 1, 124s, 5 fail. Named: `McpServer bootstrap > createMcpServer wires stdio-ready instance`, `package bin wrapper > points to scripts/cli.cjs to own .bin/backlog`, `the lead's clear > lead-clear-archives-with-reason: the clear empties the section and archives with the reason`.
- Method: eight scratch copies under `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790741579/M1..M8`, mutated by `mut.py` in the same directory. Each ran `bash <copy>/claude/evals/lib/board-hook-contract.sh`, in parallel. Output is in `M<n>.out` there. `git status --short` in the worktree was empty afterwards.
- M1 (re-add the session last-item write and fallback): caught, exit 1, 4 failed: `bind-is-write-once`, `start-cleared-focus-binds-nothing`, `stop-cleared-focus-comments-nowhere`, `stop-log-names-agent-unbound`.
- M2 (Done guard off on the focus path): caught, exit 1, `start-done-focus-stays-done`.
- M3 (Done guard off on the env path): caught, exit 1, `start-done-env-stays-done`.
- M5 (resume moves a Done card): caught, exit 1, `resume-done-left`, `resume-done-left-lowercase-config`, `resume-done-left-spaced-config`, `live-resume-done-left`.
- M6 (stop's "succeeded" log line back to the old text): caught, exit 1, `stop-log-names-agent-unbound`, `stop-log-names-agent-and-item`.
- survived: in `claude/coder-fleet/hooks/board-subagent-stop.sh`, adding `elif page_id="$(board_focus_id "$HOOK")" && [ -n "$page_id" ]; then :` after the `state_agent_page_id` branch (exit 0, 155/155) - an agent that started unfocused comments on whatever card the focus names when it stops; `stop-cleared-focus-comments-nowhere` only runs with an empty focus.
- survived: in `board-subagent-start.sh`, changing the first-start Done guard to `if [ "$source_of_id" != "Board-Item: line in the spawn prompt" ] && board_status_same ...` (exit 0, 155/155) - a Done card bound by a `Board-Item:` line in the spawn prompt is moved to In Progress; no test sends `instructions`.
- survived: in `board-subagent-stop.sh`, reverting the blocker log line to `"${count} blocker(s) from ${agent_type:-an untyped subagent};` (exit 0, 155/155) - the blocker line no longer names the agent id or the item; only the "succeeded" line is tested for criterion 4. The same gap applies to the malformed and StructuredOutput lines.
- Budget: 8 of 8 mutants, one round, about 17 minutes of wall-clock. This is the first round on CF-48, so there is nothing to compare convergence against.
---

author: @SubagentStop
created: 2026-09-30 04:39
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commit `fa642bf` "Close the CF-48 survivors and stop an unbound Blocker line claiming a move" changes `claude/evals/lib/board-hook-contract.sh` and `claude/coder-fleet/hooks/board-subagent-stop.sh`.
- M8 is killed by the new case `stop-unbound-ignores-later-focus`: bind BD-1, start a second agent with the focus cleared, focus BD-2, stop that agent, and check it comments on neither card. It failed on `refuter-1790741579/M8` (159 passed, 1 failed, output in `scratchpad/fix1-M8.txt`) and passes on my code.
- M4 is killed by the new case `start-done-board-item-stays-done`: a start whose `instructions` field carries `Board-Item: BD-1` on a Done card makes no edit and logs "BD-1, which is Done". It failed on `refuter-1790741579/M4` (159 passed, 1 failed, `scratchpad/fix1-M4.txt`) and passes on my code.
- M7 is killed by three new cases, `stop-log-blocker-names-agent-and-item`, `stop-log-malformed-names-agent-and-item` and `stop-log-structured-names-agent-unbound`, which check the agent id and the item (or "bound to no item") on the Blocker, malformed and StructuredOutput lines. On `refuter-1790741579/M7` the Blocker case failed (159 passed, 1 failed, `scratchpad/fix1-M7.txt`), and all three pass on my code.
- Finding 6: `board-subagent-stop.sh` now logs "raising them with no card to move to ..." for a Blocker from an unbound agent, and keeps "moving to" when an item is bound. The new case `stop-log-unbound-blocker-claims-no-move` failed against the old line 379, run in the M8 tree, which still has that line (`scratchpad/fix1-oldwording.txt`), and passes on my code.
- Finding 4: commit `573c344` "Limit the board-conventions Done sentence to starts (CF-48)" changes `skills/board-conventions/SKILL.md:59` to "no start moves a Done item, whatever bound it". The Blocker behaviour on a Done card is unchanged and left to CF-83.
- Finding 5: commit `e735ba0` "Correct the stale TaskCompleted binding comments (CF-48)" changes `board-task-completed.sh:55` to "a last-item guess, since removed", and cuts the "session with exactly one item in flight" clause at lines 76-77.
- Gate: `bash claude/evals/lib/board-hook-contract.sh > scratchpad/fix1-gate-contract.txt` exited 0 with 161 passed, 0 failed.
- Gate: `bash claude/evals/lib/check-all.sh > scratchpad/fix1-gate-checkall.txt` exited 0 with "Every deterministic check passes." (board-hook-contract 161/0, roster-contract 155/0, workflow-logic 360/0).
---

created: 2026-09-30 04:39
---
Sub-issue 1 of 2 (CF-48), not on main yet. Branch worktree-agent-a4316eb1fb2c45450. Review round 1: approve with three lows. Refuter round 1: 5 of 8 mutants killed; M8 (a stop falling back to the focus), M4 (the Done guard on the Board-Item path) and M7 (untested stop log lines) survived. Fix round 1 (fa642bf, 573c344, e735ba0) adds six cases and fixes the lows; the coder reports 161/0 and check-all green. Now running: review round 2 and a fresh refuter round 2 on clean copies. Done still needs: both rounds clean, then merge. CF-80 starts after that. Follow-ups filed: CF-81 (lead-typed stops), CF-82 (Codex spec), CF-83 (Blocker on a Done card).
---

author: @SubagentStop
created: 2026-09-30 04:41
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve. Reviewed `git diff c0dda05..HEAD` (fa642bf, 573c344, e735ba0) in /Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a4316eb1fb2c45450, against round 1's three lows and the refuter's M4, M7 and M8 survivors on the CF-48 card.
- All three round-1 lows are closed (SKILL.md:59, board-task-completed.sh:55 and :76-77, board-subagent-stop.sh:379). This round does not repeat round 1's findings.
- The unbound-Blocker branch changes only the log text; `board_write` is called the same way whether or not an item is bound, and with no item it still moves nothing.
- By reading, `stop-unbound-ignores-later-focus` fails under M8's focus fallback and under a revived session-last fallback, and `start-done-board-item-stays-done` fails under M4.
- Checked scope: no start-hook, workflow, docs or `board_write` change, so CF-83 and CF-80 are untouched.
- low: claude/evals/lib/board-hook-contract.sh:910 - the unbound-Blocker case checks only the log text, not RC 0 and no edit or comment
- low: claude/coder-fleet/hooks/board-subagent-stop.sh:382 - "raising them with no card" suggests the hook put the blockers somewhere; it put them nowhere
---

author: @SubagentStop
created: 2026-09-30 04:48
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline in the worktree before any mutation: `bash claude/evals/lib/board-hook-contract.sh` exit 0, 161 passed / 0 failed, 144s. `./claude/evals/lib/check-all.sh` exit 0, "Every deterministic check passes", 285s. Each was run once with output captured.
- Budget: at most eight mutants and 20 minutes. Eight mutants ran in about 9 minutes. Each came from a fresh `rsync --exclude .git` of the clean worktree into its own directory under `scratchpad/refuter-r2-1790743177/`; the old round-1 directory was not used.
- M8, M4, M7a, M7b, M7c and M9 were all killed, each by the case the coder named (see the table above). Every run exited 1 with 160 passed and 1 failed.
- M10 (a resumed agent with no item takes the current focus) was killed by resume-unbound-stays-unbound, exit 1, 160/1.
- low: claude/coder-fleet/hooks/lib/board.sh:702 - deleting the empty-item guard in `board_write` leaves the suite at exit 0, 161/0. An unbound Blocker then makes a `task view ""` call on the board, and no case asserts zero board calls on that path. Against the stub nothing moves, because an empty id is unparseable. The checks in `board-subagent-stop.sh` (the `page_id` binding and the `[ -n "$page_id" ]` branch) still guard the move, so this is defence in depth.
- Convergence: all three round-1 survivors are killed when rebuilt from a clean tree, so the coder's claim holds. The only new finding is the low-ranked backstop guard, so the loop has converged.
- Worktree restored and untouched: `git status --short` is empty at HEAD e735ba0.
---

created: 2026-09-30 05:27
---
A fourth occurrence, in this repo's own session (00593183), 2026-09-30: after CF-73 closed (TaskCompleted 01:29:44Z) and the lead cleared the focus, a scout for an unrelated GitHub alignment pass bound to CF-73 'from the session's last item' (hooks.log 12001). It moved CF-73 from Done to In Progress (12003), then to Blocked by human with an action (12013-12014). The human found it on the board. The Done guard and the dropped fallback in PR #43 each prevent it on their own.
---

created: 2026-09-30 07:53
---
On main via PR #43 (merged 07:45:57Z); release in PR #47 (v0.28.2). Criteria proven: #1 by start-cleared-focus-binds-nothing and stop-unbound-ignores-later-focus; #2 by start-done-focus-stays-done, start-done-env-stays-done and start-done-board-item-stays-done; #3 by `git grep last-item` (the write is gone; bind-is-write-once asserts no last-item file); #4 by stop-log-names-agent-and-item, stop-log-blocker-names-agent-and-item, stop-log-malformed-names-agent-and-item and stop-log-structured-names-agent-unbound; #5 by the doc diff in #43, reviewed twice; #6 by board-hook-contract 176/0 and check-all green on the release tree (main plus CF-80), board suite failures limited to the CF-76 set, and migration-checklist clean (comment #4). Closes when #47 merges.
---
<!-- COMMENTS:END -->
