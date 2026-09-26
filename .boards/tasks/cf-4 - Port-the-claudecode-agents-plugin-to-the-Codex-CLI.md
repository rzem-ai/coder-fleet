---
id: GPTA-1
title: Port the claudecode-agents plugin to the Codex CLI
status: Blocked by human
assignee: []
created_date: '2026-09-25 01:02'
updated_date: '2026-09-25 10:57'
labels: []
dependencies: []
references:
  - docs/specs/GPTA-1.md
  - docs/plans/GPTA-1.md
type: feature
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Spec out the OpenAI Codex CLI version of the claudecode-agents plugin: the same role-shaped agents, skills, commands and board discipline, re-expressed in Codex's formats. Source fleet (read-only): /Users/alex/Dev/Work/extensions/claudecode-agents. Prior port for precedent: opencode-agents.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @SubagentStop
created: 2026-09-25 01:08
---
Blocked by human. claudecode-agents:spec-writer raised 3 blocker(s). From "## Decisions needed" in its handoff:

- GPTA-1 open question 3. Should the port's hooks go in at user level, where they would also guard Codex sessions outside the fleet (the Fathom case), or at project level only? Planning can't size criteria 15 and 19 until Alex answers.
- GPTA-1 open question 10. Coder cannot be given worktree isolation in Codex. Should v1 run one coder at a time on a feature branch, run coder in a worktree through `codex exec`, or wait for Codex to add it upstream? The answer changes phase execution, `prune-worktrees` and criterion 18.
- GPTA-1 open question 19. The glossary's Maps to column names Claude Code mechanisms, and `CLAUDE.md` forbids editing the generated copy here. Should it get a generator option in claudecode-agents or a hand-kept copy here, which would mean changing `CLAUDE.md`?
---

author: lead
created: 2026-09-25 01:26
---
Human answered the three blockers and Q21 (25 Sep 2026, 11:25 AEST):
- Q3: hooks install at user level (~/.codex/hooks.json) and guard every Codex session on the machine, including non-fleet work.
- Q10: coder in v1 runs serially on a feature branch in the main checkout; PreToolUse refuses commits to the default branch; worktree isolation Deferred; prune-worktrees Dropped.
- Q19: the Codex glossary comes from a generator option in claudecode-agents (gen-glossary-rule.sh), not a hand-kept copy here. That is work in the source repo, outside this board.
- Q21: spike GPTA-1.1 runs before the plan.
- Q20 answered by the lead: skills/board-linear/ in the source is an empty directory, so eight skills to port.
---

author: @SubagentStop
created: 2026-09-25 01:28
---
Blocked by human. claudecode-agents:spec-writer raised 1 blocker(s). From "## Decisions needed" in its handoff:

- GPTA-1 depends on a Codex target being added to `gen-glossary-rule.sh` in claudecode-agents. The work has to be filed in that repo, and criterion 23 can't be met until it lands.
---

author: @SubagentStop
created: 2026-09-25 10:46
---
Blocked by human. claudecode-agents:spec-writer raised 3 blocker(s). From "## Decisions needed" in its handoff:

- GPTA-1 Q22. An untrusted Codex hook is skipped silently, so an untrusted fleet enforces nothing and gives no warning. Recommended: install the fleet's hooks as managed hooks in `requirements.toml` if a check after the 29 Sep reset shows that works on 0.156.1; otherwise keep `~/.codex/hooks.json` and add a `codex` wrapper that refuses to launch while any fleet hook is untrusted. Managed hooks would move the location Q3 decided, though they serve its intent better.
- GPTA-1 Q7. Should `spec-to-plan` and `review-round` become skills the lead follows, or a script driving `codex exec`? Recommended: skills, with SubagentStop holding the reviewer's verdict to a set format; they are cheaper on quota and add no second runtime, at the cost of review-round's determinism.
- GPTA-1 Q9. ChatGPT sign-in, whose quota becomes the eval budget, or an API key that costs money per run? Recommended: stay on the ChatGPT sign-in and batch the live checks, since that is the setup the spike already ran on.
---

author: lead
created: 2026-09-25 10:52
---
Human answered two of spec-writer's revision blockers (25 Sep 2026, 20:52 AEST):
- Q7: spec-to-plan and review-round become explicit-only skills the lead follows, human gates as hard stops, SubagentStop holding the reviewer verdict to a required shape. No codex exec orchestration script.
- Q9: the fleet and its evals run on the ChatGPT sign-in; live checks and evals are batched and kept small to fit the plan quota.
- Q22 (untrusted hooks are a silent no-op): still open, human asked what the wrapper option is.
---

author: lead
created: 2026-09-25 10:57
---
Human answered Q22 (25 Sep 2026, 20:56 AEST): README warning only. The port documents the one-time /hooks trust step and that an untrusted hook is silently skipped, with no codex wrapper and no requirements.toml managed hooks. Hooks stay at ~/.codex/hooks.json per Q3. GPTA-1.2 acceptance criterion 4 (managed hooks) is no longer load-bearing for GPTA-1.
---
<!-- COMMENTS:END -->
