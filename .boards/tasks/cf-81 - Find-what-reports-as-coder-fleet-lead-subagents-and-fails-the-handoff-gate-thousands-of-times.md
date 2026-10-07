---
id: CF-81
title: >-
  Find what reports as coder-fleet:lead subagents and fails the handoff gate
  thousands of times
status: In Progress
assignee: []
created_date: '2026-09-30 03:58'
updated_date: '2026-10-07 01:51'
labels:
  - hooks
dependencies: []
priority: High
type: bug
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by the human 2026-09-30 (out of scope for CF-48/CF-80, filed after one look). ~/.local/state/coder-fleet/log/hooks.log has 3589 SubagentStop lines for `coder-fleet:lead` subagents and 3496 'handoff from coder-fleet:lead is malformed; exit 2 to make it re-emit' lines, the first at line 9 (2026-09-26T14:13:37Z, a2e13bd914dc4ab7d). The case the human saw: a51b554e099c0e5ff at 03:49:05Z on 30 Sep (lines 12475-12476), with many more around it (12462-12512). None of these ids has a SubagentStart line, and no transcript exists for a51b554e099c0e5ff. Nothing deliberately spawns a lead.

Facts from the scout: board-subagent-stop.sh:363-364 exits 2 on every malformed handoff, with no retry cap and no stop_hook_active check. The stop lines log neither session_id nor cwd (the hook reads them at 249-260), so a stop cannot be traced to a session or repo. This repo's .claude/settings.json:3 sets "agent": "coder-fleet:lead". Workflows spawn agentType-less lanes (spec-to-card.js ~379 and ~464, review-round.js ~437 and :559), and spec-to-card.js:375 assumes the matcher skips them.

