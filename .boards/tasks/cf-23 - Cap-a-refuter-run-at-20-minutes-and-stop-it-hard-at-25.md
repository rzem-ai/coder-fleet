---
id: CF-23
title: Cap a refuter run at 20 minutes and stop it hard at 25
status: To Do
assignee: []
created_date: '2026-09-27 03:02'
updated_date: '2026-09-27 03:49'
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
<!-- COMMENTS:END -->
