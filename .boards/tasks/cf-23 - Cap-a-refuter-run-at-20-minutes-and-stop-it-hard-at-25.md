---
id: CF-23
title: Cap a refuter run at 20 minutes and stop it hard at 25
status: In Progress
assignee: []
created_date: '2026-09-27 03:02'
updated_date: '2026-09-27 05:13'
labels: []
dependencies: []
references:
  - claude/coder-fleet/agents/refuter.md
  - claude/coder-fleet/skills/looping/SKILL.md
  - claude/coder-fleet/hooks/enforce-agent-scope.sh
  - claude/coder-fleet/hooks/hooks.json
  - docs/limits.md
  - docs/plans/CF-23.md
priority: High
type: feature
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's rule, 2026-09-27: "a refuter MUST NOT run for more than 20 minutes. please add the required changes to tell it to keep to 20 minutes, and a hard hook to kill it after 25". Context: the CF-8 round-1 refuter ran 24 minutes; the looping skill and recent briefs gave refuters up to an hour of suite time.

Two parts:
1. Tell it: the refuter body and the looping skill (preloaded into refuter and coder) state a 20-minute wall-clock budget for a refuter run, with how to prioritise and that a handoff before the deadline beats a complete one after it.
2. Stop it: a hook that ends a refuter run after 25 minutes. Claude Code hooks cannot kill a running subagent process, so the likely mechanism is: SubagentStart records the refuter's start time per agent id; the PreToolUse scope hook (enforce-agent-scope.sh) denies every tool call from that agent id once 25 minutes have passed, with a message telling it to write its handoff; the agent can then only end. Limit to state plainly: a Bash command already running at 25 minutes finishes first, so the true ceiling is 25 minutes plus one in-flight command. The plan confirms the mechanism against the hooks as they are and names anything better.

The running CF-9 and CF-12.2 refuters were told the 20-minute rule by message on 2026-09-27.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The refuter body and the looping skill state the 20-minute budget; migration-checklist findings for the body and the skill in the PR
- [ ] #2 A hook denies every tool call from a refuter run more than 25 minutes after its SubagentStart, with a message telling it to write its handoff, proven by a contract case that fails first
- [ ] #3 The hook does not affect any other agent type, and a refuter under 25 minutes is unaffected
- [ ] #4 docs/limits.md records that an in-flight command can run past 25 minutes, and the design and hooks README describe the cap
- [ ] #5 check-all.sh passes; version bump
- [ ] #6 The refuter body tells it to work in a scratch subdirectory unique to its run, because the session scratchpad is shared between agents running at the same time
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 03:07
---
Added AC: observed 2026-09-27, the CF-9 and CF-12.2 refuters ran at once in the same session scratchpad and one's mut.sh and patch.log overwrote the other's mid-batch. The refuter body is changing in this item anyway, so the run-unique scratch subdirectory rule goes in with the time budget.
---

author: @lead
created: 2026-09-27 03:13
---
Added AC: the CF-12.2 refuter (2026-09-27) noted that by its own body's rules each surviving mutant would be a Blocker: line, which would send the item to the human queue for work the lead routes itself - the same false blocker that moved CF-8 to Blocked by human on 2026-09-27. Briefs have overridden it since; the body should say it.
---

author: @lead
created: 2026-09-27 03:18
---
Plan drafted at docs/plans/CF-23.md, awaiting the human's approval. The cap goes in a new agent-clock.sh hook (every tool, no matcher) rather than the scope hook; past 25 minutes every tool call is denied with the invariant quoted, and under the cap each Bash timeout is trimmed to the time left. Nine open questions, each with a recommended answer. Release step includes the tag (the human's rule, CF-28).
---

author: @lead
created: 2026-09-27 03:22
---
Plan docs/plans/CF-23.md approved by the human 2026-09-27 with the recommended answer to all nine open questions: separate agent-clock.sh hook; 5 s Bash floor; minor bump; coder keeps its hour; missing state fails open and starts the clock late; file a follow-up for capped refutations reading as clean in review-round; live probe after merge; no continue:false stage; run_in_background a recorded limit. AC7 (Blocker lines) moved to CF-31, which the human pulled forward. AC6 (private scratch subdirectory) is not in the approved plan; the lead asks the human before adding it to Phase 2.
---