Leading hypothesis, unconfirmed: a subagent spawned with no type in a session whose default agent is lead reports agent_type coder-fleet:lead. That makes the SubagentStop matcher gate it as a lead, reject its non-handoff output (a workflow lane's schema JSON, for example) as malformed, and force a re-emit. This costs tokens on every such lane in every project. Correlation is weak: 10 lead stops fell during this repo's first spec-to-card run (01:40-01:45Z), but 54 fell between 01:00 and 01:35Z, when the fathom session was also active.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The raw SubagentStop hook input for one such stop is captured, and the card names what spawned it and what agent_type it carried, quoted
- [ ] #2 Subagents that are not fleet agents doing handoff work (workflow lanes with no agentType, untyped general spawns) are not held to the handoff gate and never get exit 2, proven by a case in claude/evals/lib/board-hook-contract.sh or the handoff-check parity test
- [ ] #3 A stop that the hook does gate cannot re-emit without limit: a re-emit cap or a stop_hook_active check is in place, with a contract case
- [ ] #4 Every SubagentStop log line carries session_id and cwd
- [ ] #5 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-06 13:22
---
2026-10-06: the human chose to file this fault from today's log read and raise it to High (it already had this card, so it is not re-filed). New evidence: 1,403 lead malformed lines since 2026-10-05T12Z, from 1,394 distinct ids, and still no SubagentStart for any of them. Three fell at 13:19:41Z, 13:19:54Z and 13:20:13Z, during a lead turn in this repo's session b60f21ed that spawned no subagent and ran no workflow; one of them (adc478f720b7b04e2) was also counted as raising a Blocker with no card. Grepping ~/.claude/projects for those ids finds no subagent transcript. That weakens the untyped-workflow-lane hypothesis and points to the main session's own internal side calls (for example the away summary), which run under the session's agent type, coder-fleet:lead. AC #1 is still the way to confirm it.
---

created: 2026-10-07 01:04
---
Ordered: the human moved this card into Next on 2026-10-07. Sub-issue 1 of 1: started. Done still needs: criteria 1 to 5.

Done: nothing yet; a coder is being spawned, starting with criterion 1 (capture one raw hook input), since the fix depends on what it shows. The SubagentStop gate decides what an agent's run is allowed to end as, so a refuter runs before merge.

Not done: the gate still rejects roughly 1,400 lead-typed stops a day, forcing a re-emit for each.
---

author: @SubagentStop
created: 2026-10-07 01:34
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Criterion 1, what spawned it: nothing in the fleet. After each main-session turn, the runtime runs a side call that predicts the human's next prompt. That call fires SubagentStop with the session's agent type, `"agent_type":"coder-fleet:lead"`. It comes with no SubagentStart, and its `agent_transcript_path` names a file that never exists. The gate's exit 2 then made the side call run a second model turn, which wrote a handoff. The first hypothesis (untyped workflow lanes) is refuted. The second (the main session's side calls) is confirmed for the prompt suggestion only.
- Captured from an interactive `claude --plugin-dir <worktree>/claude/coder-fleet` session in a throwaway project whose settings set `"agent": "coder-fleet:lead"`, driven by `expect`. The quoted raw input, with the home path shortened: `{"session_id":"25b96358-a8ac-4d3b-9eec-571abd21438c",...,"permission_mode":"auto","agent_id":"a41757ecf7f9b29ef","agent_type":"coder-fleet:lead","hook_event_name":"SubagentStop","stop_hook_active":false,"agent_transcript_path":"~/.claude/projects/<proj>/25b96358-.../subagents/agent-a41757ecf7f9b29ef.jsonl","last_assistant_message":"Now write hi4 to hi4.txt and reply ready",...}`. The re-emitted stop two seconds later had the same id, `"stop_hook_active":true`, and a full four-heading handoff.
- Three `claude -p` runs (one plain reply, two with Bash and Write calls) captured only `Stop`, because print mode makes no prompt suggestion. That is why print-mode probing never reproduced it.
- Findings, commands and the quoted JSON are in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-af64b706c38b7746b/docs/findings/CF-81-lead-typed-stops.md` (commit "Record the CF-81 capture of a lead-typed stop").
- Log evidence: `hooks.log` holds 7,438 lead "is malformed" lines. 189 lead stops "succeeded" after a re-emit, each one a wasted model turn. 23 raised `Blocker:` lines that no fleet agent wrote.
- Criterion 2: `lead` is removed from the SubagentStop matcher in `hooks/hooks.json`. As a backstop, `board-subagent-stop.sh` exits 0 on `lead` or `coder-fleet:lead` and logs that it was the session's side call.
- Why criterion 2 takes this shape: the lead is the session agent and is never spawned, so a lead-typed stop is never a lead run. What it gives up: no handoff check on a lead someone spawns by hand, which the fleet never does.
- I did not choose "gate only stops with a real transcript". It relies on runtime behaviour nobody has measured for real subagents, and it would have meant reworking every `/dev/null` transcript case in the contract.
- `roster-contract.sh` now asserts that lead is left out of the matcher.
- Criterion 3: a malformed handoff gets exit 2 at most `CODER_FLEET_HANDOFF_REEMIT_CAP` times per agent (3 unless set). The count lives in `agents/<agent_id>.reemits` and a valid handoff clears it. With no agent id, or a count that can't be written, `stop_hook_active` allows one re-emit.
- Criterion 4: every line the stop hook logs, the library's included, now reads `[SubagentStop session=<id> cwd=<path>]`. I did this by wrapping `board_log` inside the hook, so `hooks/lib/board.sh` is untouched.
- Added `CODER_FLEET_HOOK_DUMP=<dir>`, which copies each raw event into that directory. It is off by default; I kept it for the next stop the log can't explain.
- Commit "Stop gating the lead's side-call stops and cap handoff re-emits (CF-81)" carries the hook, matcher, contracts, roster check and hooks README item 27. It is one commit because the four changes share hunks in the same two files.
- New case `stop-dump-writes-raw-event` in `claude/evals/lib/board-hook-contract.sh`: seen failing before the dump existed.
- New cases `stop-lead-side-call-stands-down`, `stop-lead-side-call-is-named`, `stop-bare-lead-stands-down` and `stop-lead-workflow-lane-stands-down`: seen failing before the stand-down.
- New case `matcher-skips-lead`: seen failing while the matcher named lead.
- New cases `stop-reemit-cap` and `stop-active-no-id-lets-go`: seen failing before the cap.
- New case `stop-reemit-reset`: passed before the fix, but I disabled the reset line and watched it fail.
- New case `stop-log-carries-session-cwd`: seen failing before the wrapper.
- New case `stop-reemit-cap-is-logged`: I first wrote it to match "re-emit", which passed vacuously against the old log line. I tightened it to "still malformed after 3 re-emits" but did not rerun the suite before the fix in between.
- Commit "Give each handoff-parity case its own agent id (CF-81)": the parity harness reused one agent id for all 32 cases, so the cap let every invalid case after the third through.
- Commit "v0.39.5: stop gating the lead's side-call stops (CF-81)" bumps `plugin.json` and `marketplace.json`.
- Test runs: `board-hook-contract.sh` 257 passed, 0 failed; `roster-contract.sh` 211 passed; `handoff-parity.sh` alone, all 32 cases agree.
- `check-all.sh` run 1, before the parity fix: rc=1, only handoff-parity failed (the cap problem above).
- `check-all.sh` run 2: rc=1, 279.4 s. Only the board binary section failed: 6 tests in `src/test/actions-for-human-cli.test.ts` hit the 10 s timeout, with 7 `check-all.sh` processes running at once.
- Rerunning that file alone (`bun test --timeout=10000 src/test/actions-for-human-cli.test.ts`): rc=0, 11 pass, 0 fail.
---

created: 2026-10-07 01:34
---
Criterion 1 evidence, from the coder's capture (docs/findings/CF-81-lead-typed-stops.md on the branch). What spawns these stops: the Claude Code runtime's prompt-suggestion side call, which runs after every interactive main-session turn. It fires SubagentStop carrying the session agent's type, with no SubagentStart and an agent_transcript_path naming a file that never exists. Quoted raw input (home path shortened): `"agent_id":"a41757ecf7f9b29ef","agent_type":"coder-fleet:lead","hook_event_name":"SubagentStop","stop_hook_active":false,"agent_transcript_path":"~/.claude/projects/<proj>/25b96358-.../subagents/agent-a41757ecf7f9b29ef.jsonl","last_assistant_message":"Now write hi4 to hi4.txt and reply ready"`; the re-emitted stop two seconds later had the same id, stop_hook_active true and a full four-heading handoff. `claude -p` runs make no prompt suggestion, which is why print-mode probing never reproduced it. Untyped workflow lanes are refuted as the cause. hooks.log holds 7,438 lead malformed lines, 189 lead stops that 'succeeded' after a forced re-emit (a wasted model turn each), and 23 Blocker lines no fleet agent wrote.

Built on cf-81-lead-typed-stops (head 878d2aa after the lead merged main, v0.39.5): lead out of the SubagentStop matcher with a stand-down backstop in the hook; re-emits capped at 3 per agent (CODER_FLEET_HANDOFF_REEMIT_CAP), with stop_hook_active allowing one where there is no id; every stop log line carries session and cwd; an opt-in CODER_FLEET_HOOK_DUMP for raw events. Contract cases seen failing first; board-hook-contract 257 of 257, roster 211, handoff-parity 32 of 32. The coder's last full suite run was red only in the board section (timeouts with seven suites running), passing alone; the review lanes and the gate supply the clean run. Review and a refuter start now: this hook decides what an agent's run may end as.
---

author: @SubagentStop
created: 2026-10-07 01:51
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `bash claude/evals/lib/check-all.sh` in a copy of the worktree (`cp -R`, `.git` included) exited 1 after 497.1 s. Only `board` failed, with `error: no response to GET / within 5s`. `board-hook-contract`, `roster-contract` and `handoff-parity` passed (81.2 s). There was no time to rerun `board` alone. Each mutant ran `board-hook-contract.sh` alone, and two unmutated copies of it, run0 and run1, exited 0 in about 455 s. All ten copies ran at once, each with its own temporary directory.
- Probe, prefix tricks are blocked: `x:lead`, `coder-fleet:lead-ish`, `LEAD`, `coder-fleet:lead ` (trailing space), ` lead` (leading space) and `lead:coder` all got exit 2. Only the exact types `lead` and `coder-fleet:lead` stand down.
- Probe, the cap is counted per agent: agent A got 2,2,2,0; a new agent B in the same session then got 2.
- Probe, traversal is blocked: an agent id of `../../../x` with session `s/../..` became `sessions/s_.._../agents/.._.._.._x.reemits`, inside the state directory.
- Probe, the dump stays where it is told: the directory was created 700 and the file 600, inside the named directory only. The file name uses only the date and the process id, nothing from the event. With the variable unset, nothing was written anywhere.
- Probe, an unwritable count does not let every malformed handoff through: with `agents` replaced by a file, the hook returned 2 and then 0 (one re-emit, as designed). With the directory set to mode 500 and stop_hook_active false it kept returning 2, which is correct because the runtime sets that flag after a block.
- killed: M3, `-ge "$REEMIT_CAP"` to `-gt`. Caught by stop-reemit-cap and stop-reemit-cap-is-logged (exit 1).
- killed: M4, the `rm -f "$reemit_file"` after a valid handoff replaced with `:`. Caught by stop-reemit-reset (exit 1).
- killed: M5, `[ -z "$reemits" ] && [ "$stop_hook_active" = true ]` reduced to `[ -z "$reemits" ]`. Caught by stop-active-no-id-lets-go (exit 1).
- killed: M8, hooks.json matcher given `lead[a-z-]*|` back. Caught by matcher-skips-lead (exit 1).
- killed: M7, the dump defaulted to `${CODER_FLEET_STATE_DIR}/dumps` whenever the variable is unset. Exit 1, but only `wf-hostile-paths-stay-in-runs` failed, which is an unrelated test that spots stray files. No dump case asserts "unset writes nothing".
- survived: in the write-failure branch of the cap block, `reemits=""` replaced with `:` (`if ! ( umask 077; mkdir -p ... > "$reemit_file" ) 2>/dev/null; then :; fi`) - when the count cannot be written, the stop_hook_active fallback never runs. My probe on that mutant gave 2,2,2,2 where the real hook gives 2 then 0, so a malformed stop is blocked for ever. Suite exited 0 (run9, 437 s). No case makes the count unwritable while an agent id is present.
- survived: `reemit_file=".../agents/$(printf '%s' "$agent_id" | tr ...).reemits"` replaced with `.../agents/shared.reemits` - every agent in a session shares one cap, so one stubborn agent uses up the re-emits of the agents after it. Suite exited 0 (run2). Every cap case uses its own session_id (s-cap, s-cap2, s-cap3), so two agents never share a session.
- survived: `( umask 077; mkdir -p "$CODER_FLEET_HOOK_DUMP"` changed to `( mkdir -p "$CODER_FLEET_HOOK_DUMP"` - the raw event, which holds the agent's final message, is written with the default umask (usually readable by everyone). Suite exited 0 (run6). stop-dump-writes-raw-event checks only the file's contents, not its mode. This only applies when the human sets the dump variable.
- low: board-subagent-stop.sh:476 - agent ids are made safe by turning odd characters into `_`, so two ids can share a count file. In my probe `a/b` used three re-emits and the first malformed stop from `a_b` was let go at once. Runtime agent ids are hex, so this cannot happen in practice.
- low: board-subagent-stop.sh:485 - a count file holding `99999999999999999999` makes the `[ -ge ]` check error and fall through to exit 2, then writes back the overflowed 7766279631452241920. Only the hook writes this file, so it cannot happen in practice.
- Budget: eight mutants out of eight, about 16 minutes of the 20. The three survivors are new; there was no earlier round to compare against.
- Scratch files are in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/b60f21ed-bab8-46da-b450-232af096a73a/scratchpad/refuter-1791336893/`: the probe script is `probe.sh`, the logs are `baseline.log` and `run0.log` to `run9.log`, and the mutant trees are `m2` to `m9`.
---

created: 2026-10-07 01:51
---
Review round 1 on 524b2f5..878d2aa (2026-10-07): reviewer approve with follow-ups, criteria 1 to 4 met on reading, nothing blocking. Refuter: eight mutants, five killed; no way found for a fleet agent to escape the gate (prefix tricks, per-agent counting, path traversal and the dump's location all held). Survivors: an unwritable count with an agent id blocks for ever; one count shared by every agent in a session passes the tests; the dump's permissions are untested. Gates: both full runs on this head were red only in the board section under heavy load (web UI GET timeout, board timeouts), in files the diff does not touch; a clean run is owed by the fix round.

Decisions by the lead on the reviewer's two follow-ups: (1) stand a stop down as a side call when it has no SubagentStart record AND no transcript file, keeping the lead name check, so a session run as any fleet role is covered without waving through a real agent on one missing signal; (2) when the cap lets a bound agent go, comment on its card with the agent type and any Blocker: lines, and clear the count. Fix round 1 commissioned with both, the three survivors and three Lows (the parity filter, a log line before the tag is known, newlines in the tag).
---
<!-- COMMENTS:END -->
