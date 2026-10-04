---
id: CF-111
title: 'Let a project disable fleet agents, starting with the refuter'
status: In Progress
assignee: []
created_date: '2026-10-04 08:55'
updated_date: '2026-10-04 10:24'
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

author: @SubagentStop
created: 2026-10-04 10:05
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-afec9a2f3d074dc07`. I checked it's a linked worktree before writing. Branch `cf-111-fix-1`, cut from `cf-111-disable-agents` at 43e6464. `3f5105b` cherry-picked cleanly as `6e48741`.
- `692cd96` Make the shell and JS readers of .claude/coder-fleet.json agree on every input (points 3, 4, 5 and 6).
- In that commit, `hooks/lib/fleet-config.sh` reads the whole file in one go (`jq -n --rawfile --slurpfile`). Several JSON values in one file are invalid, so are a leading byte order mark and the `NaN`/`Infinity` literals jq accepts. A name with any character outside printable ASCII is invalid, which covers the Kelvin sign, U+FEFF, U+0085, NBSP, tabs and newlines.
- Both readers now trim spaces, lower-case, then drop the `coder-fleet:` prefix, in that order. jq's name check anchors on `\A`/`\z`, because its `^`/`$` matched at an embedded newline, so `"refuter\nx"` used to disable the refuter in the hook.
- Both readers reject a leading BOM. A directory at the config path is `unreadable` in both.
- `workflow-logic.mjs` gained 20 parity fixtures, each with its intended answer as well as agreement, plus a directory case. `disabled-agents-contract.sh` runs the same inputs through the hook and `--check`, and covers a capitalised prefix on the agent type (`Coder-Fleet:refuter` is denied, `Other-Plugin:Refuter` is allowed). Watched failing first: 13 failures in the contract test and 3 in workflow-logic, including every split the refuter and reviewer reported.
- `ca66a74` Read .claude/coder-fleet.json from the main checkout only (points 1 and 7). `fleet_config_root` returns the first entry of `git worktree list --porcelain`. I didn't use the parent of `--git-common-dir`, because it's wrong for a repository cloned with `--separate-git-dir`. The hook, `--check` and `scripts/fleet-agents.sh` all use it.
- In that commit, the review-round pin lane is told to read the first worktree's file, live, and to report the path it read. The schema now requires that path. A path that isn't the main worktree's is ignored and the refuter stays on.
- Its tests: new cases with a linked worktree carrying a different file in both contract tests, plus workflow-logic checks on the prompt, the schema and the path guard. Watched failing first: 8 in the hook contract, 3 in the agents contract, and the prompt, schema and guard checks.
- `8d5d339` review-round: a range that changes .claude/coder-fleet.json gets its refuter (points 2 and 5). If the round's changed files include the config file (matched ignoring case), the round refutes as it would with no config and logs why. This is re-checked every round, so a fix round that adds the file is caught too. When a skipped round was sensitive, `refutationSkipped` now names the sensitive files.
- Its tests: five new cases, all watched failing first. They cover a sensitive diff that adds the file, the same file in another case, a fix round that adds it, the log line, and the skip reason.
- `01456d4` Docs (point 8): `README.md`, `docs/fleet-design.md` section 4, the hooks README (its Disabled agents section, table row and decision 25) and `docs/limits.md` now say "the main checkout's file, read live" instead of "committed", and mention the guard.
- `9d756e5` Harden the main-checkout resolution (the lead's message). Git runs with `GIT_DIR`, `GIT_COMMON_DIR`, `GIT_WORK_TREE`, `GIT_CEILING_DIRECTORIES`, the `GIT_CONFIG_*` overrides and a few related variables unset. The main checkout is believed only if its own worktree list names the starting worktree, and that list's first entry is the main checkout itself.
- In that commit, no git, no repository, a bare main or an unlisted worktree gives a new `unresolved` state and no file is read. The hook allows and logs, `--check` passes and says so, `fleet-agents.sh` refuses without writing, and the pin lane is told to read no file.
- Its tests were watched failing first: 9 in the hook contract, 1 in workflow-logic. For the `fleet-agents.sh` case I added the test after the fix, so I proved it by putting back the old fall-back-to-cwd line: 1 failure, then green once restored.
- Point 6: the contract test already covered `--check` failing on an invalid fixture, and now covers 9 more invalid inputs. The `fleet-config` step in check-all only proves the script runs. In CI the repo has no config file, so the step can only pass. Locally it now checks the human's live main-checkout file (this run printed `/Users/alex/Dev/Work/extensions/coder-fleet: no .claude/coder-fleet.json`), so it can go red locally while CI stays green.
- `bash claude/evals/lib/check-all.sh`, run once with output in the scratchpad file `check-all.txt`: exit 0, "Every deterministic check passes". That includes disabled-agents 98/0, agents-command 64/0, fleet-config ok, workflow-logic 396/0, board 232 tests with 0 failures, versions 0.30.0/0.30.0. The worktree is clean.
---

author: lead
created: 2026-10-04 10:06
---
Fix round 1 handed back: branch `cf-111-fix-1` (tip 9d756e5, not on main). It brings in CF-111.1 (6e48741) and addresses every point: readers agree (692cd96), main-checkout-only read via the first `git worktree list --porcelain` entry (ca66a74), config-in-range forces the refuter (8d5d339), docs (01456d4), and hardening with GIT_* unset, the main checkout must list the starting worktree, and an `unresolved` state reads nothing (9d756e5). The coder reports check-all exit 0 (disabled-agents 98/0, agents-command 64/0, workflow-logic 396/0). The coder's reading of the scans: the in-progress resolution fell back to the cwd's file when git did not resolve, which was most likely the flagged bypass; now closed. Next: CF-113 builds on this tip, then round 2 review and refuter over the whole branch. Done still needs round 2, PR, merge, tag. Criteria are not ticked until round 2 approves.
---

author: @SubagentStop
created: 2026-10-04 10:24
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Setup: the refuter hook refuses `git clone` and `git checkout` (only read-only git verbs are allowed), so the brief's clone step wasn't possible. Instead I used `cp -R` of the repo with `.git` to `.../scratchpad/refuter-1791108986/repo`, and reconnected the copied cf-113 worktree to it by rewriting its `.git` file and the matching `gitdir` file. That makes a real linked worktree at 4541e0b, clean, whose git common dir is in the copy.
- Baseline: `bash claude/evals/lib/check-all.sh` in that worktree, exit 0, 350s, "Every deterministic check passes". This time the task-tools "is committed" checks passed too. Output is in `.../refuter-1791108986/baseline.txt`. My probes edited that worktree's `.git` for a few seconds while the baseline ran; they restored it, and the run still came back green.
- Narrow baselines in `.../refuter-1791108986/m/base`: `disabled-agents-contract.sh` exit 0, 11s, 106/0; `agents-command-contract.sh` exit 0, 5s; `node claude/evals/lib/workflow-logic.mjs` exit 0, 1s. Mutants ran in parallel copies `m/1` to `m/8`.
- killed mutant 1 (cwd fall-back): `disabled-agents-contract.sh` exit 1 ("fleet_config_read with no main checkout reads nothing and says unresolved", "--check outside a repository ...").
- killed mutant 2 (no "main lists start" check): `disabled-agents-contract.sh` exit 1, 3 failures including "a linked worktree whose .git file was edited to point elsewhere".
- killed mutant 3 (GIT_DIR, GIT_WORK_TREE kept): `disabled-agents-contract.sh` exit 1 ("GIT_DIR, GIT_WORK_TREE and GIT_COMMON_DIR pointing at another repository are ignored").
- killed mutant 4 (last porcelain entry): `disabled-agents-contract.sh` exit 1 and `agents-command-contract.sh` exit 1, dozens of failures.
- killed mutant 5 (case-sensitive config-in-range match): `workflow-logic.mjs` exit 1, `config-in-range-any-case-refutes`.
- killed mutant 6 (JS path guard removed): `workflow-logic.mjs` exit 1, `linked-worktree-config-not-honoured`.
- killed mutant 7 (`^`/`$` in the jq name check): `disabled-agents-contract.sh` exit 0, `workflow-logic.mjs` exit 1 (`fleet-config-parity`, `fleet-config-parity-answers`).
- Equivalent, mutant 8 (`if (!PRINTABLE_ASCII_RE.test(n)) return n` deleted): `workflow-logic.mjs` exit 0. The state is the same for every input; only the reason text changes.
- low: claude/coder-fleet/workflows/review-round.js:346 - the reason text for a non-printable name differs from the shell's when the printable check is removed (`"refuter\t"` against `" Refuter\t"`), and no fixture compares the parity reasons for that case.
- Reviewer-kind finding, no mutation: jq-1.6 accepts the number forms `01`, `1.`, `.5` and `+1`, and JSON.parse refuses them. `{"disabledAgents":["refuter"],"x":01}` gives shell `ok [refuter]` and JS `invalid`, so the hook denies the refuter while review-round runs one. The `$bare` letter screen in `fleet-config.sh` only catches NaN and Infinity. Probe: `.../refuter-1791108986/probe/js.mjs` against `fleet_config_read`.
- Reviewer-kind finding, no mutation (probe A2): a linked worktree whose `.git` points at `<other>/.git/worktrees/x`, an entry made by hand with a back-pointer `gitdir`, while `<other>` disables the refuter. The hook gives **deny**, so the "main lists the starting worktree" check is satisfied by a forged registration. Probe A1, pointing at `<other>/.git` directly, gives allow.
- Probe B1/B2: a symlink at the main checkout's `.claude/coder-fleet.json` is followed, to an outside file (deny) and to a file inside the linked worktree under review (deny). It needs write access to the main checkout, so it is minor.
- Convergence against round 1 (card comment #10): converging. No mutant survived this round. The one new finding is the same jq/JSON.parse parity class on a new input, which points at the two-reader design rather than missing tests.
---

author: @SubagentStop
created: 2026-10-04 10:24
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups. Reviewed `main...cf-113-unknown-names` at 4541e0b against CF-111's nine criteria plus comment #11, CF-111.1's six criteria, and CF-113's criterion plus comment #1. Read `fleet-config.sh`, `enforce-disabled-agents.sh`, `fleet-agents.sh`, the review-round diff, the workflow-logic parity and guard tests, the hardening section of the hook contract, `enforce_coder`, and the docs diffs.
- All six round 1 findings are closed. Two came back narrower: should-fix A and follow-up F1. This round's findings are not substantially round 1's.
- should fix: claude/coder-fleet/workflows/review-round.js:314 - a pin lane reporting `found: true` with an empty `path` skips the main-worktree check and is honoured; the tests' `pinWith` relies on this, and `docs/limits.md:77` overstates the guard.
- should fix: claude/coder-fleet/hooks/lib/fleet-config.sh:179 - suspected jq leniency (leading-zero, `.5` and `+1` numbers; raw control characters in strings) gives `ok|refuter` in the shell and `invalid` in JS; no parity fixture covers it (unverified, see below).
- low: claude/coder-fleet/hooks/lib/fleet-config.sh:88 - the comment, and hooks/README.md:345, claim a forged worktree `.git` file is caught; a fake repository that registers the worktree passes the circular check.
- low: docs/limits.md - no entry saying the live main file trusts every writer of the main checkout, including a coder's Write, which nothing confines to its worktree.
- low: claude/coder-fleet/hooks/README.md:622 - decision 25 says review-round "refutes any round whose range changes the file"; it only refuses to skip a refutation the round already called for.
- low: claude/coder-fleet/hooks/enforce-disabled-agents.sh:77 - CF-113 folds `-fable` off the entry, so `refuter-fable` (no such agent file) gets no warning, against the criterion's wording; the contract test at :386-388 asserts the silence. Harmless while no `-fable` agents exist.
---
<!-- COMMENTS:END -->
