---
id: CF-80
title: Bind a workflow's agents to the item the workflow was launched on
status: In Progress
assignee: []
created_date: '2026-09-30 03:52'
updated_date: '2026-09-30 06:22'
labels:
  - bug
dependencies:
  - CF-48
priority: Medium
ordinal: 111000
---

## Actions for Human
<!-- ACTIONS:BEGIN -->
- [x] #1 SubagentStart can't identify a workflow run, only SubagentStop can: should CF-80 resolve a run's item at stop (comments and Blockers land on the launch item; a late lane's start may still move the refocused card), or take another route?
<!-- ACTIONS:END -->

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Observed 30 Sep 2026 in the fathom repo (session fbe8b655). The lead focused FTH-004.1.3 and launched review-round (02:56 UTC); its early lanes bound to FTH-004.1.3 from the focus file (hooks.log 12256-12274). At 03:03 the lead focused FTH-56 for a new coder. The review-round's refuter started only at 03:06:58 and bound to FTH-56 from the focus file (hooks.log 12305, state file agents/aeb7ad765648cbebc page_id=FTH-56), so its handoff was commented on FTH-56 at 03:14 (12333-12334) instead of FTH-004.1.3. SubagentStart (claude/coder-fleet/hooks/board-subagent-start.sh) binds each agent from the focus as it is when that agent starts, and a workflow spawns its agents over minutes, so any refocus while a workflow runs rebinds its later agents. Nothing records which item a workflow run belongs to, and the Board-Item prompt line is not a hook transport. skills/board-conventions/SKILL.md line 53 ('the binding is the checkout's focus') and line 59 (resumes keep their first item) do not cover this. Current workaround in the lead: never refocus while a workflow for another item is running.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every comment and Blocker from an agent of one workflow run lands on the run's item: the item the run's earliest-started agent was bound to at its start (the focus at launch in practice), or nowhere if that agent bound nothing, whatever the focus is when a later agent starts or stops. The run is identified at SubagentStop from agent_transcript_path (.../subagents/workflows/wf_<run>/agent-<id>.jsonl), for typed and untyped lanes alike
- [ ] #2 A contract case in claude/evals/lib/board-hook-contract.sh: focus BD-1, start lane 1 of run wf_X, focus BD-2, start lane 2 of the same run, stop both, and assert both comment on BD-1 and never on BD-2. A second case: a run whose first lane started with nothing focused comments nowhere
- [ ] #3 board-conventions and lead.md say how a workflow's agents are bound, including that a late lane's start may still move the newly focused card, and drop the 'never refocus mid-workflow' caveat
- [ ] #4 Before any design, the raw SubagentStart hook input for one workflow lane is captured to a file, and the field that identifies the workflow run is named, quoted, in a card comment (done by the lead: comment #2, no such field at start; the run id is in SubagentStop's agent_transcript_path)
- [ ] #5 The run's item is recorded once per run, by the first stop of that run to resolve it, and every later stop of that run reads the record rather than recomputing or reading the focus. A direct spawn (no workflows/wf_ segment in its path) keeps its own binding unchanged
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

created: 2026-09-30 05:17
---
Action #1 answered by the human in session, 2026-09-30: resolve at stop. At a lane's SubagentStop the hook identifies the run from agent_transcript_path. It records the run's item once, taken from the start binding of the run's earliest-started agent. Every comment and Blocker of that run goes on that item. Accepted limitation: a lane that starts after a refocus still binds provisionally at start and may move the newly focused card to In Progress. The human rejected skipping the start move for untyped lanes, and rejected parking CF-80. ACs #1, #2 and #5 are rewritten to match; #4 is done (comment #2).
---

