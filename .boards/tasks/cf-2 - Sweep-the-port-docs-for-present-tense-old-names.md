---
id: CF-2
title: Sweep the port docs for present-tense old names
status: In Progress
assignee: []
created_date: '2026-09-26 12:21'
updated_date: '2026-10-06 14:10'
labels: []
dependencies: []
priority: Low
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
opencode/docs and codex/docs still say claudecode-agents and Alex in lines describing the present rather than history, for example codex/docs/specs/GPTA-1.md lines 61 and 238 and divergence-register rows 19 and 69; lines that record history stay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No line under opencode/docs or codex/docs that describes the present state of the port says `claudecode-agents` or names the human; the examples in the description (codex/docs/specs/GPTA-1.md lines 61 and 238, divergence-register rows 19 and 69) are among the fixed lines
- [ ] #2 Every line that records history, a past decision or a dated event keeps its text, and the handoff lists each line left alone for that reason with the file and line
- [ ] #3 Nothing outside opencode/docs and codex/docs changes
- [ ] #4 bash claude/evals/lib/check-all.sh passes on the branch
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
created: 2026-10-06 14:06
---
Ordered: the human placed this card in Next (ordinal 2000, second from the top) on 2026-10-06. It is a prose sweep, so no spec: the provisional criterion is replaced by four written from the card's own words, which are the human's. Decisions the builder needs: 'present tense' means a line describing how the port is or works now; a line recording what was done, decided or named at a date stays. Replacement wording is 'coder-fleet' for the old project name and 'the human' for the name, as AGENTS.md says. Taken now in parallel with CF-12.3 because the two touch no common file. CF-143 (top of Next) waits until CF-12.3 merges, since both edit docs/fleet-design.md and the Next contract; the lead should have taken CF-143 and CF-2 before CF-12.3 and did not.
---

author: @SubagentStop
created: 2026-10-06 14:10
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Commit `5e55ec7` on `cf-2-port-doc-names`, "Name coder-fleet and the human in present-tense port doc lines (CF-2)". It changes 10 lines in 4 files, all under `opencode/docs/` and `codex/docs/`. I opened no PR and made no version bump.
- Fixed `opencode/docs/divergence-register.md:19`: "Alex's Projects and Tasks databases" became "the human's".
- Fixed `opencode/docs/divergence-register.md:71`: "costs Alex his personal skills" became "costs the human their personal skills".
- Fixed `opencode/docs/specs/opencode-agents-port.md:74`: the success condition now says "the human can open OpenCode".
- Fixed `opencode/docs/specs/opencode-agents-port.md:88`: I dropped the `/Users/alex/...` source checkout path, leaving "a checkout on the author's machine". The path stays in `opencode/docs/measurements/phase-0-spike.md:18`.
- Fixed `opencode/docs/specs/opencode-agents-port.md:98`: the non-goal now says "the human's own machines".
- Fixed `opencode/docs/specs/opencode-agents-port.md:158`: the conformance threshold is set by "the human".
- Fixed `opencode/docs/specs/opencode-agents-port.md:208`: the shadowing risk is on "the human's machine".
- Fixed `opencode/docs/plans/opencode-agents-port.md:9`: the goal now starts "The human can open OpenCode".
- Fixed `opencode/docs/plans/opencode-agents-port.md:75`: the escape-hatch trade costs "the human's personal skills".
- Fixed `codex/docs/plans/GPTA-1.1.md:48`: the non-goal now says "Anything in `coder-fleet`". This is the only `claudecode-agents` line under the two directories, and it was present tense.
- The card's named line numbers are stale. `codex/docs/specs/GPTA-1.md` lines 61 and 238 hold neither `claudecode-agents` nor the name. They are the TaskCompleted table row and a scope-rules line. There are no name hits anywhere in `codex/docs` apart from the `GPTA-1.1.md` line above.
- I treated register row 19 as file line 19, which does hold the name, and fixed it. Line 69 holds no name.
- `bash claude/evals/lib/check-all.sh` passed with exit 0, in 95.7s. Its final line was "Every deterministic check passes." Output is in the scratchpad at `check.out`.
- Left alone as history, in `opencode/docs/specs/opencode-agents-port.md`: lines 9, 23, 29, 49 (what the human wanted or confirmed at the time) and line 240 (a choice already made, from a measurement).
- Left alone as history, also in `opencode/docs/specs/opencode-agents-port.md`: lines 262, 276, 280, 284, 300, 302, 306, 310, 314, 320 (open-question text from spec time).
- Left alone as history: `opencode/docs/plans/opencode-agents-port.md:5` (the approval on 2026-09-12).
- Left alone as history: `opencode/docs/findings/claude-agents-2026-09-12.md:58, 106` (a dated findings document).
- Left alone as history: `opencode/docs/reviews/2026-09-12-phase-3-scout-ruleset.md:3` (a dated review).
- Left alone as history: `opencode/docs/measurements/phase-0-spike.md:18, 235` (a dated measurement, with a path and a hypothetical).
- Left alone as history: `opencode/docs/measurements/runtime.md:112, 117, 134, 140` (verbatim errors and token data).
- Left alone as history: `opencode/docs/measurements/context-overhead.md:142` (recall output).
- Left alone as history: `opencode/docs/runs/2026-09-12-refuter-phase-4-enforcement-residue.md:13` (a dated run article with a path).
---
<!-- COMMENTS:END -->
