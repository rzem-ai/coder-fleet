---
id: CF-111
title: 'Let a project disable fleet agents, starting with the refuter'
status: In Progress
assignee: []
created_date: '2026-10-04 08:55'
updated_date: '2026-10-04 08:57'
labels: []
dependencies: []
priority: Medium
type: feature
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's words (2026-10-04): "can we add a feature to disable certain agents. first test case is to be able to enable/disable the refuter from being part of the development flow".

A general mechanism for switching individual fleet agents off, proven first on the refuter. Spec to follow (docs/specs/<id>.md) once the design questions are answered; criteria below are provisional, written from the human's words.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A project can mark the refuter disabled, and while it is disabled no part of the development flow (the lead's escalation policy, review-round, any other workflow) spawns a refuter
- [ ] #2 Re-enabling the refuter restores today's behaviour with no other change
- [ ] #3 The mechanism is general: disabling another agent uses the same setting, not a refuter-specific switch
- [ ] #4 A PreToolUse hook denies an Agent spawn whose subagent type is on the project's disabled list, with a message naming the config file, and has a contract test under claude/evals/lib/
- [ ] #5 Listing lead, coder or reviewer as disabled is rejected, and the rejection is tested
- [ ] #6 The refuter DoD default and lead.md step 4 both say what happens when the refuter is disabled (no substitute gate run), and README or fleet-design documents the config file
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
author: lead
created: 2026-10-04 08:57
---
Decisions from the human, 2026-10-04 session (the coder builds from these):
1. Location: a committed project-level fleet config file in the repo. Each project chooses; no user-level setting.
2. Enforcement: advisory AND hard. The lead body and every workflow read the disabled list and do not spawn a disabled agent; a PreToolUse hook also denies an Agent spawn of a disabled type, with a message naming the config file.
3. Fallback when the refuter is disabled: skip entirely. No substitute independent gate run is commissioned in its place (review-round with refute disabled does not swap in extra gate lanes beyond what it runs for a non-refuter change today; the lead does not run the gates in its stead).
4. Scope: any agent may be disabled except lead, coder and reviewer; an attempt to disable one of those is rejected (hook and check-all both say so).
Knock-on to handle: the default DoD item 'a refuter round ran where lead.md step 4 calls for one' must read as satisfied when the project has disabled the refuter.
---

