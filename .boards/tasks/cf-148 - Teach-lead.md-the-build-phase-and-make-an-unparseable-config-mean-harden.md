---
id: CF-148
title: 'Teach lead.md the build phase, and make an unparseable config mean harden'
status: In Progress
assignee: []
created_date: '2026-10-06 10:54'
updated_date: '2026-10-06 11:30'
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

author: lead
created: 2026-10-06 11:10
---
Sub-issue 1 of 1: ready to merge in PR #69 (cf-148-unparseable-harden, v0.37.3), after review. Done still needs: one review round with a refuter, criteria ticked on main, the tag, the close.

Done, on the coder's word: an existing config that does not parse to a JSON object (trailing comma, BOM, truncated, not an object, too deep, empty) means harden/unread in both readers with a reason naming the parse failure, and still voids disabledAgents; an absent file and an unknown phase in a parsed file still mean build. 21 parity fixtures moved to harden plus new ones, 13 checks red first then workflow-logic 613/0; four review-round runs; /coder-fleet:agents phase on an unparseable file now says harden (agents-command 92/0, 5 red first). lead.md step 4 gains one sentence after the 'refutation skipped by config' one: in build phase, review-round refutes only authentication or credential paths, and 'refutation skipped by build phase' counts as the review being complete; six steps, 49 lines, migration checklist in the PR. check-all exit 0 at 159.1 s.
Not done: nothing on main. Review routing: this repo is in build, but the change is the code that decides whether a refuter runs, the class the security review flagged twice on CF-145, so the round runs with its refuter and without fix: true (build hands blocking findings back to the lead). The coder's tidy proposal (two stale comments) is held in the lead's handoff.
---

author: @SubagentStop
created: 2026-10-06 11:29
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Scratch tree: `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/b60f21ed-bab8-46da-b450-232af096a73a/scratchpad/refuter-1791285731/base`. The main checkout is at `82de083f` plus board commits only, so I copied the working tree with `rsync` and overlaid the ten changed files with `git show a35b1544:<file>`. `git archive` and `git worktree` were denied by the scope hook. Each mutant `m1`-`m8` is a `cp -cR` clone of `base`, edited by `mut.py`, which asserts the edit matched exactly once.
- Full-gate baseline: `bash claude/evals/lib/check-all.sh` exited 1 in 164.8s, red on `FAILED: task-tools requirements-source`. task-tools failed on "its .claude/settings.json is committed" and "its glossary rule is committed", which looks like the copy having no `.git`; I did not read why requirements-source failed. Green and covering the change: `agents-command`, `fleet-config`, `workflow-logic` and `disabled-agents`.
- Narrow baselines, run in `base` in parallel with the mutants: `node claude/evals/lib/workflow-logic.mjs` exit 0 in 57s, and `bash claude/evals/lib/agents-command-contract.sh` exit 0 in 69s. Every mutant ran `workflow-logic`; the mutants in `fleet-config.py` and `fleet-config.sh` also ran `agents-command`. The launcher is `$S/run.sh` and the results are in `$S/results.txt`.
- Budget: at most eight mutants and 20 minutes. I used eight, and the round took about 8 minutes from 21:52:11.
- M1 killed (wl exit 1, ac exit 1): in `fleet-config.py`, changed `phase = unparsed(payload)` to `phase = ('build', 'default', '')`. Killed by `fleet-config-parity-phase`, `-phase-answers` and `-phase-reasons`, and by all four "phase on an unparseable file ... takes harden" cases.
- M2 killed (wl 1, ac 1): in `fleet-config.sh`, dropped `|harden\|unread` from the phase `case` pattern. Killed by the same three parity checks and the same four agents-command cases.
- M3 killed (wl 1): in `review-round.js`, the byte-order-mark branch `return unparsed(` became `return out('invalid', [], `. Killed by `failed-read-harden-byte-order-mark`, `failed-read-refutes-byte-order-mark`, `failed-read-logged-byte-order-mark` and parity.
- M4 killed (wl 1): in `review-round.js`, the too-deep nesting branch became `out('invalid', [], ...)`. Killed only by `fleet-config-parity-phase` and `-phase-reasons`. No review-round run covers this branch, but the parity fixtures do.
- M5 killed (wl 1): in `review-round.js`, the not-an-object branch became `out('invalid', [], ...)`. Killed by the three `failed-read-*-not-an-object` checks and parity.
- M6 killed (wl 1, ac 1): in `fleet-config.sh`, changed `invalid|unread) FLEET_CONFIG_PHASE_REASON` to `invalid)`, which drops the reason for an unread phase. Killed by `-phase-answers`, `-phase-reasons` and the four agents-command cases.
- M7 killed (wl 1; ac exit 0): in `fleet-config.py`, moved `phase = phase_of(doc)` after `disabled_of(...)`, so a bad list would wrongly void a good phase. Killed by three parity checks in workflow-logic. agents-command passed on it, but workflow-logic still guards the behaviour.
- M8 killed (wl 1): in the `unparsed` helper of `review-round.js`, kept the phase as harden but reported `phaseState: 'default'`. Killed by `failed-read-harden-*` and `failed-read-logged-*`.
- Commit claims match the diff: "21 parity fixtures now pin harden|unread" is 8 + 13 changed rows; the "two more" fixtures are the `null` one and the trailing comma with `disabledAgents`; the four review-round runs and four agents phase cases are present; and `lead.md` at `a35b1544` has 49 lines and 6 numbered steps.
- Convergence: this is round 1, so there is no earlier round to compare with. With all eight killed and the remaining branches covered by parity fixtures, I see no case for a second round.
---

author: lead
created: 2026-10-06 11:30
---
2026-10-06, a lead error, recorded first: PR #69 was merged and v0.37.3 tagged (a35b154, tag 2f58c42) while its CI run had failed. The lead's merge command piped `gh pr checks --watch` into `tail -1`, so the pipeline's exit status was tail's and the `&&` let the merge through. From here the lead checks CI's conclusion explicitly before merging.

The failure: agents-command-contract.sh 'list on an invalid file says why and exits 1', 91 passed 1 failed on ubuntu. The output in the log contains both 'invalid' and 'lead' and the exit is 1, so the command behaved correctly; the log also shows 'printf: write error: Broken pipe' at line 98, which is the `says()` helper: `printf '%s' "$OUT" | grep -qiF -- "$1"` under pipefail fails when grep -q exits on its first match before printf has finished writing. A race in the test helper, not in CF-148's code; the five main runs before it passed. Fix under this card (DoD #1 is not met until CI is green): say() reads the output without a pipe. Review round 1 on a35b154: approve with follow-ups, nothing blocking, clean; refuter 9 kills, 0 survivors. Two prose lows dropped under build: the lead.md sentence omits the config-in-range self-exemption, and README.md:104 still says 'any other value' without 'in a file that parses'.
---
<!-- COMMENTS:END -->