author: @SubagentStop
created: 2026-09-30 05:38
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree check: `git rev-parse --git-common-dir` pointed at the shared `.git` and the toplevel was `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abbcae358ccd12af8`, so this is a linked worktree and it was clean before I started.
- Commit `7b3c4ab` "CF-80: bind a workflow run's stops to the item its first lane started on" changes `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abbcae358ccd12af8/claude/coder-fleet/hooks/board-subagent-stop.sh`, `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abbcae358ccd12af8/claude/coder-fleet/hooks/lib/board.sh` and `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abbcae358ccd12af8/claude/evals/lib/board-hook-contract.sh`.
- How it works: the stop hook reads `wf_<run>` from `agent_transcript_path`. If `sessions/<sid>/runs/<run>` exists, it uses that item.
- If there is no run record, it lists `agent-*.jsonl` in the run directory, adds the stopping agent, and takes the item of whichever start record has the oldest modification time. It writes the run record once, via a temp file and a hard link, so two stops racing cannot both write it and neither can read a half-written one.
- Direct spawns go through the old lookup unchanged. Stop log lines now read "`<type> <id> of run <run>` (on X / bound to no item)" for workflow lanes. The start hook is unchanged.
- New helpers in `board.sh`: `run_id_from_transcript`, `state_run_page_id`, `state_record_run`, `state_earliest_started`, `run_lane_ids`.
- Tests written first: 7 red and `wf-direct-spawn-unchanged` green before the fix (162 passed, 7 failed); 169 passed, 0 failed after.
- Test `wf-late-lane-comments-on-launch-item` (brief test 1) fails if the stop uses the lane's own binding, or picks the earliest lane by name instead of start time.
- Test `wf-typed-lane-log-names-run` (brief test 3) fails if the log line has no run id, or if the refuter lane isn't treated as a workflow lane.
- Tests `wf-record-written-by-first-stop` and `wf-record-read-by-later-stop` (brief test 5) fail if the record is never read.
- Test `wf-late-lane-blocker-on-launch-item` fails if Blockers are routed by the lane's own binding.
- Test `wf-unfocused-first-lane-comments-nowhere` (brief test 2) fails on name-order picking, or on falling back to the lane's own item.
- Test `wf-direct-spawn-unchanged` (brief test 4) guards against regression, so it was green before the fix.
- Test `wf-racing-stops-agree` fails if the record is never read. It has not been shown to catch a double write.
- The name-order mutation (`ls -1tr` changed to `ls -1`) failed 7 cases; the never-read-record mutation failed 3. Both were reverted.
- Commit `cd30838` "CF-80: document the workflow run binding" updates `claude/coder-fleet/hooks/README.md` with the rule, the stop fallbacks, the `runs/<run>` state file and a new decision item 24.
- The same commit updates `claude/coder-fleet/skills/board-conventions/SKILL.md` and `claude/coder-fleet/agents/lead.md` step 6 with how a workflow run is bound, and adds the accepted late-lane move to `docs/limits.md`.
- Migration-checklist over `lead.md`, mechanical checks run through a scratchpad script: 48 lines, six steps, four H2 sections in order, frontmatter unchanged and parsing, no en or em dashes, no hard wraps. My edit adds no model or effort logic and no board write. Checks 4-15 and 20 cover frontmatter, models and the contract file, which this change doesn't touch.
- Gate `bash claude/evals/lib/board-hook-contract.sh`: exit 0, 169 passed, 0 failed, live section included.
- `bun install --frozen-lockfile` in the board package: exit 0. It was needed first, because without it the suite showed 115 missing-package load errors.
- Gate `bun test --timeout=10000` in `claude/coder-fleet/board`: exit 1, 1583 pass, 5 fail, 3 errors. All of them are CF-76's: McpServer bootstrap, the bin wrapper, the two `resolveBinary.cjs` load errors, and one rotating `actions-for-human-core.test.ts` failure (`archive-clears-before-move`) logged with "Lock file is already being held" and "Task not found: BD-1".
- Gate `./claude/evals/lib/check-all.sh`: exit 0, "Every deterministic check passes".
- `shellcheck -x` on the two hook files: my change added only SC2012 on the deliberate `ls`, now disabled with the reason. The other findings were already there.
- Run article: docs/runs/2026-09-30-coder-CF-80.md (commit `15626a9`).
---

created: 2026-09-30 05:54
---
Round 1 results. The reviewer and refuter were spawned while the checkout was focused on CF-84, so their automatic stop comments landed on CF-84, not here. This was the lead's error; see CF-84's note. The summary is recorded here instead.

Review round 1 (worktree agent-abbcae358ccd12af8, diff origin/cf-48-focus-only-binding..HEAD): request changes. Must fix: in every wf- case the earliest lane (wz1) also sorts first in reverse-name order, which is what `ls -1tr` falls back to on a tie and what an `ls -1r` mutant does, so the suite can't tell start-time order from reverse-name order. Add a case where the earliest id sorts neither first nor last by name. Lows: the tie comment in board.sh:295 and README item 24 says 'name order', but it is reverse; wf-late-lane-comments-on-launch-item stops an untyped lane that production never sends to the hook; README:29 'typed and untyped lanes alike' overstates it; wf-racing-stops-agree can't catch a double write and never checks the racers' exit codes. Found sound: run-id and lane-id sanitising, start-record mtime is write-once, the hard-link race and the loser's fallback, untyped lanes do write start records, direct spawns unchanged, docs match.

Refuter round 1: baselines were contract 169/0 and check-all green. 5 of 8 mutants killed (M1, M2, M3, M6, M7). Survived: M5, widening the run-id regex and dropping the tr sanitising lets `wf_a/../../../evil` reach the record path (169/0); M8, a workflow run with no start records falls back to the focus (169/0); M4, write-once becomes mv -f overwrite (169/0).