author: @SubagentStop
created: 2026-09-27 03:49
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-afbe9ceb32948103e` (git common dir `.git`, a linked worktree), branch `cf-23-refuter-clock` cut from `origin/main` at 07cc4b2, with its upstream removed so it no longer tracks `origin/main`.
- `b27c8e3 Add the approved plan for CF-23`: `docs/plans/CF-23.md`, a byte-for-byte copy (`cmp` printed nothing).
- `7611d7f Stop a refuter's tool calls at 25 minutes with agent-clock.sh`: the new `claude/coder-fleet/hooks/agent-clock.sh` (mode 0755), plus SubagentStart and PreToolUse entries in `claude/coder-fleet/hooks/hooks.json` with no matcher and a 5 s timeout.
- The same commit changes `claude/evals/lib/scope-hook-contract.sh`: a header paragraph, `CODER_FLEET_STATE_DIR` exported under `$TMP`, the two `BASH_*_TIMEOUT_MS` variables unset, and 37 clock cases.
- Red run, before `agent-clock.sh` existed: `bash <wt>/claude/evals/lib/scope-hook-contract.sh -v`, exit 1, 344 passed, 20 failed. The failures were every start/record, resume, over-cap deny, reason, starts-late, corrupt, trim, floor, registered and executable case; the 17 allow and unaffected cases passed, as the plan intends. An earlier red run is discarded because my helper's unbound `$4` made the start cases fail for a harness reason.
- First green attempt: exit 1, 362 passed, 2 failed (`clock-start-others` and `clock-bash-other-agent`). That was the errtrace over-reach bug; after the fix the run was exit 0, 364 passed, 0 failed.
- The change that makes each added test fail: removing the hook fails the 20 red cases; an uncapped agent getting caps fails `clock-start-others` and `clock-bash-other-agent` (seen with the errtrace bug); removing the `hooks.json` entries fails `clock-registered`; dropping the execute bit fails `clock-executable`.
- Other Phase 1 checks: `board-hook-contract.sh` exit 0, 62 passed, including `commands-use-plugin-root` and `commands-not-single-quoted`; `jq -e .` on hooks.json exit 0; `/bin/bash -n` on the hook exit 0.
- `5e5742f Tell the refuter its round is 20 minutes of wall-clock`: `refuter.md` changes step 1, step 2 (with the criterion 6 scratch-subdirectory sentence folded in), the budget paragraph, and the invariant `Never run past 20 minutes of wall-clock from your spawn.`
- The same commit changes the body of `looping/SKILL.md:19`, the refuter routing sentence at `lead.md:32`, and adds the criterion 6 approval line to Phase 2 of `docs/plans/CF-23.md`.
- Phase 2 checks: the invariant grep finds exactly one hit in `refuter.md:44` and one in `agent-clock.sh:82`; `hour of suite time` survives only in the skill's "Any other loop" sentence; `roster-contract.sh` 155 passed, 0 failed; the skill's diff is one hunk at line 19, below the frontmatter.
- Migration checklist for `refuter.md` and `lead.md`, checks 1-3: pass for both. YAML parses, the key lists are as expected, `tools` is a string, `skills` is a list, and the frontmatter is unchanged.
- Migration checklist, check 4: pass for refuter, since `claude mcp list` shows `claude.ai Memory`, which registers as `claude_ai_Memory`. Not applicable for lead, which has no `tools` field.
- Migration checklist, checks 5-7: pass for both. There is no `memory` or `isolation` field, every listed skill has its `SKILL.md`, and `name` matches the filename and the roster.
- Migration checklist, check 8: pass for refuter (an allowlist, with a `disallowedTools` second lock). Not applicable for lead, a full session by design.
- Migration checklist, checks 9-13: not applicable, since there is no model or effort change. Checks 14-15 pass: `opus`/medium and `opus`/high, unchanged.
- Migration checklist, checks 16-17: pass. `wc -l` gives 48 and 48, and the four H2 sections are in order with no H1.
- Migration checklist, check 18: pass. The refuter states the budget in its own words and shares only the plan-mandated phrase with the skill.
- Migration checklist, check 19: pass. The dash scan's 42 hits and the wrap scan's 8 hits are all in files this branch does not touch.
- Migration checklist, check 20: pass. `docs/agent-contract.md` adds no field.
- `eb1dd52 Document the refuter's time cap`: the hooks README gets "Five hooks", a new table row, the `clocks/` state line, a "Per-agent time caps" section, testing example 6, a "What breaks them" entry and item 20.
- The same commit changes `docs/limits.md` (a new cap section with the plan's five entries plus machine sleep, the named-spawn and `:47` additions, and a live-run entry), `docs/fleet-design.md:49`, `AGENTS.md:55` and the `hooks.json` description.
- Phase 3 checks: `jq -e .` exit 0; `instruction-file-contract.sh` 13 passed, 0 failed. The `an hour` grep hit at `fleet-design.md:89` is existing text about Fable, not a budget.
- `2d82942 v0.27.0: cap a refuter run at 20 minutes and stop it hard at 25`: `plugin.json` and the marketplace entry both at 0.27.0. I took 0.27.0 because `origin/main` was still at 0.25.1 after a fresh fetch and `cf-9-in-progress-column` claims 0.26.0. `origin/main` is an ancestor of HEAD, so no rebase was needed.
- check-all, run once into `.../scratchpad/cf-23/check-all.txt`: exit 0. Suites 132, 62, 364, 155, 115, 5 and 13 passed with 0 failed; board bun 68 pass, 0 fail; glossary up to date; versions 0.27.0 and 0.27.0; final line "Every deterministic check passes."
- Run article: docs/runs/2026-09-27-coder-CF-23.md
---

author: @SubagentStop
created: 2026-09-27 04:20
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups. No blocking defect found.
- Reviewed `origin/main...cf-23-refuter-clock` in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-afbe9ceb32948103e` against `docs/plans/CF-23.md` and its Status line. Areas covered: `agent-clock.sh` in full, `hooks.json`, the 37 clock cases in `claude/evals/lib/scope-hook-contract.sh`, `refuter.md`, `looping/SKILL.md`, `lead.md:32`, the hooks README, `docs/limits.md`, `docs/fleet-design.md:49`, `AGENTS.md:55`, and the run article `docs/runs/2026-09-27-coder-CF-23.md`.
- Read the coder's check-all capture: `scope-hook-contract` 364 passed, 0 failed, and "Every deterministic check passes."
- Checked memory for prior decisions: nothing contradicts the change, and the `errtrace` lesson is already recorded.
- Scanned the added lines for conventions: clean. Body lengths: 48 and 48.
- I count five commits on the branch, not the six in the brief. Nothing looks missing.
---

author: @SubagentStop
created: 2026-09-27 04:36
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-afbe9ceb32948103e`, branch `cf-23-refuter-clock`. Two new commits, nothing amended, not pushed, and the version stays 0.27.0: `9e7d25d Let a capped refuter return structured output, and normalise its Bash timeout` and `df1e205 Correct the cap's wording in the lead, AGENTS.md, the hooks README and the plan`.
- Item 1: `agent-clock.sh` now lets `StructuredOutput` through before the deny (`[ "$tool_name" != StructuredOutput ] || exit 0`). New case `clock-over-cap-structured-output-allowed` was red first ("wanted allow, got deny") and is now green. The hooks README describes this in the time-caps section and in item 20.
- Item 2: new case `clock-invariant-in-body`. It takes the quoted invariant from the hook's actual deny reason and greps `agents/refuter.md` for it. Seen failing when the body was edited to "wall clock" (no hyphen): "the deny quotes '...wall-clock...', which agents/refuter.md does not contain".
- Item 3, the case asked for: `clock-typed-no-agent-id` sends `agent_type: refuter` with no `agent_id` and expects allow, no file and no new log line. Deleting the fast path alone does not fail it, because the later `agent_id` guard still exits silently. Even with both guards deleted, output and file count are unchanged, since the write to the bare `clocks/` path fails. Only the log assertion I added caught that double deletion (log lines 20 to 21).
- Item 3, the case that pins the fast path: `clock-main-session-skips-jq` sends a main-session call through a tool directory without jq and asserts no "jq is not installed" line is logged. Deleting the fast path fails it (log lines 1 to 2).
- Item 3, fail-open cases: `clock-no-jq-allows` runs a refuter aged 7200 s without jq and expects allow plus a log line naming jq; deleting the jq check fails it. `clock-unwritable-state-allows` uses a state dir set to `chmod 500` and expects exit 0, no output and no file on both events; making the cannot-write branch `exit 2` fails it.
- How the no-jq cases run: the contract builds `$TMP/nojq-bin` with links to cat, date, mkdir, tr, sed, head and chmod, and calls the hook through `env PATH=... /bin/bash`. That is inside the contract script, not on a Bash tool command line.
- Item 3, plan copy: the Risks sentence in `docs/plans/CF-23.md` now says the deny and resume cases prove the state-dir export took, not `clock-main-session`.
- Item 4: `/usr/bin/jq` here is 1.7.1 and prints `600000.0` and `6E+5` as written; the jq first on PATH (anaconda) is 1.6 and does not. The new `clock-bash-timeout-600000.0` and `-6e5` cases run once for each distinct jq version found, each through its own bin directory.
- Item 4 red and green: on the red run both 1.7.1 cases failed ("verdict allow, timeout ''") and both 1.6 cases passed. The fix is `floor` in jq, which gives a freshly computed number that prints canonically, plus a shell check that treats anything but plain digits as no timeout. It is the `floor` that turns the 1.7.1 cases green; the shell check alone would fall back to the 120000 ms default and not trim at 1380 s. The README's item 20 records this.
- Item 5: the header's failure-mode paragraph now explains the `trap - ERR` on the deny path, and that a jq failure there exits with jq's own status. Status 2 is read as a block, which is the outcome the deny wanted anyway.
- Item 6: `lead.md:32` now reads "...keeps its first start time, so once that is 25 minutes past every tool call it makes is denied." It is still 48 lines.
- Item 7: `AGENTS.md:55` now says "All three have contract tests".
- Mutations run against the committed hook and each reverted with `git checkout --`. Mutation 1 (fast path deleted) was killed by `clock-main-session-skips-jq` only. Mutation 2 (fast path and `agent_id` guard deleted) was also killed by `clock-typed-no-agent-id`. Mutations 3 to 5 (jq check deleted, cannot-write branch exits 2, body invariant edited) were killed by `clock-no-jq-allows`, `clock-unwritable-state-allows` and `clock-invariant-in-body`.
- Red run with the new cases: exit 1, 371 passed, 3 failed. Green with `-v` after the fixes: exit 0, 374 passed, 0 failed.
- Suites on HEAD `df1e205`: `scope-hook-contract.sh` exit 0, 374 passed, 0 failed; `board-hook-contract.sh` exit 0, 62 passed, 0 failed. Nothing failed, so no reruns were needed.
- check-all, run once on HEAD `df1e205` into `.../scratchpad/cf-23/check-all-r2.txt`: exit 0. Suites 132, 62, 374, 155, 115, 5 and 13 passed with 0 failed; board bun 68 pass, 0 fail; versions 0.27.0 and 0.27.0; final line "Every deterministic check passes."
- `/bin/bash -n` on the hook: exit 0. `lead.md` and `refuter.md` are 48 lines each. The dash and wrap scans show no new hits in changed files; the scan now skips `node_modules`, which the board suite installs and git ignores.
---

author: @SubagentStop
created: 2026-09-27 05:02
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Started 14:55:21 AEST, deadline 15:15:21. I copied the tracked files with `git -C <worktree> ls-files -z | rsync -a --from0 --files-from=-` to `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/refuter-cf23-r1/base`. `cmp` showed all 14 changed files byte for byte identical to the branch.
- Baseline: `/bin/bash claude/evals/lib/scope-hook-contract.sh` exit 0, `374 passed, 0 failed`, 72 s. The suite keeps its state in its own mktemp directory, so the mutants ran in parallel, each in its own copy under the scratch directory (`mut.py` applies the edits and asserts each one matched exactly once). Every mutant below is an edit to `claude/coder-fleet/hooks/agent-clock.sh`.
- Killed, m1: added `permissionDecision: "allow",` to the Bash-trim output. Exit 1, 367/7. Killed by `clock-bash-trimmed`, `clock-bash-default-trimmed` and `clock-bash-floor` (verdict "other").
- Killed, m2: removed the `*'"agent_id"'*` fast-path case, so the main session goes on to the jq check. Exit 1, 373/1. Killed by `clock-main-session-skips-jq`.
- Killed, m3: deleted `[ -n "$caps" ] || exit 0`. Exit 1, 372/2. Killed by `clock-start-others` and `clock-bash-other-agent`.
- survived: `if [ "$elapsed" -ge "$hard" ]` -> `if [ "$elapsed" -gt "$hard" ]` - a call at exactly 1500 s elapsed is allowed instead of denied. Suite exit 0, 374/0. Suite clock ages are 60, 1380, 1440, 1490, 1496, 1510, 2000 and 7200 - none at 1500. I confirmed by probe: with a clock set to exactly now-1500, the base hook denies a Read and m4 prints nothing (the call is allowed), both exit 0.
- Killed, m5: `( set -C; umask 077` -> `( umask 077`. Exit 1, 373/1. Killed by `clock-resume-keeps-first` (started_at 1790483166 -> 1790485167).
- Killed, m6: deleted the `TRIM_FLOOR_MS` floor line. Exit 1, 373/1. Killed by `clock-bash-floor` (rewrite, timeout 4000).
- Killed, m7: deleted the `StructuredOutput` exemption. Exit 1, 373/1. Killed by `clock-over-cap-structured-output-allowed`.
- Killed, m8: `then (floor | if` -> `then (. | if`. Exit 1, 372/2. Killed by `clock-bash-timeout-600000.0` and `clock-bash-timeout-6e5` (jq-1.7.1-apple).
- Killed, m9: added `exit 2` in the PreToolUse "cannot be written" branch, after the log line. Exit 1, 373/1. Killed by `clock-unwritable-state-allows`.
- survived: `if type == "number" and . >= 1` -> `if . >= 1` - a string timeout now makes the hook's jq fail, and the hook logs "hook input is not valid JSON; allowing the call". So a refuter Bash call with `"timeout":"600000"` at 1440 s escapes the trim. I confirmed by probe that the base hook trims the same input to `{"timeout":60000}`. Suite exit 0, 374/0. No test sends a string timeout (`grep '"timeout":"'` in the contract file finds nothing).
- Field split under `/bin/bash` 3.2 (probes, not mutants): an empty middle field and an empty trailing field both come out as empty strings with the right positions. A SubagentStart with no tool_name or timeout creates the clock file. Over the cap, a Read whose trailing field is empty is denied. No defect found.
- Budget: baseline plus 10 mutants plus 7 probes in about 6 minutes of wall-clock. This is round one, so there's no earlier round to compare for convergence.
---

author: @SubagentStop
created: 2026-09-27 05:12
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree check: `git rev-parse --git-common-dir` showed the shared `.git` with toplevel `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a8cfde365213a98ba`, and the worktree was clean. I created `cf-23-fix-2` at `df1e205`; `git rev-parse HEAD` returned `df1e20587ae559e347a4cc986231193c46af0eda`. Nothing was written in the other worktree or under `.boards/`.
- All edits are in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a8cfde365213a98ba/claude/evals/lib/scope-hook-contract.sh`. The hook itself is unchanged.
- Gap 1, commit `0f8fb90` "Deny a refuter tool call at exactly the 1500-second cap in the contract": the new case `clock-at-cap-denies` reads `t0=$(date +%s)`, writes `started_at=t0-1500`, runs the hook, then reads `t1`. A run only counts if `t0 == t1`, because then the hook's own `date +%s` saw exactly 1500. A run that crosses a second boundary is retried, up to 5 times. I also changed the section comment, which used to say every boundary keeps a margin.
- Gap 1 failure check: with `-ge` changed to `-gt` the run exited 1 with one failure, this case: "verdict was 'allow', wanted deny".
- Gap 2, commit `694aff9` "Trim a refuter Bash call whose timeout arrives as a string": the new case `clock-bash-string-timeout-trimmed` sends `"timeout":"600000"` at age 1440 and expects a rewrite with a timeout between 50000 and 60000. A string timeout counts as "no timeout given", so the default decides. At age 1440 that gives the same range as a numeric 600000 would, so either reading of the brief expects this result.
- Gap 2 failure check: with `type == "number" and` removed the run exited 1 with one failure, this case: "verdict allow, timeout ''". jq sorts strings above numbers, so `"600000" >= 1` is true, `floor` then errors, and the hook allows the call untrimmed.
- Gap 3: an existing case already covered it. `clock-unwritable-state-allows` sends SubagentStart against a read-only state directory, which reaches the cannot-write branch, and checks `rc -eq 0`. I added `exit 2` after that branch's log line and the run exited 1 with one failure, this case. Commit `b2b9c33` "Say which contract case pins the clock's cannot-write exit status" adds a comment saying so; it has no test logic.
- The three mutants were reverted each time, and `git status` showed only the contract file modified before I committed.
- Baseline before any mutant: `/bin/bash .../scope-hook-contract.sh -v` exited 0, 376 passed and 0 failed, with all three cases `ok`.
- Reorder steps: I recorded the pre-reorder tip `6b8d81e30e242d5466839851ead58ff634c4cd88`. `git reset --hard 07cc4b2` moved `cf-23-fix-2` back; the branch was unpushed and only mine. One `git cherry-pick b27c8e3 7611d7f 5e5742f eb1dd52 9e7d25d df1e205 1adc89a ab1c96e 6b8d81e 2d82942` applied with no conflicts.
- Reorder check: `git diff --stat 6b8d81e HEAD` was empty.
- Final order: `40f0efc` plan, `bf3c87d`, `591a666`, `2fbd0c7`, `f44268b`, `99572e4`, `0f8fb90`, `694aff9`, `b2b9c33`, then `98cc180` "v0.27.0: cap a refuter run at 20 minutes and stop it hard at 25" with the subject unchanged. The version commit still carries `docs/runs/2026-09-27-coder-CF-23.md` along with `plugin.json` and `marketplace.json`, as it did before.
- `bash .../claude/evals/lib/check-all.sh`, run once at HEAD `98cc180`, exited 0. Output is in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/11926718-0f1a-4950-ad22-c590bd77fb04/scratchpad/cf-23/check-all-r3.txt`. The suite counts were 132, 62, 376 (the scope contract), 155, 115, 5 and 13 passed, all with 0 failed, and it ended with "Every deterministic check passes."
- No case failed against the unmutated hook, so none needed a `-v` rerun.
---

author: @lead
created: 2026-09-27 05:13
---
Phase 4 of 4: PR #5 open (branch cf-23-refuter-clock = 98cc180, v0.27.0 last); not on main. Review approved with follow-ups (folded in); refuter 8 of 10 killed, both survivors now killed by clock-at-cap-denies and clock-bash-string-timeout-trimmed; check-all green on 98cc180. Merge after PR #4. Done still needs: the human's merge, the v0.27.0 tag, the post-merge live probe, and ticking criteria 1-6 against the named cases. Follow-up filed: CF-36.
---
<!-- COMMENTS:END -->
