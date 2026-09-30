---
id: CF-53
title: Skip the spec step when the project names a requirements source
status: In Progress
assignee: []
created_date: '2026-09-28 01:38'
updated_date: '2026-09-30 16:20'
labels: []
dependencies:
  - CF-24
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/26'
  - claude/coder-fleet/templates/AGENTS.md
  - claude/coder-fleet/workflows/spec-to-card.js
  - docs/specs/CF-24.md
priority: Medium
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub issue #26, decided for fathom on 2026-09-28 after the Models post-mortem. In a project with approved requirements, the spec restates requirement clauses behind a second approval gate: fathom wrote twelve, and the decisions they should have closed reopened anyway. Triage on 2026-09-28: the project declares its source with a fixed line, "Requirements source: <path>", in AGENTS.md, which scripts can grep and the human can read. If the line is absent, the current spec path applies. This item depends on CF-24, whose criterion #9 (sub-issue CF-24.1) says that where there is no spec, card criteria come from the requirement clauses the item answers, in clause order. Related tension, not resolved here: CF-12 adds spec machinery (editor pairs and a challenge gate); under CF-12 Q21, a project with no editor record skips it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates/AGENTS.md carries a "Requirements source: <path>" line in Where work lives, and /init asks whether the project has one
- [ ] #2 spec-writer.md's description says when it is used, so the lead does not spawn it by habit
- [ ] #3 check-all green, migration-checklist run on lead.md and spec-writer.md, version bumped and tagged
- [ ] #4 spec-to-card.js and /kickoff read that line: with it, intake goes from brain dump to a card whose criteria are the requirement clauses the item answers, in clause order, with spec-writer skipped; without it, the current flow is unchanged; workflow-logic cases cover both
- [ ] #5 lead.md routes to spec-writer only for an unshaped idea in a project with no requirements source; otherwise each open decision becomes an Actions for Human question on the card, answered before the first build spawn
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
created: 2026-09-28 12:35
---
Scope change 2026-09-28 from CF-58 (drop plans, by the human): spec-to-plan becomes spec-to-card, and no plans are written anywhere. What is left for this item (GitHub #26): a project that names a requirements source skips spec-writer, and its card criteria come from the requirement clauses the item answers. The "plan written from the requirement clauses" half is gone.
---

author: lead
created: 2026-09-29 14:14
---
On 2026-09-30, at the human's word, criteria #2 and #3 were rewritten for a fleet without plans. They were removed and re-added, so they now appear as #4 and #5. Old #2 said "spec-to-plan ... the plan written from the requirement clauses". It now names spec-to-card, and the card's criteria are the requirement clauses in clause order, matching CF-24 criterion #9. Old #3 said "open decisions are questions in the plan, answered at approval". Its replacement, "an Actions for Human question on the card, answered before the first build spawn", is the lead's reading. The human has not decided it, so edit it if it is wrong. The spec-to-plan.js reference is replaced with spec-to-card.js.
---

created: 2026-09-30 14:01
---
Sub-issue 1 of 1: started. Done still needs: #1 to #5. The human ordered this built on 2026-10-01 ("finish the last 4 github issues", #26). It's first in the serial lead.md track; CF-52 #4 and CF-90 #5 follow after it merges. CF-24.1 already put the clause-criteria rule in lead.md step 5 and agent-contract.md, so this item reuses that text rather than restating it. The version bump is batched into one release at the end. This coder spawn is also CF-52 #3's live run: `worktree.baseRef: head` is set in .claude/settings.local.json, and local main is ahead of origin/main.
---

author: @SubagentStop
created: 2026-09-30 14:20
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree started from `fc1b90e5d89f4f3f6c689eadbcf4c6bfaf34edda`, one behind local main's `fafd26e` at session start (a board-only commit). `git rev-parse origin/main` is `7d5182b26c8f86710516350efe2b0ee8b3792e76`.
- Worktree check: the common dir is the main repo's `.git`, the toplevel is `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a808651e2339280d0`, and it was clean before the first write.
- `958522f` "CF-53: spec-to-card files requirement clauses when AGENTS.md names a requirements source", in `claude/coder-fleet/workflows/spec-to-card.js`: a new scout lane, `requirements source`, runs beside the spec gate and quotes the matching `AGENTS.md` line, which the script matches against `REQUIREMENTS_LINE = /^Requirements source: (.*)$/`, the one place the rule lives.
- In the same commit: with the line and no approved spec, the run is stage `clauses`. It reads the card first (the card lane now also returns `description`), a scout lists the clauses the item answers, the script sorts them by position, and filing reuses the existing path. The result carries `questions`, and its `nextStep` says to add each as an Actions for Human question with `actionsAdd`, answered before the first build spawn.
- In the same commit, these cases stop with nothing drafted and nothing filed, and none falls back to a spec: a path that does not exist, a line with no path or a `<FILL>` placeholder, a lane that could not read `AGENTS.md`, an explicit `stage: "spec"`, no clauses found, and a clause with no position. An approved spec still wins over the clauses.
- In the same commit, `claude/evals/lib/workflow-logic.mjs` has 20 new checks, all seen failing before the change. Four "without the line" cases (absent, lower-case, other words, not at line start) confirm the spec stage still runs, and the existing responders now answer the new lane with "no line".
- Mutation run: removing the `.sort(...)` fails `reqsource-clause-order` and `reqsource-result-in-clause-order` (386/2); restored, 388/0.
- `68b43e4` "CF-53: template, init, kickoff and the lead route on a requirements source": `templates/AGENTS.md` has `Requirements source: <FILL: ...>` in Where work lives, plus one explanatory paragraph.
- In the same commit, `commands/init.md` step 3 always asks for the line, never infers it, and leaves the marker if the interview is declined. Step 2 asks a project whose `AGENTS.md` already exists, and on a yes names the exact line to add in the report, because init does not touch an existing file.
- In the same commit, `commands/kickoff.md` Start reads the line. Without it the text is unchanged; with it, spec-writer never runs, the clauses go on the card, open decisions become Actions for Human questions, and a missing path is a stop.
- In the same commit, `agents/lead.md` step 2 routes to spec-writer only for an unshaped idea in a project with no requirements source. It adds one sentence that reuses step 5's clause rule rather than restating it; the body is still six steps and 49 lines.
- In the same commit, `agents/spec-writer.md` has a description that says when it is used. It had to be quoted, because `Requirements source: <path>` put a colon-space in an unquoted YAML value and the frontmatter stopped parsing.
- In the same commit, new `claude/evals/lib/requirements-source-contract.sh` (18 checks, 13 then 11 seen failing), registered in `check-all.sh`. It also pins the six lead steps, a single spelling of the line, and that this repo's `AGENTS.md` has no such line.
- `cf8fb86` "CF-53: keep the requirements-source spelling scan out of node_modules": the scan was walking `board/node_modules`; the contract now runs in 0.6s.
- Commands run: `node claude/evals/lib/workflow-logic.mjs` was 368/20 red, then 388/0. `bash claude/evals/lib/requirements-source-contract.sh` 18/0. `bash claude/evals/lib/lead-rules-contract.sh` 10/0.
- `bash claude/evals/lib/check-all.sh`, run once on `68b43e4` with output captured to the scratchpad: exit 0, "Every deterministic check passes".
- migration-checklist on `lead.md` and `spec-writer.md`: check 1 (YAML parses) failed for spec-writer until the description was quoted, and lead passed. Checks 2 and 3: the colon-space was that same issue; tools is a string and skills is a list. Check 7: names match the filenames. Check 16: 49 and 55 lines. Check 17: four H2s in order.
- migration-checklist, continued: check 19 found no en or em dashes, hard wraps, emojis or American spellings. Check 9 found no scaffolding or thinking prompts. Checks 4, 5, 8 and 14 do not apply, since the diff did not touch tools, MCP entries, model or effort. Checks 11 and 13 (effort sweep and token inflation) do not apply, since no model changed.
- No version bump, as the brief said.
---

author: @SubagentStop
created: 2026-09-30 14:20
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree started from `fc1b90e5d89f4f3f6c689eadbcf4c6bfaf34edda`, one behind local main's `fafd26e` at session start (a board-only commit). `git rev-parse origin/main` is `7d5182b26c8f86710516350efe2b0ee8b3792e76`.
- Worktree check: the common dir is the main repo's `.git`, the toplevel is `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a808651e2339280d0`, and it was clean before the first write.
- `958522f` "CF-53: spec-to-card files requirement clauses when AGENTS.md names a requirements source", in `claude/coder-fleet/workflows/spec-to-card.js`: a new scout lane, `requirements source`, runs beside the spec gate and quotes the matching `AGENTS.md` line, which the script matches against `REQUIREMENTS_LINE = /^Requirements source: (.*)$/`, the one place the rule lives.
- In the same commit: with the line and no approved spec, the run is stage `clauses`. It reads the card first (the card lane now also returns `description`), a scout lists the clauses the item answers, the script sorts them by position, and filing reuses the existing path. The result carries `questions`, and its `nextStep` says to add each as an Actions for Human question with `actionsAdd`, answered before the first build spawn.
- In the same commit, these cases stop with nothing drafted and nothing filed, and none falls back to a spec: a path that does not exist, a line with no path or a `<FILL>` placeholder, a lane that could not read `AGENTS.md`, an explicit `stage: "spec"`, no clauses found, and a clause with no position. An approved spec still wins over the clauses.
- In the same commit, `claude/evals/lib/workflow-logic.mjs` has 20 new checks, all seen failing before the change. Four "without the line" cases (absent, lower-case, other words, not at line start) confirm the spec stage still runs, and the existing responders now answer the new lane with "no line".
- Mutation run: removing the `.sort(...)` fails `reqsource-clause-order` and `reqsource-result-in-clause-order` (386/2); restored, 388/0.
- `68b43e4` "CF-53: template, init, kickoff and the lead route on a requirements source": `templates/AGENTS.md` has `Requirements source: <FILL: ...>` in Where work lives, plus one explanatory paragraph.
- In the same commit, `commands/init.md` step 3 always asks for the line, never infers it, and leaves the marker if the interview is declined. Step 2 asks a project whose `AGENTS.md` already exists, and on a yes names the exact line to add in the report, because init does not touch an existing file.
- In the same commit, `commands/kickoff.md` Start reads the line. Without it the text is unchanged; with it, spec-writer never runs, the clauses go on the card, open decisions become Actions for Human questions, and a missing path is a stop.
- In the same commit, `agents/lead.md` step 2 routes to spec-writer only for an unshaped idea in a project with no requirements source. It adds one sentence that reuses step 5's clause rule rather than restating it; the body is still six steps and 49 lines.
- In the same commit, `agents/spec-writer.md` has a description that says when it is used. It had to be quoted, because `Requirements source: <path>` put a colon-space in an unquoted YAML value and the frontmatter stopped parsing.
- In the same commit, new `claude/evals/lib/requirements-source-contract.sh` (18 checks, 13 then 11 seen failing), registered in `check-all.sh`. It also pins the six lead steps, a single spelling of the line, and that this repo's `AGENTS.md` has no such line.
- `cf8fb86` "CF-53: keep the requirements-source spelling scan out of node_modules": the scan was walking `board/node_modules`; the contract now runs in 0.6s.
- Commands run: `node claude/evals/lib/workflow-logic.mjs` was 368/20 red, then 388/0. `bash claude/evals/lib/requirements-source-contract.sh` 18/0. `bash claude/evals/lib/lead-rules-contract.sh` 10/0.
- `bash claude/evals/lib/check-all.sh`, run once on `68b43e4` with output captured to the scratchpad: exit 0, "Every deterministic check passes".
- migration-checklist on `lead.md` and `spec-writer.md`: check 1 (YAML parses) failed for spec-writer until the description was quoted, and lead passed. Checks 2 and 3: the colon-space was that same issue; tools is a string and skills is a list. Check 7: names match the filenames. Check 16: 49 and 55 lines. Check 17: four H2s in order.
- migration-checklist, continued: check 19 found no en or em dashes, hard wraps, emojis or American spellings. Check 9 found no scaffolding or thinking prompts. Checks 4, 5, 8 and 14 do not apply, since the diff did not touch tools, MCP entries, model or effort. Checks 11 and 13 (effort sweep and token inflation) do not apply, since no model changed.
- No version bump, as the brief said.
---

created: 2026-09-30 14:20
---
Built in the coder's worktree (agent-a808651e2339280d0; commits 958522f, 68b43e4 and cf8fb86; not on main). The coder reports workflow-logic 388/0 (20 new cases seen red), the new requirements-source-contract 18/0 and check-all exit 0. Review round 1 and a refuter are running (spec-to-card writes criteria to the board). Filed CF-107 (check-all should parse agent and skill frontmatter). The coder's other proposals ride this item's fix round rather than being filed: clauses first on a card that already has criteria (lead step 5), a divergence-register row for the OpenCode init and kickoff (DoD #5), and fleet-design and README describing intake.
---

author: @SubagentStop
created: 2026-09-30 14:23
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. Reviewed the three commits against CF-53 criteria #1 to #5 and comments, lead.md step 5 (CF-24.1), CF-24 spec criterion #9, agent-contract.md, lead-rules-contract.sh, the new requirements-source-contract.sh, the new workflow-logic cases and the OpenCode port files.
- must fix: claude/coder-fleet/workflows/spec-to-card.js:219 - the requirements-source checks run before the approval route, so a null or garbled lane, or a broken line, stops an approved-spec card run in every project; check the lane only where it decides the route, and add an approved-spec + null-lane test
- must fix: claude/coder-fleet/workflows/spec-to-card.js:626 - clauses are appended after the card's existing criteria (always present under require_acceptance_criteria), and a partial overlap files them out of order, while nextStep claims clause order; breaks criterion #4 and step 5; needs a test with a card that already has criteria
- must fix: opencode/docs/divergence-register.md - DoD #5 has no row for the requirements-source change to init, kickoff and templates/AGENTS.md
- low: README.md:118 - describes spec-to-card's second run as filing only the spec's criteria; README.md:23 and docs/fleet-design.md:33 describe spec-writer without the new condition
- low: claude/coder-fleet/workflows/spec-to-card.js:60 - comment says clause order is "never from the lane", but the lane supplies the positions
- Confirmed: lead.md is still six steps and 49 lines, lead-rules-contract pins are untouched, and requirementsSource never reaches a shell command.
---

created: 2026-09-30 14:24
---
Review round 1, 2026-10-01: request changes. Must-fixes: (1) the requirements-source lane is checked before the route is chosen, so a null or garbled lane stops even an approved-spec run in every project, which breaks 'without the line, unchanged'; (2) clauses are appended after a card's existing criteria (always there under require_acceptance_criteria) and can land out of order, while nextStep claims clause order; (3) DoD #5: no OpenCode divergence-register row for init, kickoff and templates/AGENTS.md. My calls on the reviewer's proposals, all riding the fix round: the spec path gets the same replace-not-append filing as the clauses path (lead step 5 says provisional criteria are replaced at sign-off); a directory source is ordered by sorted file path, then position (fathom's source is a set of .rq files, so a single-file restriction would break the one real user); criteria #4 vs #5, lead step 2 keeps spec-writer 'for a spec or an unshaped brain dump' in a project with no requirements source, so the no-line flow really is unchanged; fleet-design gets a paragraph. The fix round waits for the refuter.
---

author: @SubagentStop
created: 2026-09-30 14:27
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline, in the worktree at 00:20: `node claude/evals/lib/workflow-logic.mjs` exited 0 (388 passed, 0 failed, under a second). `bash claude/evals/lib/requirements-source-contract.sh` had 18 passed, 0 failed, under a second. `bash claude/evals/lib/check-all.sh` exited 0 in 374s, every section ok; output is in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/ca-1790778036.out`. Both narrow suites also passed on the scratch copy.
- Scratch tree: `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790778036/`. It holds `base/`, one copy per mutant (`m1-...` to `m8-...`), `mut.py` (applies one edit and runs the suite) and the probe harness `probe-head.mjs` plus `probe-body.mjs`. Budget was eight mutants and 20 minutes; I used eight mutants and about 8 minutes.
- killed: m1, dropping the `.sort(...)` by position in the clauses stage. Exit 1 on `reqsource-clause-order` and `reqsource-result-in-clause-order`.
- killed: m5, `hasSource ? 'clauses' : approved ? 'card' : 'spec'`, putting the requirements source ahead of an approved spec. Exit 1 on `reqsource-approved-spec-is-the-card-stage`.
- killed: m7, adding `Requirements Source: docs/r.md` to `kickoff.md`. Exit 1 on the one-spelling check.
- survived: `if (reqMatch && !isTrue(reqResult.pathExists))` changed to `if (reqMatch && isPlainNo(reqResult.pathExists))` in `claude/coder-fleet/workflows/spec-to-card.js` - a lane that leaves out `pathExists` files clauses onto the card from a path never confirmed to exist, where the original stops with "does not exist" (suite exit 0, 388/0)
- survived: `if (!criteria.includes(c.text)) criteria.push(c.text)` changed to `criteria.push(c.text)` in `spec-to-card.js` - two clauses with the same normalised text are filed as two identical `--ac` criteria, where the original files one (suite exit 0)
- survived: `REQUIREMENTS_LINE.exec(reqResult.line.trimEnd())` changed to `REQUIREMENTS_LINE.exec(reqResult.line)` in `spec-to-card.js` - `Requirements source: docs/r.md\r` goes to the spec stage instead of the clauses stage, so spec-writer runs in a project that named a requirements source (suite exit 0)
- survived: `(!requirementsSource || requirementsSource.startsWith('<'))` changed to `(requirementsSource.startsWith('<'))` in `spec-to-card.js` - `Requirements source: ``` (empty backticks) now stops with "names  as the requirements source, and it does not exist" instead of "names no path"; only the message changed in the case I ran (suite exit 0)
- survived: adding `Requirement source: docs/r.md` (singular) to `claude/coder-fleet/commands/kickoff.md` - the one-spelling check passes 18/0, because its pattern `requirements[ -]source:` only catches case and hyphen variants, and it scans only the plugin tree and `docs/agent-contract.md`
- Checked the stop cases on the original: the placeholder `<FILL: ...>`, empty backticks, a missing `pathExists`, a leading space (goes to the spec flow as the rule says), and a trailing space (goes to clauses). The missing-path, placeholder, lane-failure and no-clauses stops are already pinned by the existing `reqsource-stops:*` cases.
- Garbled lane with no line: confirmed with the probe (`node .../base/claude/evals/lib/probe.mjs`, exit 0). Null lane, `'garbage'`, and `{pathExists:false}` with no `line` all end `blocked` with "could not read AGENTS.md", including with an approved spec. The "unchanged" claim in 958522f fails for a failed lane, and no test covers that path.
- Reviewer-kind finding in the change: `Requirements source: ` with an empty path goes to the spec stage (probe "empty path line" -> `spec`), because `trimEnd()` runs before the pattern that needs the trailing space. This contradicts "Nothing falls back to a spec while the line is there".
- Contract claims: six lead steps holds (the count check passes). "This repo has no line" holds; it greps the root `AGENTS.md` only. "One spelling" is weaker than stated (see the m8 bullet).
- Convergence: first round on CF-53, so every finding is new.
---

created: 2026-09-30 14:28
---
Refuter round 1, 2026-10-01: 3 of 8 mutants killed. Survivors: a missing pathExists files clauses from an unconfirmed path; duplicate normalised clauses filed twice; a CRLF line silently drafts a spec; the empty-path guard (only the message changed); the one-spelling check misses 'Requirement source:' and doesn't scan README, fleet-design or the ports. Bug: `Requirements source: ` with nothing after it falls back to a spec. It confirmed the review's must-fix 1 with stubs (null, garbage and no-line lanes all block, even with an approved spec). check-all took 374 s (CF-56). Fix round 1 (coder resumed) covers the three review must-fixes, a killing case per survivor, the empty-path bug, and my calls in #8.
---

created: 2026-09-30 15:22
---
Fix round 1's coder stalled (watchdog, no progress for 600 s) with no handoff, so the run is treated as failed, not done. It had committed 9b3d4e7 and 82ba507, then saw check-all's board section fail while CF-24.4's coder was running heavy board suites in parallel. It has been resumed to diagnose the board failure narrowly, run the narrow gates and write its handoff. I'll run check-all myself on the final commit, not in parallel with other suites.
---

author: @SubagentStop
created: 2026-09-30 15:24
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commits: `9b3d4e7` "CF-53 fix round 1: spec-to-card replaces the card's criteria in order, and reads the source line only where it decides the route", and `82ba507` "CF-53 fix round 1: lead keeps spec-writer's route, docs give the condition, and the port records the deferral". The worktree is clean at `82ba507`.
- Must-fix 1 (the lane blocked approved-spec runs), in `claude/coder-fleet/workflows/spec-to-card.js`: the requirements lane is now `requirementsLane()`, and it only decides the route for `auto` with no approved spec, or for an explicit `stage: "spec"`. There a failed answer (null, not an object, or no string `line`) is asked once more, then stops with "could not read AGENTS.md... twice". It is never read as "no line".
- Must-fix 1 cases: `approved-spec-ignores-failed-lane:{null,garbage,no-line}` (card stage), `reqlane-retried-once`, `reqlane-fails-twice-stops` and `reqlane-explicit-spec-fails-stops`. All were seen failing first. Mutants "laneDecides = true" and "retry removed" are both killed.
- Must-fix 2 (clauses were appended): both sources now make the card read as the source's criteria in order, each once, then any extra criterion the card carried, with a provisional one (text starting "Provisional") removed. This follows lead step 5.
- How must-fix 2 writes the card: a card already in that shape is not written. A card that is a prefix of it gets only the tail appended, which keeps ticks. Anything else is rewritten in one edit: `--ac` for every target criterion, then `--remove-ac=<n>` for every old index.
- Must-fix 2 guards: a rewrite over ticked criteria stops. The card lane now returns `indices` and `ticked`. The filing lane reads the criteria back, and the order is checked before `nextStep` claims it. The spec path uses the same logic.
- Must-fix 2 cases: `clauses-replace-provisional`, `clauses-replace-result`, `clauses-partial-overlap-reordered` (R7 on the card, R2 not), `clauses-extra-follows`, `clauses-already-in-order`, `clauses-ticked-rewrite-stops`, `filed-order-read-back` and `spec-replaces-provisional`, all seen failing first. Mutants killed: "provisional kept", "no --remove-ac", "ticked guard off", "read-back unchecked" and "always append".
- Live check of the add-then-remove claim, with `~/.local/bin/board` 0.1.7 in a scratch repo and `CODER_FLEET_BOARD_NO_COMMIT=1`: `[Provisional..., R7]`, then one `task edit --ac=R2 --ac=R7 --remove-ac=1 --remove-ac=2`, gave `[(1, R2), (2, R7)]`, 0 ticked. Script: `scratchpad/bt.sh`.
- Must-fix 3 (DoD #5): `opencode/docs/divergence-register.md` has three Deferred rows, for `templates/AGENTS.md`, `commands/init.md` and `commands/kickoff.md`. The reason given: the lead, spec-writer, spec-to-card and the board are not ported, so nothing on the port would read the line.
- Survivor "pathExists isPlainNo": killed by `reqsource-bad-path-stops:missing-path-exists` (no `pathExists` stops with "does not exist").
- Survivor "dedupe deleted": killed by `reqsource-duplicate-clause-filed-once`. Dedupe is now by matchKey across the source list.
- Survivor "no trimEnd": killed by `reqsource-crlf-line` (`Requirements source: docs/requirements.md\r` is still a source).
- Survivor "empty-path guard removed": killed by `reqsource-bad-path-stops:{empty-backticks,blank-path,no-space-no-path,spaces-only}`, which pin "names no path".
- Survivor "singular spelling": `requirements-source-contract.sh` now matches `requirements?[ -]source:` case-insensitively. It scans the plugin, `claude/evals`, `docs/`, `README.md`, `AGENTS.md`, `opencode/` and `codex/`, excluding only `workflow-logic.mjs` (deliberate misspelt fixtures) and itself. A self-test `misspelling_caught` plants `Requirement source:` in a scratch file and must see it flagged.
- Empty-path bug: `REQUIREMENTS_LINE` is now `/^Requirements source:(.*)$/`, so `Requirements source: ` or `Requirements source:` with nothing after it matches and stops as "names no path", never falling back to a spec. The lane prompt now asks for the line "even when nothing follows the colon". It is covered by the blank-path, no-space and spaces-only cases.
- Your decision on directory sources: clauses sort by file path (plain `<` comparison, no locale), then position. The scout prompt asks for each clause's `file`, and the template paragraph and kickoff Start both say "files sorted by path, then each clause's place in its file". Cases `reqsource-directory-order` and `reqsource-directory-prompt` kill the "file order ignored" mutant.
- Your decision on lead step 2: spec-writer is back to "for a spec or an unshaped brain dump in a project with no requirements source". Still six steps and 49 lines, and lead-rules-contract is 10/0. The contract pins the phrase.
- Lows: the README spec-writer row and board paragraph, and the `docs/fleet-design.md` spec-writer row, now give the condition. fleet-design gained one paragraph on the rule and why it skips the second approval gate. The instruction-file-contract README line was not touched.
- The spec-to-card header comment now says the lane supplies positions and the script sorts them. It also documents replace-not-append.
- Mutation run (`scratchpad/mut.py`, each mutant against workflow-logic, file restored after): 12 of 12 killed, including all four refuter survivors that live in `spec-to-card.js`.
- migration-checklist mechanics rerun on `lead.md` and `spec-writer.md`: both parse as YAML, four H2s, six steps, 49 and 55 lines. No dashes, wraps, emojis, scaffolding or American spellings.
- Final gates, each run once with output captured in the scratchpad: `node claude/evals/lib/workflow-logic.mjs` exit 0, 411/0 (`final-wl.txt`). `bash claude/evals/lib/requirements-source-contract.sh` exit 0, 26/0 (`final-rs.txt`). `bash claude/evals/lib/lead-rules-contract.sh` exit 0, 10/0 (`final-lr.txt`).
- check-all failure: my one full run on `82ba507` exited 1, with `board: FAILED` and every other section ok. The failure was `src/test/actions-for-human-core.test.ts` "archiving a card > archive-settles-the-file-on-disk" at 580,698ms, plus an unhandled "Task not found: BD-1" (`g-checkall.txt`).
- Rerunning that file alone, in `claude/coder-fleet/board`: `bun test --timeout=10000 src/test/actions-for-human-core.test.ts` exit 0, 50 pass, 8.78s (`afh-1.txt`); the same command again exit 0, 50 pass, 9.17s (`afh-2.txt`).
- `git diff --stat fc1b90e HEAD -- claude/coder-fleet/board` is empty, so the board package is unchanged since the start commit.
---

created: 2026-09-30 15:24
---
Fix round 1 complete (resumed coder, 9b3d4e7 and 82ba507, worktree clean). Reported: workflow-logic 411/0, requirements-source-contract 26/0, lead-rules 10/0, and 12 of 12 mutants killed, including the round-1 survivors. The rewrite's add-then-remove was checked live against board 0.1.7 in a scratch repo. The board test that failed inside the coder's check-all (actions-for-human-core, archive-settles-the-file-on-disk) passed twice alone; the board package is unchanged since fc1b90e, and the failure coincided with CF-24.4's parallel suites. That's contention, likely but not proven. I'm running check-all myself on 82ba507 with nothing heavy alongside, plus review round 2 and a refuter (workflow-logic only; no check-all). Filed CF-109 (a fixed 'Provisional:' prefix).
---

author: @SubagentStop
created: 2026-09-30 15:49
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline in the worktree, run once each: `node claude/evals/lib/workflow-logic.mjs` exit 0, 411 passed and 0 failed, 0.06s; `bash claude/evals/lib/requirements-source-contract.sh` exit 0, 26 passed and 0 failed, 0.24s. I did not run check-all.
- Budget: eight mutants on `claude/coder-fleet/workflows/spec-to-card.js`, each in its own copy under `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790781892/m-*`, run with `mut.py` in that directory and the narrow suite `node claude/evals/lib/workflow-logic.mjs`. Nothing was written inside the project.
- survived: deleted `indices.length !== rawOnCard.length || ` from the guard at spec-to-card.js:751 - a card lane reporting fewer indices than criteria is no longer stopped, and the rewrite leaves old criteria on the card next to the re-added ones.
- survived: `if (ticked !== 0) {` changed to `if (ticked > 0) {` at spec-to-card.js:744 - a missing or garbage tick count lets a rewrite untick criteria. The only test uses `ticked: 1`.
- survived: `const laneDecides = (requested === 'auto' && !approved) || requested === 'spec'` changed to `const laneDecides = !approved || requested === 'spec'` - no test notices. Probes P7 and P7b show why, and it is a reviewer-kind defect: `stage: "card"` with an unapproved spec in a project with a requirements source tells the lead to "Interview the human, edit docs/specs/EX-1.md...", because the source-aware message at spec-to-card.js:301 can never be reached.
- survived: `card.indices.map(wholeNumber)` replaced with `rawOnCard.map((_, i) => i + 1)` at spec-to-card.js:750 - no test gives the card lane indices other than 1..n. Probe P5 shows well-formed but wrong indices `[5, 9]` passed straight into `--remove-ac`. This mutant may be equivalent if the board's indices are always positions.
- Killed: M4 `isPrefix = false` (exit 1, 12 failures), M5 provisional check deleted from the extras loop (exit 1, 4 failures, among them clauses-extra-follows and spec-replaces-provisional), M6 read-back compared as a set (exit 1, filed-order-read-back), M7 `laneAnswered` without the `typeof r.line === 'string'` check (exit 1, reqsource-stops:non-string-line).
- Probes P1 to P7b were added to a scratch copy of the suite (`probes.js`, spliced into `probe/claude/evals/lib/workflow-logic.mjs`), exit 0. The results are in the probe summary above.
---

author: @SubagentStop
created: 2026-09-30 16:20
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. Reviewed cf8fb86..82ba507 (9b3d4e7 and 82ba507) against CF-53's criteria #1 to #5, round 1's findings in comments #7 to #10 and the lead's decisions in #8. Read the board's add, remove and renumber code and its index parsing to check the one-edit rewrite.
- must fix: claude/coder-fleet/workflows/spec-to-card.js:242 - `laneDecides` excludes an explicit `stage: "card"`, so `hasSource` is always false there and the unapproved-card stop at :301 tells a requirements-source project to interview the human and approve a spec; this regression came from the must-fix-1 fix and has no test.
- low: claude/coder-fleet/workflows/spec-to-card.js:94 - `PROVISIONAL_RE` matches any criterion starting with the word "provisional"; tighten it to `^Provisional:` (the CF-24.2 backfill text).
- low: claude/coder-fleet/workflows/spec-to-card.js:~745 - no case covers a card lane that returns no `indices` on a rewrite; without the guard the card is written with duplicates before any block.
- low: claude/coder-fleet/workflows/spec-to-card.js:~598 - a clause with an empty `file` sorts first; for a directory source it should stop like a missing position.
- low: claude/coder-fleet/workflows/spec-to-card.js:~820 - the "doubled" nextStep says a rerun will not remove duplicates; under the rewrite logic it will.
- low: claude/evals/lib/requirements-source-contract.sh:~76 - the scan covers `docs/runs/` and `docs/findings/`, so a run article quoting the misspelling fails check-all; exclude those records.
- low: claude/evals/lib/requirements-source-contract.sh:~86 - `misspelling_caught` tests the regex, not `misspelt()`'s path list.
- Convergence: round 1's must-fixes, Lows and refuter survivors are closed; the blocking finding is new, a side effect of the must-fix-1 fix, not a repeat.
---
<!-- COMMENTS:END -->
