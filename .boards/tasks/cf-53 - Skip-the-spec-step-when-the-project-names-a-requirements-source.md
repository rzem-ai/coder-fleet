---
id: CF-53
title: Skip the spec step when the project names a requirements source
status: In Progress
assignee: []
created_date: '2026-09-28 01:38'
updated_date: '2026-09-30 14:20'
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
<!-- COMMENTS:END -->
