---
id: CF-211
title: >-
  A Stop hook that reads the board and sends the lead back once when it stops
  with its focused card unfinished and nothing waiting on the human
status: To Do
assignee: []
created_date: '2026-11-14 02:59'
labels: []
dependencies: []
type: feature
ordinal: 339000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Asked by the human in the session on 2026-11-14, the second half of his pick "Goal lines + Stop hook" in answer to "how do we hook into [the goal command] to make sure the agents stay on target". The goal lines are the card filed beside this one.

Why a hook as well as `/goal`. A goal's judge is a small model that reads only the conversation, and it runs only when the human typed a goal. A `Stop` hook the fleet ships runs on every stop of the main session, with or without a goal, and can read real state: the checkout's focus, the focused card's criteria and its Actions for Human.

What exists today. The plugin registers no `Stop` hook: `claude/coder-fleet/hooks/hooks.json` has PostToolUse, PreToolUse, SessionEnd, SessionStart, SubagentStart, SubagentStop and TaskCompleted. CF-207.9 (Done, for the new board) added context hooks that remind the lead to reconcile the board before stopping.

The decision this card has to live with. CF-207 criterion 65 and its clarification C22 settled that the stop reminder "only adds context and never blocks a stop, so an unattended `/drain` under `/goal` stops normally", because a blocking hook fires on every stop, including every turn of a drain. This card asks for a hook that does send the lead back, so it must be narrow enough not to undo that: once per stop, only on a named condition, and never in a loop. Whether it extends CF-207.9's hook or sits beside it is for the build to settle with whoever owns CF-207; there should be one piece of code deciding what happens at a stop, not two that disagree.

What the docs give a Stop hook (code.claude.com/docs/en/hooks.md, read 2026-11-14). Input carries `stop_hook_active`, true when Claude Code is already continuing because of a stop hook, plus `last_assistant_message`, `background_tasks` and `session_crons`; it carries no goal field, so the hook cannot know whether a goal is set. Returning `decision: \"block\"` with a `reason` continues the session, and `additionalContext` does too, both under an eight-consecutive-continuation cap. Not documented: the order a goal's judge and a separate Stop hook run in, and whether a goal-driven continuation sets `stop_hook_active`. The build finds out both by trying, and records what it found in `docs/limits.md`.

Subagents are out of scope: this is the main session's stop. A subagent's stop is already gated by the handoff check on `SubagentStop`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the main session stops with the checkout focused on a card that has an unticked acceptance criterion, no unticked Actions for Human entry, no question put to the human in that turn and no background task running, the hook sends the lead back once, with a reason naming the card and the criteria still open.
- [ ] #2 The hook never sends the lead back twice for the same stop: when `stop_hook_active` is true it lets the stop through, and a contract test proves a session cannot be held open by it for more than one extra turn per stop.
- [ ] #3 The hook lets the stop through, adding nothing, in each of these cases, each with a contract case: no focus; the focused card is fully ticked; the card has an unticked Actions for Human entry; the card is Blocked or Blocked by human; the lead's last message asked the human a question; a subagent or background command is still running.
- [ ] #4 A `/drain` run under `/goal`, as `commands/drain.md` describes it, still ends when its condition is met: the hook does not hold it open after the last card is accounted for, shown by a test or a recorded run.
- [ ] #5 There is one decision at a stop: this hook and CF-207.9's reconcile reminder are one hook or share one reader of the card's state, and they cannot give the lead contradictory instructions in the same stop.
- [ ] #6 The hook reads the focus and the card through the board's own reader, changes nothing on the board, moves no column, and on any error reading either it lets the stop through and logs why.
- [ ] #7 It can be switched off for a project without editing the plugin, the switch is documented, and `/coder-fleet:init` does not switch it on for a project without saying so.
- [ ] #8 `docs/limits.md` records what the build found about the two undocumented points - the order a goal's judge and this hook run in, and whether a goal-driven continuation sets `stop_hook_active` - and `hooks/README.md` describes the hook.
- [ ] #9 A contract suite for the hook is in `check-all.sh`, and `suite-coverage.sh` passes.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->