author: @SubagentStop
created: 2026-10-04 08:57
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- Spawn paths: `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/agents/lead.md:30` (roster line): "`refuter` to run and try to break a change before it is called done"
- `lead.md:32` (step 4): "Spawn `refuter` against the change when it touches authentication, authorisation, secrets or data writes ..., when the item is High, or when a reviewer suspects a test would pass with the fix reverted"
- `lead.md:32` (default): "On any other change no refuter runs: `review-round`'s tests and types-and-build lanes run the gates, with `refute: false` passed when `fix: true` is"
- `lead.md:32` (self-build and budget): "spawn a `refuter` instead, whose baseline runs the full gates"; "A `refuter` round is 20 minutes and a hook stops it at 25"
- `lead.md:49`: "A `reviewer`'s `must fix:` and a `refuter`'s `survived:` Done bullets are findings for you to route to a fix round"
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/workflows/review-round.js:114`: `const REFUTER = 'coder-fleet:refuter'`
- `review-round.js:116`: `const SENSITIVE = /(auth|authz|authn|login|...|vault)/i`
- `review-round.js:213`: `ACCEPTED_KEYS` includes `'refute'`
- `review-round.js:270`: `const refute = input.refute === true || (autoFix && input.refute !== false)`
- `review-round.js:103-107`: "Only a JSON false turns it off under fix: true (a string "false" keeps the refuter), and a round whose changed files match SENSITIVE refutes under fix: true regardless."
- `review-round.js:948`: `sensitiveFiles = scope.files.filter((f) => SENSITIVE.test(f))`
- `review-round.js:1113`: `if (!refute && !(autoFix && sensitive)) {` then `stopped = 'clean'`
- `review-round.js:1117-1118`: "refute: false was passed, but under fix: true this round touches sensitive paths, so a refuter runs anyway"
- `review-round.js:1124` and `:1141`: `{ agentType: REFUTER, phase: tag + ' refutation', label: tag + ' refutation' }`. This is the only `agentType` refuter spawn in any workflow.
- `review-round.js:994`: "Under refute: false these two lanes are the item's independent gate run"
- `review-round.js:1404-1407`: `const gatesUnrun = stopped === 'clean' && !last.refutation && gatesMissing.length > 0`
- `review-round.js:1478-1483`: result guidance strings for `refuted`, `'refuter raised a blocker'` and `'refutation returned nothing'`
- `review-round.js:1532-1533`: `refuted: ...` and `refutation: (last.refutation || null)`
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/workflows/deep-research.js:223,258`: "refuted" is a claim verdict enum only. No refuter agent is spawned there. `spec-to-card.js` has no match.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/commands/kickoff.md:12`: "The coder-fleet agents are available (`scout`, `spec-writer`, `coder`, `reviewer`, `refuter`, ... appear as `coder-fleet:` agent types)"
- The other commands (`board.md`, `init.md`, `prune-worktrees.md`, `work.md`) have no refuter match.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/agents/reviewer.md:30`: "where `refuter` also runs on this change, it is the authority on the question"
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/skills/looping/SKILL.md:3`: "Preloaded into refuter and coder."
- `looping/SKILL.md:19`: "For a refuter the count and the wall-clock are both fixed: at most eight mutants ... 20 minutes from its spawn"
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/skills/handoff/SKILL.md:92`: "The rotation tests were not run; refuter should run them."
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/agents/refuter.md:2`: `name: refuter`
- Hooks: `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/hooks.json:38`: `"matcher": "^(coder-fleet:)?(lead|scout|spec-writer|coder|scripter|reviewer|ui-designer|tech-writer|researcher|fleet-steward|refuter)$"`
- `hooks.json:30` and `:88` register `agent-clock.sh` (SubagentStart and PreToolUse on every tool). `hooks.json:75,79` register `enforce-agent-scope.sh` on `Write|Edit|MultiEdit|NotebookEdit|Bash`.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/agent-clock.sh:82`: `refuter) printf '1200 1500\n' ;;`
- `agent-clock.sh:91`: `refuter) printf 'Never run past 20 minutes of wall-clock from your spawn.' ;;`
- `agent-clock.sh:143`: `# A plugin agent can arrive as "refuter" or as "coder-fleet:refuter".`
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/enforce-agent-scope.sh:1995`: `REFUTER_ALLOWED_GIT=" log show blame diff ls-files status shortlog describe rev-parse rev-list cat-file grep whatchanged "`
- `enforce-agent-scope.sh:1997`: `enforce_refuter() {`
- `enforce-agent-scope.sh:2106`: `spec-writer|ui-designer|tech-writer|fleet-steward|refuter)`
- `enforce-agent-scope.sh:2116-2124`: refuter denies when python3 or the checker is missing.
- `enforce-agent-scope.sh:2143`: `refuter)       enforce_refuter ;;`
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/lib/check-write-scope.py:53`: `ROLES = {'spec-writer', 'ui-designer', 'tech-writer', 'fleet-steward', 'refuter'}`
- `check-write-scope.py:127`: `if role == 'refuter':`
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/README.md:13,204,290,317` document the matcher, the clock and the refuter branches. `/Users/alex/Dev/Work/extensions/coder-fleet/docs/limits.md` has 16 refuter matches (e.g. `:35`). The other hooks (`board-subagent-start.sh`, `board-subagent-stop.sh`, `board-agent-return.sh`, `board-task-completed.sh`) have no refuter match.
- Definition of Done: `/Users/alex/Dev/Work/extensions/coder-fleet/.boards/config.yml:14`: `- "The reviewer approved, and a refuter round ran where lead.md step 4 calls for one"`
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/templates/board.config.yml:12-16`: the seeded defaults have no refuter line ("A reviewer approved the change").
- `claude/coder-fleet/commands/init.md:43`: "the human changes it by editing that list in `.boards/config.yml`"
- `claude/coder-fleet/board/src/test/dod-defaults-config.test.ts:20`: the refuter DoD string appears in a test.
- `claude/coder-fleet/scripts/board-backfill.sh:7,89` backfills `definition_of_done`.
- Roster and consistency checks: `/Users/alex/Dev/Work/extensions/coder-fleet/claude/evals/lib/check-all.sh:89`: `run roster-contract     "$LIB_DIR/roster-contract.sh"`
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/evals/lib/roster-contract.sh:65`: `ALL_AGENTS_LIST=" $(sed -n 's/^ALL_AGENTS="\(.*\)"/\1/p' "$RUN_SH") "`
- `roster-contract.sh` checks per agent: the hooks.json matcher via `grep -q "[(|]$agent[|)]"`, an `evals/$agent` directory, 3 to 5 prompts, ALL_AGENTS membership (`:121-125`), a README table row (`:58`) and a design-doc row with matching model and effort (`:133-149`).
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/evals/run.sh:59`: `ALL_AGENTS="lead scout spec-writer coder scripter reviewer ui-designer tech-writer researcher fleet-steward refuter"`
- `/Users/alex/Dev/Work/extensions/coder-fleet/README.md:27`: the refuter table row.
- `/Users/alex/Dev/Work/extensions/coder-fleet/docs/fleet-design.md:37,45,49,182`: roster row, lead escalation text, refuter paragraph and agents directory listing.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/evals/lib/lead-rules-contract.sh:14-19`: the `high-trigger` and `floor-defers` checks on lead step 4's refuter sentences.
- Also referencing the refuter: `scope-hook-contract.sh` (138 matches), `board-hook-contract.sh` (28), `workflow-logic.mjs` (117), `claude/evals/lead/rubric.md` (4), `claude/evals/refuter/` and `claude/evals/fixtures/refuter-app/`.
- Existing configuration: `plugin.json` (version 0.29.0) has no `userConfig` key.
- `/Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/templates/project-settings.json` has four keys: `agent`, `env.CLA

[Cut to fit a board comment. The other 3166 characters, and this text in full, are in /Users/alex/.local/state/coder-fleet/archives/09dbd940-2d76-4832-a9b5-76193f294ba0/20261004T085736Z-coder-fleet_scout.md]
---
<!-- COMMENTS:END -->
