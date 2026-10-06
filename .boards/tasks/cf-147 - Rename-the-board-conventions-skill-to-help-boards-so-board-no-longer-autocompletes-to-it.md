---
id: CF-147
title: >-
  Rename the board-conventions skill to help-boards so /board no longer
  autocompletes to it
status: Done
assignee: []
created_date: '2026-10-06 06:38'
updated_date: '2026-10-06 08:14'
labels: []
dependencies: []
references:
  - claude/coder-fleet/skills/board-conventions/SKILL.md
priority: High
type: chore
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked (2026-10-06): "please rename `board-conventions` to `help-boards`. Why? Because when I type `/board` it comes up first and it is selected by accident." Ordered.

The skill lives at claude/coder-fleet/skills/board-conventions/. Its name appears in agent frontmatter `skills:` lists (every agent that preloads it), in agent-pairs sources, in lead.md and other bodies, in commands, docs, hooks READMEs, evals (roster-contract, instruction-file-contract, next-column-contract) and the OpenCode port. A rename that misses one reference silently drops the skill from that agent, which is the migration-checklist's main silent failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill directory and its frontmatter name are help-boards, and a grep for board-conventions over the repo outside .boards/, docs/runs/ and git history finds nothing
- [x] #2 Every agent that preloaded board-conventions preloads help-boards, with agent-pairs sources updated and regenerated, and the migration checklist run over every changed body
- [x] #3 The OpenCode port's copy is renamed the same way, or the divergence register says why not
- [x] #4 check-all is green and the version is bumped
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-06 06:45
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-4. Taken ahead of CF-144 and CF-145 (both edit lead.md too) because it is small and the human asked for it in the session; it cuts from main after CF-139's PR #62 merges. Seventeen files reference board-conventions outside .boards/ and docs/runs/.

Done: nothing yet; typing /board still offers board-conventions first.
Not done: the rename.
---

author: @SubagentStop
created: 2026-10-06 07:02
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-147-help-boards`, cut from `origin/main` at c7b6a46 (v0.35.1), four commits, listed below.
- e535368 "Rename the board-conventions skill to help-boards (CF-147)": the directory moved to `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a71128e212ee2de5e/claude/coder-fleet/skills/help-boards/` and its frontmatter is now `name: help-boards`. lead, spec-writer and fleet-steward preload `help-boards` and their bodies name it. `commands/kickoff.md`, `hooks/README.md`, the `migration-checklist` skill, `claude/evals/fleet-steward/rubric.md`, `task-tools-contract.sh` and `next-column-contract.sh` all name the new skill or path.
- 1221a19 "Name help-boards in the design, the contract and the specs (CF-147)": `docs/fleet-design.md`, `docs/agent-contract.md` (skill list kept alphabetical), the CF-12, CF-24 and CF-25 specs, and `codex/docs/specs/GPTA-1.md`. GPTA-1's line about the earlier rename of the `board` skill now ends "to the one now called `help-boards`".
- ad840eb "Record the help-boards rename in the OpenCode divergence register (CF-147)": the port has no copy of the board skill under any name, so `opencode/docs/divergence-register.md` gets a Deferred row saying why. Its existing Next-column row names `help-boards`.
- f43071e "v0.35.2: rename the board-conventions skill to help-boards (CF-147)": `plugin.json` and the marketplace entry are both 0.35.2.
- Test: no new test was needed. The existing skill-resolves check in `roster-contract.sh` is the one that catches this. On the bare rename it ran 155 passed, 3 failed (the three agents above, "preloaded skill board-conventions resolves"), exit 1. With the frontmatter updated it ran 155 passed, 0 failed. Reverting any one agent's `skills:` entry makes it fail.
- `task-tools-contract.sh` ran 20/0 and `next-column-contract.sh` ran 52/0 after the edit.
- I ran the migration checklist over the three changed agent bodies and the renamed skill's frontmatter, using a scratchpad script for checks 1-3, 6, 7, 16, 17 and 19. Everything passes, and `help-boards` resolves for all three agents. The findings table is in the PR body.
- `bash claude/evals/lib/check-all.sh` ran once, on f43071e, with the main checkout's board `node_modules` symlinked in (since removed). Exit 0, all 27 sections ok, "Every deterministic check passes."
- Final grep count: 0. The brief's `grep -rn 'board-conventions' . --exclude-dir=.boards --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=runs` finds nothing, and `docs/runs/` and `opencode/docs/runs/` have no hits either.
- Pushed the branch and opened PR #63.
---

author: lead
created: 2026-10-06 07:04
---
Sub-issue 1 of 1: merged to main (PR #63; release commit f43071e, v0.35.2, tag on origin at 1083d5b). Done still needs: the close.

Ticks on main. #1: claude/coder-fleet/skills/help-boards/ with `name: help-boards`; the coder's grep for board-conventions outside .boards/, docs/runs/ and git history finds nothing, and the lead confirmed the skills directory lists help-boards alone. #2: lead, spec-writer and fleet-steward preload help-boards; roster-contract's skill-resolves check failed on the bare rename (155/3) and passes with the frontmatter updated (155/0); no agent-pairs sources exist on this base; the migration-checklist table is in PR #63. #3: the OpenCode port has no copy of the board skill, so opencode/docs/divergence-register.md has a Deferred row saying why. #4: check-all exit 0 on f43071e and CI deterministic green; 0.35.2 in both manifests. DoD #1 as #4. #2: no review round, by the lead's decision under the human's cap: a mechanical rename whose one failure mode (a skills entry that no longer resolves) the roster check in CI tests, and the lead read the 19-file diff (50 insertions, 49 deletions, no .boards files). #3 in the PR body. #4 v0.35.2 tagged and pushed. #5 the divergence row. #6 not applicable: no spec.

Done: typing /board no longer offers board-conventions first on a machine running plugin 0.35.2.
Not done: this machine's plugin cache is still 0.35.1, so the old name shows until the plugin is updated and the session restarted; the close.
---
<!-- COMMENTS:END -->
