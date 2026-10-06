---
id: CF-148
title: 'Teach lead.md the build phase, and make an unparseable config mean harden'
status: In Progress
assignee: []
created_date: '2026-10-06 10:54'
updated_date: '2026-10-06 11:10'
labels: []
dependencies: []
references:
  - CF-145
  - claude/coder-fleet/agents/lead.md
  - claude/coder-fleet/hooks/lib/fleet-config.py
  - claude/coder-fleet/workflows/review-round.js
  - claude/coder-fleet/scripts/fleet-agents.sh
priority: High
type: enhancement
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human on 2026-10-06 from CF-145's review follow-ups, by AskUserQuestion: (b) "Yes, add the line": lead.md step 4 gets one sentence on how to read 'refutation skipped by build phase'; (c) "Unparseable means harden": a .claude/coder-fleet.json that exists but cannot be parsed means harden, like a failed read, with the parse error reported. The human also chose to keep this repo in build (no config file).

Why: build is now everyone's default (CF-145, v0.37.2), and lead.md step 4 still says a refuter runs on every code-path change, so the lead can read a build-phase approval as missing its refuter, or a refuter-free approval as complete without knowing why. And an unparseable file today reads as build with phaseState 'default', so a human who typed harden with a trailing comma gets the lenient phase; the reviewer found the parity fixtures pin that ('{\"phase\": \"harden\"' -> build|default).

Both readers are claude/coder-fleet/hooks/lib/fleet-config.py (via fleet-config.sh) and fleetConfigFrom in claude/coder-fleet/workflows/review-round.js, kept in parity by fixtures in claude/evals/lib/workflow-logic.mjs. scripts/fleet-agents.sh prints the phase; its message on an unparseable file is wrong today (reviewer low).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md step 4 says, in one sentence, that in build phase the refuter runs only on authentication or credential paths, and a review-round stop of 'refutation skipped by build phase' counts as the review being complete; lead.md keeps six steps and its line limit, and the migration checklist is run over it
- [ ] #2 A .claude/coder-fleet.json that exists but does not parse (trailing comma, BOM, truncated, not an object) means harden in both readers, with phaseState unread and a reason naming the parse failure; an absent file and an unknown phase value in a parsed file still mean build
- [ ] #3 The parity fixtures that pin unparseable files to build are changed to harden, each seen failing first, and both readers agree on every fixture
- [ ] #4 /coder-fleet:agents phase on an unparseable file says the file could not be read and the phase is taken as harden
- [ ] #5 check-all is green and the version is bumped
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

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-06 10:57
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-5. Version 0.37.3 assumed. CF-66/126 waits behind this one because both touch review-round.js.

Done: nothing yet; lead.md does not mention the build phase, and a config with a typo reads as build.
Not done: the lead.md sentence, the parse-failure rule in both readers, the fixtures, the agents command message.
---

author: @SubagentStop
created: 2026-10-06 11:10
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commit `5dbc501` "Read an unparseable fleet config as harden in both readers (CF-148)" changes `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a51f94ef518748b8c/claude/coder-fleet/hooks/lib/fleet-config.py` (new `unparsed()`), `.../claude/coder-fleet/hooks/lib/fleet-config.sh` (now accepts `harden|unread` and its reason), `.../claude/coder-fleet/workflows/review-round.js` (a new `unparsed` closure inside `fleetConfigFrom`), `.../claude/evals/lib/workflow-logic.mjs`, `.../claude/evals/lib/agents-command-contract.sh`, and the phase sentences in `README.md` and `docs/fleet-design.md`.
- Criterion 2: a config file that exists but does not parse to a JSON object now gives phase `harden`, phase state `unread`, in both readers. The cases are a trailing comma, a byte order mark, a truncated file, a non-object top level, nesting past 64 levels, and an empty file. The reason names the parse failure, for example `.claude/coder-fleet.json could not be read as JSON (the file is empty or not valid JSON), so the phase is taken as harden`. An absent file is still `build|default`, and an unknown phase in a file that parses is still `build|invalid`; the existing fixtures for both pass unchanged.
- The decision you asked for: an unparseable file still voids `disabledAgents`. Its state stays `invalid`, so nothing in its list is honoured; only the phase default changed. The fixture `{"phase": "build", "disabledAgents": ["refuter"],}` pins this, giving `invalid|` and `harden|unread`.
- Criterion 3: the 21 fixtures that pinned unparseable files to `build|default` now say `harden|unread`. Two were added: the voided list above, and a `null` file. The unread phase reason is pinned to contain the parse reason.
- Criterion 3, review-round runs: four were added (trailing comma, BOM, truncated, not an object, each file saying `build`). Each checks harden, a refuter on an ordinary diff, and the log line.
- Criterion 3, seen failing first: workflow-logic went 600 passed, 13 failed (the 12 new `failed-read-*` checks plus `fleet-config-parity-phase-answers`), then 613/0 after the reader change. The readers agree on every fixture: `fleet-config-parity`, `-reasons`, `-phase` and `-phase-reasons` all pass. Reverting either reader's `unparsed` path makes these tests fail.
- Criterion 4: `/coder-fleet:agents phase` on an unparseable file now prints "The phase is harden: .claude/coder-fleet.json could not be read as JSON (...), so the phase is taken as harden" and exits 1. Before, it said "The phase is build, the default". `fleet-agents.sh` needed no edit, because its unread branch was already there and the readers now reach it.
- Criterion 4, seen failing first: four new agents-command cases (trailing comma, BOM, truncated, `["build"]`) went 87 passed, 5 failed, then 92/0. The fifth failure was the suite's own nested rerun.
- Commit `6912202` "Tell the lead how to read a build-phase review (CF-148)". Criterion 1: `lead.md` step 4 gains one sentence right after the `refutation skipped by config` one. It says that in the build phase, the default unless `.claude/coder-fleet.json` sets `harden`, `review-round` runs a refuter only on authentication or credential paths, and its `refutation skipped by build phase` stop counts as the review being complete.
- Criterion 1, structure: `lead.md` still has six steps and 49 lines, and roster-contract passes (155/0). No phrase check was added.
- Criterion 1, migration checklist: I ran its mechanical checks over `lead.md` with a scratchpad script. They covered YAML keys, skills present, name, model and effort against the roster row, four H2 sections, and no dashes, emojis, scaffolding or hard wraps. The 20-row table is in the PR body.
- Commit `a35b154` "v0.37.3: an unparseable fleet config means harden, and the lead reads a build-phase review (CF-148)" moves both `plugin.json` and `marketplace.json` to 0.37.3.
- Criterion 5: `bash claude/evals/lib/check-all.sh` ran once, on the version-bumped tree just before the release commit, with board node_modules linked in. It exited 0, total 159.1 s, "Every deterministic check passes." The board section had 301 pass and 0 fail. The link was removed before committing.
- Baselines before any edit: workflow-logic 601/0, agents-command 88/0.
---
<!-- COMMENTS:END -->
