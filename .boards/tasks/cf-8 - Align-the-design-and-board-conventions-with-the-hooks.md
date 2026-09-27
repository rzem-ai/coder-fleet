---
id: CF-8
title: Align the design and board-conventions with the hooks
status: To Do
assignee: []
created_date: '2026-09-26 14:28'
updated_date: '2026-09-27 01:23'
labels: []
dependencies: []
references:
  - docs/fleet-design.md
  - claude/coder-fleet/skills/board-conventions/SKILL.md
  - claude/coder-fleet/hooks/board-subagent-stop.sh
  - claude/coder-fleet/hooks/README.md
  - claude/coder-fleet/agents/fleet-steward.md
  - docs/plans/CF-8.md
priority: Medium
type: docs
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Four places where docs/fleet-design.md and the board-conventions skill disagree with the hooks or with each other, found by reading the design on 2026-09-27 and confirmed by a scout pass. Decisions taken with the human in the same session:

1. Blocked via SubagentStop is dead code. `claude/coder-fleet/hooks/board-subagent-stop.sh:280` reads `.status // .completion_reason`, neither of which the shipped SubagentStop schema carries, so the Blocked write at lines 327-341 is unreachable (hooks/README.md:113 says so). The board-conventions skill still describes it as live. Decision: delete the dormant status branch from the hook, and correct the skill, hooks/README.md and design section 7 so only TaskCompleted writes Blocked.
2. Design section 3 is a hand-kept third copy of the glossary table that no check covers; it has already drifted (no Run article row, Project and Eval rows differ). Decision: replace the table with a pointer to the glossary skill.
3. Design section 7's "To do" row says "an agent proposing work" moves it; the skill and lead.md say the lead files proposals and fleet-steward files its own sweep. Decision: make the design match.
4. The steward's "Coder Fleet" project instruction (fleet-steward.md:28, design section 11 line 251) is CF-6; it is folded into this item's plan. Decision: drop the instruction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 board-subagent-stop.sh no longer reads a status field or writes Blocked; the contract tests that referenced that path are updated and bash claude/evals/lib/check-all.sh passes
- [ ] #2 Design section 3 points at the glossary skill instead of carrying the table, and section 8's no-third-copy claim is true
- [ ] #3 Design section 7's To do row matches board-conventions and lead.md
- [ ] #4 fleet-steward.md and design section 11 no longer name a Coder Fleet project; CF-6 closes with this item
- [ ] #5 migration-checklist run over fleet-steward.md, and a version bump in plugin.json and marketplace.json
- [ ] #6 board-conventions skill, hooks/README.md, hooks.json, design section 7 and docs/limits.md all say Blocked is written by TaskCompleted only - when tests fail or a strict gate has no result
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 01:07
---
Plan docs/plans/CF-8.md approved by the human 2026-09-27: v0.25.1, drop BOARD_RUN_STATUS, section 8 port sentence, both TaskCompleted Blocked cases (AC amended), one fleet-steward smoke eval run to set a first baseline, CF-6 closed by its own marker task.
---

author: @SubagentStop
created: 2026-09-27 01:23
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commits, oldest first: `4f39596` Add the approved plan for CF-8; `8b8b275` SubagentStop reads no status and never writes Blocked; `57bd4fd` Say TaskCompleted is the only writer of Blocked; `a3d42a8` Point design section 3 at the glossary skill and align To do with board-conventions; `4d6031b` fleet-steward files board items without naming a project; `59f84c3` v0.25.1: SubagentStop reads no status, and the design points at the glossary.
- R15 red run (old hook, `bash claude/evals/lib/board-hook-contract.sh -v`, exit 1, "57 passed, 2 failed"): `FAIL stop-status-failure-ignored` with exit=0 and log "coder-fleet:scout finished with status failure"; `FAIL stop-completion-reason-ignored` with exit=0 and log "finished with status cancelled". Restoring the old `board-subagent-stop.sh` makes both fail again.
- The first red run used the old R15 fixture, which had `- none` in lower case. The old case only checked a log line, so it never noticed that the handoff was invalid. I changed it to `- None` so the second case sends a valid handoff, as the plan specifies. Then I put `main`'s hook back and re-proved red with the output above, and restored the new hook.
- R15 green (new hook, `-v`, exit 0, "59 passed, 0 failed"): `ok stop-status-failure-ignored`, `ok stop-completion-reason-ignored`.
- The other Phase 1 checks passed. `handoff-parity.sh` exit 0: 29 cases, and the hook and the eval gate agree. `handoff-extractor-parity.sh` exit 0: 132 passed, so the `extract_section` and `validate_handoff` bodies are byte-identical. The grep for leftover `status_raw`, `completion_reason`, `$status` or the old Blocked column in the hook returned nothing (exit 1).
- The Phase 2 grep has two hits and both are deliberate: `hooks/README.md:190` is the plan's own replacement wording, and `docs/limits.md:7` is the gap entry the plan keeps. `hooks.json` still parses with `jq`.
- Phase 3 checks passed: the section 3 table count (`^| Initiative |`) is 0, `gen-glossary-rule.sh --check` is up to date, `roster-contract.sh` is 155/0 and `instruction-file-contract.sh` is 13/0. Design line 167 and the section 10 line were not touched.
- Phase 4 checks passed: no "Coder Fleet" remains in agents, evals or the design; `fleet-steward.md` is 46 lines; the `board-conventions` diff against `main` touches only line 31. Design line 251 had moved to 225 after Phase 3 deleted the table.
- The migration checklist over `fleet-steward.md` passes 1-8 and 14-19, with 9-13 not applicable; the table is above this handoff.
- Eval (`claude/evals/run.sh fleet-steward`, run once on the Phase 4 commit, results in `claude/evals/results/20260927T011428Z/`, gitignored): rubric 62%, first score recorded, baseline unset, not compared. Rubric per prompt: 5/9, 5/8, 5/8 and 1/1. The deterministic checks passed on all four prompts. The verdict is FAIL because the handoff gate failed on all four: "missing heading(s): ## Done, ## Not done, ## Unverified, ## Decisions needed" and "3 other level-2 heading(s), first at line 3: ## What the diff shows". Each run also hit Bash permission denials inside the eval.
- Suite, the only run: `bash /Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a029aed46e75bdfba/claude/evals/lib/check-all.sh > /var/folders/3b/yg6wtc4j12g53bt8mx90jcrc0000gn/T/cf-8-check-all.txt 2>&1` printed exit 0. Grepping the file finds no `FAILED`, and line 337 reads "Every deterministic check passes." The board step ran in full: 68 pass, 0 fail, no network problem.
- The exact brief command, with `${TMPDIR:-/tmp}` and a relative path, was refused by the worktree guard before anything ran. The run above uses the literal value of `TMPDIR` and an absolute script path, so the suite ran once.
---
<!-- COMMENTS:END -->