The lead resolved one of the reviewer's unverified points from its own capture (comment #2): the transcript filename's id equals the event's agent_id (agent-a98bbee1fb9c82c8b.jsonl for agent_id a98bbee1fb9c82c8b), and session_id is the parent's at both start and stop. Fix round 1 starting.
---

author: @SubagentStop
created: 2026-09-30 06:22
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree and branch unchanged: `cf-80-workflow-run-binding` in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abbcae358ccd12af8`. The tree is clean after the commits.
- Must-fix 1 (the `ls -1tr` to `ls -1r` mutant): killed by new case `wf-earliest-by-start-not-name`, which starts wm1, then wa2, then wz3. On that mutant: exit 1, 173 passed, 1 failed, and only this case fails.
- Survivor M5 (widened run-id regex, no sanitising): killed by new cases `wf-hostile-paths-stay-in-runs` and `wf-hostile-paths-resolve-safely`. On the refuter's mutant: exit 1, 172 passed, 2 failed.
- The hostile paths are: a run id with shell metacharacters (`wf_x y;$(touch pwn)*`), which becomes a run filed under a sanitised name; `wf_a/b/agent-...`; `wf_ok/../../escape/agent-...`; and `wf_..`, which is an ordinary file name inside `runs/`.
- The two hostile cases assert that nothing is written outside `sessions/s-w/runs/` since a marker file, that every entry in `runs/` is a plain file with a sanitised name, and that no run id containing a slash appears in the log. A slash or a `..` segment in the would-be run id is treated as a direct spawn.
- Survivor M8 (a run with no start records falls back to the focus): killed by new case `wf-no-start-records-comments-nowhere`. With BD-1 focused and lane transcripts present but no start records, a typed lane's Blocker stop must comment and move nothing and record nothing. On the mutant: exit 1, 173 passed, 1 failed.
- Survivor M4 (write-once replaced with `mv -f`), cause: the refuter's mutant removed the first `[ -e "$file" ] ... return 3` line in `board.sh`, which is in `state_bind_agent`. My own pre-check in `state_record_run` then returned 3 before `mv -f` could run, so no sequential test could see the swap.
- M4 fix: `state_record_run` no longer has its own pre-check, so `ln` is the one existence check. New unit case `run-record-is-write-once` calls `state_record_run` twice with different items and expects return codes `0 3`, an unchanged record and no temp file.
- M4 results: the refuter's M4 as written now fails with exit 1, 173 passed, 1 failed, on `run-record-is-write-once`. So does M4b (only `ln` swapped for `mv -f`): exit 1, 173 passed, 1 failed, same case.
- The existing hook-level case `wf-record-read-by-later-stop` already deletes the earliest lane's start record and transcript between stops and checks that the record is unchanged. A hook-level stop reads the record before it would ever write one, so only the unit case can reach the write-once guard.
- Mutant runs: `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/r1-mutants.sh` rsyncs a fresh copy per mutant (excluding `.git`), applies it, saves the diff, and runs that copy's suite. The last run covered the final code for all five mutants (r, 4, 4b, 5, 8); outputs are in `scratchpad/r1-mut-*.txt`.
- Low, tie order: the comment in `board.sh` (`state_earliest_started`) and README item 24 now say ties come out in reverse name order under `-r`.
- Low, untyped stop in the first case: `wf-late-lane-comments-on-launch-item` now starts and stops two typed lanes. Untyped `workflow-subagent` lanes still appear in later cases, started first and never stopped, so they count only through their start records.
- Low, README line 29: it now says only typed lanes stop through the hook (because of the `hooks.json` matcher) and untyped lanes take part through their start records.
- Low, race case: renamed to `wf-concurrent-stops-agree`. It now checks both racers' exit codes and that `runs/` holds exactly one entry, so no temp file is left.
- README item 24 also documents the sanitised single-segment run id and the case list. The run article is updated with the name-order lesson and the misfired mutant, and trimmed to 793 words.
- Commit `fe7544d` "CF-80 fix round 1: kill the surviving mutants and the name-order gap": tests and `board.sh`.
- Commit `651f3fa` "CF-80 fix round 1: correct the README on lanes, tie order and run ids".
- Commit `dcf2fa5` "CF-80 fix round 1: record the name-order lesson in the run article".
- Gate `bash claude/evals/lib/board-hook-contract.sh`: exit 0, 174 passed, 0 failed. Output is in `scratchpad/r1-gate-contract.txt`.
- Gate `./claude/evals/lib/check-all.sh`: exit 0, "Every deterministic check passes". Output is in `scratchpad/r1-gate-checkall.txt`.
- Run article: docs/runs/2026-09-30-coder-CF-80.md
---
<!-- COMMENTS:END -->
