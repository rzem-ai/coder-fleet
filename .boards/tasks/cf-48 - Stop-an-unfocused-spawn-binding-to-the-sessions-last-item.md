---
id: CF-48
title: Stop an unfocused spawn binding to the session's last item
status: In Progress
assignee: []
created_date: '2026-09-27 07:39'
updated_date: '2026-09-30 03:57'
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
- [ ] #1 SubagentStart (claude/coder-fleet/hooks/board-subagent-start.sh) has no session last-item fallback: with no resume record, no Board-Item line, no focus and no CODER_FLEET_BOARD_PAGE_ID, a new agent binds nothing and moves nothing. Contract case in claude/evals/lib/board-hook-contract.sh: bind BD-1, clear the focus, start a new agent, assert it binds nothing and moves nothing
- [ ] #2 SubagentStart never moves the column of a Done item, whatever binds it. Contract case: bind an agent to a Done item and assert its column stays Done
- [ ] #3 sessions/<sid>/last-item: every reader is checked, TaskCompleted included. If none is left, the write in hooks/lib/board.sh (~line 189) is removed; if one is left, the handoff names it and the write stays
- [ ] #4 SubagentStop's log lines in hooks.log carry the agent id and the item it comments on (or say it bound none); a contract case asserts both appear
- [ ] #5 skills/board-conventions/SKILL.md (lines 53 and 59), agents/lead.md step 6 and hooks/README.md describe the new binding exactly; the phrase 'clearing the focus is not enough' and its equivalents appear nowhere
- [ ] #6 Gates: board-hook-contract.sh passes; the board package tests pass, with no failures beyond the pre-existing set tracked in CF-76; bash claude/evals/lib/check-all.sh passes; migration-checklist run over lead.md, with its result in the handoff
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
<!-- COMMENTS:END -->
