---
id: CF-111
title: 'Let a project disable fleet agents, starting with the refuter'
status: In Progress
assignee: []
created_date: '2026-10-04 08:55'
updated_date: '2026-10-04 09:55'
labels: []
dependencies: []
priority: Medium
type: feature
ordinal: 142000
---

## Actions for Human
<!-- ACTIONS:BEGIN -->
- [x] #1 Reviewer must-fix: the branch under review can disable its own refuter, because review-round and the hook read .claude/coder-fleet.json from a working tree. Which copy should count: the main checkout's live file with self-exemption blocked (toggles stay instant), only the committed copy on the base branch (toggles need a commit), or a hybrid?
<!-- ACTIONS:END -->

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
- [ ] #7 Changing `.claude/coder-fleet.json` takes effect on the next spawn with no session restart: the hook re-reads the file on every Agent call (no caching across calls), proven by a contract test that flips the file between two hook invocations
- [ ] #8 The hook, review-round and the CF-111.1 command all read `.claude/coder-fleet.json` from the repository's main worktree, never a linked worktree or the call's cwd, and review-round refuses to skip the refuter when the reviewed range changes that file; both are tested
- [ ] #9 The shell helper and review-round's JS reader give the same answer on every input, including multi-value JSON streams, a leading BOM, non-ASCII names and whitespace (refused as invalid by both), embedded newlines, and padded prefixed entries; the parity test carries each as a fixture
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

