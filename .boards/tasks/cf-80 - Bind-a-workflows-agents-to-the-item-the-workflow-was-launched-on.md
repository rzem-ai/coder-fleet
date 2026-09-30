---
id: CF-80
title: Bind a workflow's agents to the item the workflow was launched on
status: In Progress
assignee: []
created_date: '2026-09-30 03:52'
updated_date: '2026-09-30 04:54'
labels:
  - bug
dependencies:
  - CF-48
priority: Medium
ordinal: 111000
---

## Actions for Human
<!-- ACTIONS:BEGIN -->
- [ ] #1 SubagentStart can't identify a workflow run, only SubagentStop can: should CF-80 resolve a run's item at stop (comments and Blockers land on the launch item; a late lane's start may still move the refocused card), or take another route?
<!-- ACTIONS:END -->

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 30 Sep 2026 in the fathom repo (session fbe8b655). The lead focused FTH-004.1.3 and launched review-round (02:56 UTC); its early lanes bound to FTH-004.1.3 from the focus file (hooks.log 12256-12274). At 03:03 the lead focused FTH-56 for a new coder. The review-round's refuter started only at 03:06:58 and bound to FTH-56 from the focus file (hooks.log 12305, state file agents/aeb7ad765648cbebc page_id=FTH-56), so its handoff was commented on FTH-56 at 03:14 (12333-12334) instead of FTH-004.1.3. SubagentStart (claude/coder-fleet/hooks/board-subagent-start.sh) binds each agent from the focus as it is when that agent starts, and a workflow spawns its agents over minutes, so any refocus while a workflow runs rebinds its later agents. Nothing records which item a workflow run belongs to, and the Board-Item prompt line is not a hook transport. skills/board-conventions/SKILL.md line 53 ('the binding is the checkout's focus') and line 59 (resumes keep their first item) do not cover this. Current workaround in the lead: never refocus while a workflow for another item is running.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent spawned by a workflow run binds to the item the checkout was focused on when the workflow was launched (or to nothing if none), whatever the focus is when that agent starts.
- [ ] #2 A contract case in claude/evals/lib/board-hook-contract.sh: focus BD-1, start a workflow lane, focus BD-2, start a second lane of the same run, and assert both bind BD-1.
- [ ] #3 board-conventions and lead.md say how a workflow's agents are bound, and drop the 'never refocus mid-workflow' caveat once it no longer applies.
- [ ] #4 Before any design, the raw SubagentStart hook input for one workflow lane is captured to a file, and the field that identifies the workflow run (the id hooks.log shows as `workflow-subagent <id>`) is named, quoted, in a card comment
- [ ] #5 The run's item is recorded once, when the run's first agent starts, and every later agent of that run reads it rather than the focus; a run launched with nothing focused binds nothing
- [ ] #6 hooks/README.md states the workflow binding rule; the caveat 'don't refocus mid-workflow' and its equivalents appear nowhere in skills/board-conventions/SKILL.md, agents/lead.md or hooks/README.md
- [ ] #7 Gates: board-hook-contract.sh passes; the board package tests pass, with no failures beyond the pre-existing set tracked in CF-76; bash claude/evals/lib/check-all.sh passes; migration-checklist run over lead.md if it is touched
- [ ] #8 CF-48 and CF-80 ship together as one patch release: version bumped in plugin.json and mirrored in marketplace.json, on a commit whose subject starts with the version
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 03:56
---
The human ordered this on 2026-09-30, together with CF-48. Decision: every agent spawned by one workflow run binds to the item that was focused when the run was launched, or to nothing if nothing was focused. Record the run's item once, when the run's first agent starts, and read it for every later agent of that run. Capture the raw hook input for one lane before designing anything: the scout that found this couldn't see it. This is sub-issue 2 of 2 and starts after CF-48 merges, because both edit board-subagent-start.sh and the same docs.
---

created: 2026-09-30 04:54
---
Raw hook input captured by the lead, 2026-09-30 (AC #4). Three throwaway workflow runs, with temporary capture hooks in .claude/settings.local.json, since removed. Files are in this session's scratchpad under cf80-capture/.

1. SubagentStart input for a workflow lane, verbatim keys: {session_id, transcript_path (the parent session's transcript), cwd, scratchpad_dir, prompt_id, agent_id, agent_type: "workflow-subagent", hook_event_name}. No field names the workflow run. The log's `workflow-subagent <id>` is agent_type plus agent_id.
2. prompt_id is NOT a run id. It is the current turn's id. In run wf_756ba543-f5d, lane 1 started in the launch turn with prompt_id fadc30b7-..., and lane 2 started after a new turn began with prompt_id a3c9a514-..., that new turn's id.
3. The run id appears only at SubagentStop, in agent_transcript_path: ".../subagents/workflows/wf_cd5f3f79-f57/agent-a98bbee1fb9c82c8b.jsonl". A direct spawn's path has no workflows/wf_ segment.
4. It cannot be read at start. The harness creates the lane's transcript and meta file only after the SubagentStart hook exits. A hook that polled for 3 seconds never saw it (wf_c9601469-47f: polls at 015 to 018, file birth 018, after the hook ended). The run directory exists from launch, but it can't be tied to a lane at start.
5. A typed lane (agentType set, like the fathom refuter) reports its fleet agent_type at start, so at start it can't be told from a direct spawn either.

Consequence: the mechanism in comment #1 and AC #2/#5, record the run's item when its first agent starts and read it at every later start, cannot be built at SubagentStart with today's harness. The run can be identified at SubagentStop. Design decision needed from the human before the coder starts.
---
<!-- COMMENTS:END -->