author: lead
created: 2026-10-04 08:58
---
Design (lead, from scout's map 2026-10-04):
- Config: new committed file `.claude/coder-fleet.json`, key `disabledAgents` (array of bare agent names, `coder-fleet:` prefix accepted). Absent file or key = everything enabled, today's behaviour. Nothing existing fits: `.boards/config.yml` is board-only, `~/.config/coder-fleet/board.env` is user-scope, plugin.json has no userConfig.
- Hard deny: a new PreToolUse hook on `Agent` (registered in hooks.json) denies a spawn whose subagent_type, bare or `coder-fleet:`-prefixed, is listed, naming `.claude/coder-fleet.json` in the message. Listing lead, coder or reviewer makes the hook report the config invalid rather than honouring it. Not native `permissions.deny Agent(...)`: it cannot reject core agents or name our file, and it is untested against workflow agent() spawns (CF-12.1 tested tool calls only).
- review-round: today it spawns the refuter at review-round.js:1124/1141 and forces one on SENSITIVE paths under fix:true (:1113-1118). With the refuter disabled it must never spawn one, sensitive or not, and the result must say the refutation was skipped because the project disabled it (not 'clean' by omission). The workflow should learn the list itself (e.g. through its existing pin lane reading the file) so it does not depend on the lead passing it.
- Lead body step 4, reviewer.md:30, the `.boards/config.yml` DoD line and templates: say a disabled refuter means no refuter round and no substitute gate run (the human's decision 3).
- Checks: roster-contract keeps passing with the refuter listed; a new contract test covers the hook; workflow-logic.mjs covers review-round with the refuter disabled.
- OpenCode port: out of scope here; a divergence-register row records the gap.
---

author: lead
created: 2026-10-04 08:59
---
Sub-issue 1 of 1 filed: CF-111.1, the `/coder-fleet:agents` command (the human's order, 2026-10-04). The CF-111 coder was told to keep `disabledAgents` parsing and validation in a shared helper under hooks/lib/ so the command's script reuses it. CF-111.1 is built on the CF-111 branch after the CF-111 coder hands back, and the two ship together as 0.30.0. Done for CF-111 still needs: coder handoff, review, refuter round, merge.
---

author: lead
created: 2026-10-04 09:00
---
The human asked (2026-10-04) whether toggling needs a restart. Decision: no restart for a toggle. The hook reads the file per call, review-round reads it at the start of each run (an in-flight run keeps what it read), and the lead checks the file before routing to an optional agent. Only installing the release needs a new session, since hooks and commands load at start. Criterion #7 added.
---

author: lead
created: 2026-10-04 09:08
---
A background commit security review flagged the coder's in-progress review-round.js change as an 'authorization-bypass / security-control downgrade'. The notification carried a summary line only, with no file lines or detail. Lead reading: the flagged behaviour is the human's decision 3 working as designed. A committed `.claude/coder-fleet.json` listing the refuter suppresses the refuter even on SENSITIVE (auth/secrets) paths under fix:true, with no substitute gate run. That is intended, not a bug. For the reviewer: (a) confirm the override is reachable only through the committed project file, not through a workflow input, an env var or a malformed or partial file (a parse failure must fail closed, i.e. treat the refuter as enabled); (b) confirm review-round's result states plainly that a sensitive round skipped refutation by config, so the downgrade is never silent.
---

author: @SubagentStop
created: 2026-10-04 09:18
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Branch `cf-111-disable-agents` in worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a44a32051d99bf8bb`. I checked `git rev-parse --git-common-dir` before writing anything: this is a linked worktree, not the main checkout.
- `450cd7e` Deny an Agent spawn of a type listed in .claude/coder-fleet.json (criteria 3, 4, 5 and 7).
- New hook `claude/coder-fleet/hooks/enforce-disabled-agents.sh`, registered for `Agent|Task` in `hooks.json`. It accepts the type bare or `coder-fleet:`-prefixed, and leaves another plugin's agent of the same name alone.
- The hook reads the file on every call and caches nothing, so an edit counts on the next spawn. It has a `--check [dir]` mode that exits 1 on an invalid file, and `check-all.sh` runs that on this repo as `fleet-config`.
- The reading and validation live in a separate sourceable helper, `claude/coder-fleet/hooks/lib/fleet-config.sh`, as the lead asked, so the CF-111.1 command can reuse it.
- Listing lead, coder or reviewer makes the file invalid. An invalid file (that, or broken JSON, or the wrong shape) honours nothing, and every spawn carries a warning naming the file and the reason.
- New test `claude/evals/lib/disabled-agents-contract.sh` (54 checks), wired into `check-all.sh`. It includes the flip test for criterion 7: deny, remove the entry, allow, restore, deny, delete the file, allow. I watched it fail before the hook existed: `hook-exists`, 0 passed, 1 failed.
- `b3947bf` review-round: skip the refuter when the project disables it (criteria 1, 2 and 6).
- The pin lane now also reports the file's text (`fleetConfig` is required in its schema), and the script reads it with the same rules as the helper. No new input key, so `ACCEPTED_KEYS` is unchanged.
- A round that would have spawned a refuter stops as `refutation skipped by config` instead, with `refutationSkipped` saying why. Its next step says no substitute gate run is owed. The approval and gate-lane rules are the same as for any change that gets no refuter, and no lanes are added.
- The result now always carries `fleetConfig` (state: absent, ok, invalid or unread) and `disabledAgents`.
- New `workflow-logic.mjs` cases cover the refuter disabled under the `fix: true` default, `refute: true`, a sensitive round, and a fix round that adds a sensitive path. They also prove that no file, an empty list, or another agent listed refutes exactly as today. A parity test runs 15 fixture files through both the shell helper and the workflow and requires the same answer. Before the change: 23 failed. After: 384 passed, 0 failed.
- `72db223` Say what a disabled refuter means in the lead, reviewer, DoD and docs (criterion 6).
- `lead.md` step 4 has a new sentence: no refuter, nothing in its place, including where step 4 would send a refuter to run a missing gate. `reviewer.md` step 5 says the same.
- The `.boards/config.yml` Definition of Done line now reads as satisfied when the refuter is disabled. I updated `claude/coder-fleet/board/src/test/dod-defaults-config.test.ts`, which pins that line, to match.
- `lead-rules-contract.sh` has a new `disabled-refuter` guard with three mutants, all of which it catches. Against the old lead body it fails (exit 1).
- Documentation updated: `README.md`, `docs/fleet-design.md` section 4, the hooks README (new section and decision item 25), `docs/limits.md`, and a Deferred row in `opencode/docs/divergence-register.md` (OpenCode not ported).
- `e7e635f` v0.30.0: the version is now 0.30.0 in `plugin.json` and `.claude-plugin/marketplace.json`.
- `bash claude/evals/lib/check-all.sh`, run once with output in the scratchpad `check-all.txt`: exit 0, "Every deterministic check passes". That includes disabled-agents 54/0, workflow-logic 384/0, lead-rules 13/0, roster-contract ok and board 232 pass / 0 fail. The worktree is clean afterwards.
- `migration-checklist` over `lead.md` and `reviewer.md` (frontmatter not touched by this change). Check 1: both parse, with the same key lists as before. Check 3: `skills` is a list. Checks 16 and 17: lead.md is 49 lines and reviewer.md 43, under the 60-line limit, each with the four H2 sections in order. Check 19: no en or em dashes, no hard wraps, no US spellings in prose. Checks 9 and 18: no checking scaffolding, no conditional model logic, no board writes.
- One `migration-checklist` finding that was already there before this change: `lead.md` has no `tools` key (check 8). Check 11 (re-running effort) and the paid smoke evals were not run.
---

author: lead
created: 2026-10-04 09:18
---
Build handed back: branch `cf-111-disable-agents`, 4 commits (450cd7e hook, b3947bf review-round, 72db223 docs, e7e635f v0.30.0), not on main. Coder reports check-all green (disabled-agents 54/0, workflow-logic 384/0). Next: reviewer and refuter in parallel; CF-111.1 builds on this branch meanwhile. Done still needs review, refuter round, any fixes, PR, merge, tag. Coder proposals: workflows other than review-round have no fallback for a disabled agent, filed as CF-112 (not ordered); refusing misspelt names is already CF-111.1 criterion #4.
---

author: @SubagentStop
created: 2026-10-04 09:23
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. I reviewed `main...cf-111-disable-agents` (450cd7e, b3947bf, 72db223, e7e635f) against CF-111's seven criteria and comment #1's four decisions, covering the hook, `lib/fleet-config.sh`, the review-round changes, the workflow-logic cases, the parity test, the contract test's structure, and the lead, reviewer, DoD and docs prose.
- must fix: claude/coder-fleet/workflows/review-round.js:717 - the pin lane reads `.claude/coder-fleet.json` from the working tree it runs in, not the pinned base commit, so a branch under review (or an uncommitted file) can disable its own refuter on sensitive paths. Read the base commit's copy, or refuse the skip when the reviewed range touches the file.
- should fix: claude/coder-fleet/hooks/enforce-disabled-agents.sh:104 - the hook resolves the file from the call's cwd working tree, so a lead whose cwd is in a coder's worktree has its refuter spawn governed by the branch's uncommitted copy.
- should fix: claude/coder-fleet/hooks/lib/fleet-config.sh:77 - jq processes multi-value JSON streams, so `{"disabledAgents":["refuter"]} {"disabledAgents":["lead"]}` disables the refuter in the hook and passes `--check`, while review-round calls it invalid.
- should fix: claude/evals/lib/workflow-logic.mjs:2224 - the parity fixtures are ASCII-only and single-value, so they miss the U+FEFF, U+0085, BOM, embedded-newline and stream divergences.
- low: claude/coder-fleet/workflows/review-round.js:1207 - the skip reason says `fix: true` and omits the sensitive files when both applied.
- low: claude/coder-fleet/hooks/lib/fleet-config.sh:65 - a directory at the config path is `unreadable` in shell and `invalid` in JS; both honour nothing, so only the label differs.
- Questions 3, 4 and 6 answered: the skip is always visible, the flagged variables are all used, and unknown names belong to CF-111.1.
- Run article returned above this handoff for the lead to save as `docs/runs/2026-10-04-reviewer-CF-111.md`.
---

author: @SubagentStop
created: 2026-10-04 09:26
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline gates: `bash claude/evals/lib/check-all.sh` in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/09dbd940-2d76-4832-a9b5-76193f294ba0/scratchpad/refuter-1791105539/base`, 335s, exit 1. Only task-tools failed, on 2 "is committed" checks, because the copy has no `.git`. The disabled-agents, fleet-config and workflow-logic steps were ok. Narrow baselines: contract 54/0 exit 0 (4s), workflow-logic 384/0 exit 0 (1s).
- Budget: 8 mutants, 20 minutes. Used 8 mutants and about 8 minutes. All mutants ran in parallel in copies `m1` to `m8` under the scratch directory above.
- killed M1, helper caches the parsed result in `$TMPDIR` keyed on the file's mtime in seconds: contract exit 1, 13 failed. The flip cases failed, and so did earlier ones from same-second writes.
- killed M2, core check in the jq program replaced with `elif false then`: contract exit 1 (16 failed), workflow-logic exit 1 (parity).
- killed M3, a file listing a core agent turns into `ok` with the non-core names honoured: contract exit 1 (11 failed), workflow-logic exit 1 (parity).
- killed M4, `name="$raw"` instead of `fleet_config_normalise` in `fleet_agent_disabled`: contract exit 1 (5 failed). That function lives in `hooks/lib/fleet-config.sh`, not in the hook script.
- killed M6, `stopped = "clean"` instead of `REFUTATION_SKIPPED`: workflow-logic exit 1 (6 failed).
- killed M7, `if (refuterDisabled && refute)`, so the sensitive path ignores the disabled list: workflow-logic exit 1 (3 failed, including disabled-beats-sensitive-force).
- killed M8, `--check` exits 0 on an invalid file: contract exit 1 ("--check fails when a core agent is listed").
- survived: `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a44a32051d99bf8bb/claude/coder-fleet/workflows/review-round.js` lines 318-319, `const low = n.toLowerCase()` / `return (low.startsWith('coder-fleet:') ? low.slice('coder-fleet:'.length) : low).trim()` - the parity test never sees an entry that is both padded and prefixed, so review-round can call `" coder-fleet:refuter"` invalid and spawn a refuter while the hook denies it. Confirmed: workflow-logic exit 0, 384/0. Adding the fixture `'{"disabledAgents": [" coder-fleet:refuter"]}'` to the parity list kills it (exit 1, `shell: ok|refuter, js: invalid|`) and passes on the clean code (exit 0).
- Reviewer-kind finding, real code with no mutation: JS `toLowerCase` and jq `ascii_downcase` disagree on non-ASCII case folding. The parity fixture `{"disabledAgents": ["refuter", "\u212Aeeper"]}` gives `shell: invalid|`, `js: ok|keeper refuter` (probe in `p-base`, exit 1). The hook allows the refuter and review-round skips it.
- Convergence: first round, so every finding is new.
---

author: lead
created: 2026-10-04 09:44
---
Action #1 answered by the human (2026-10-04): 'Live main file + guard'. The hook, review-round and the CF-111.1 command all read `.claude/coder-fleet.json` from the MAIN checkout (the repository's main worktree), never from a linked worktree or the call's cwd, so toggles stay instant with no commit. review-round additionally refuses to skip the refuter when the reviewed range's changed files include `.claude/coder-fleet.json`, and spawns one as it would without the config. This supersedes the 'committed' wording in decision 1.
---

author: lead
created: 2026-10-04 09:44
---
Round 1 results. Reviewer: request changes (1 must fix, 3 should fix, 2 low). Refuter: 7 of 8 mutants killed; one survived (JS trims after dropping the prefix, so `" coder-fleet:refuter"` gives different answers in the two readers), plus a real disagreement on a non-ASCII name (the Kelvin sign: JS toLowerCase vs jq ascii_downcase). Refuter baseline: check-all exit 1 only on task-tools 'is committed' checks, because its copy had no .git; every step this change touches passed. CF-111.1 built on `cf-111.1-agents-command` (3f5105b, 60/60 contract, check-all green per coder). Next: one fix round on CF-111 that also brings in 3f5105b, so the PR ships both as 0.30.0.
---

author: lead
created: 2026-10-04 09:54
---
A second background commit security scan (summary only) flagged 'trust-boundary / authorization bypass' in the fix round's `hooks/lib/fleet-config.sh`, which is mid-edit for the main-worktree resolution. Lead sent the fix coder three hardening points: GIT_* env vars unset during resolution; the resolved main worktree must list the starting worktree; and if resolution fails, read no file (refuter on), never fall back to the cwd's copy. Round 2's reviewer and refuter will attack the resolution directly.
---

author: lead
created: 2026-10-04 09:55
---
A third background scan (summary only) flagged a 'parser-differential / authorization bypass' in review-round.js. That is the shell-vs-JS disagreement already in the fix round's brief (items 3 and 4, criterion #9: ASCII-only names, jq -s, matching trim and prefix order, adversarial parity fixtures). The scan is likely seeing an intermediate commit. No new instruction sent. Round 2 checks parity on the final tip.
---
<!-- COMMENTS:END -->
