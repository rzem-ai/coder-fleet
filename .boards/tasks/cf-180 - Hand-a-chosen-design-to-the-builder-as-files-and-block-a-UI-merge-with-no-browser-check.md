---
id: CF-180
title: >-
  Hand a chosen design to the builder as files, and block a UI merge with no
  browser check
status: Next
assignee: []
created_date: '2026-11-07 08:03'
updated_date: '2026-11-08 04:09'
labels:
  - lead
  - evaluator
dependencies: []
priority: High
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 7 November 2026, from the Fathom session that built FTH-506 (a status bar queue tray from a design he picked on a claude.ai Design canvas). v1.57.0 shipped a tray that behaved right but looked nothing like the artboard: "this is what was designed, not what was delivered". Asked why the coder and reviewer could not see the canvas and why neither the review nor the lead compared the result, he chose three fixes: Fathom's App start line (FTH-509, so the evaluator runs), a Fathom project rule for design-led UI (FTH-510), and this change to the plugin.

What went wrong, generically:
- The lead's brief linked the canvas and described it in prose. Subagents cannot open claude.ai artifacts (only the main session has the Artifact tool, and WebFetch cannot pass its sign-in), yet the lead had the artboard's .dc.html on disk in its own scratchpad and could have handed over the path; Read shows .dc.html and PNG alike.
- The lead's own defaults added structure the design did not have (a fourth column).
- The card's criteria named behaviour, never the design's look, so the reviewer graded exactly what it was asked and approved.
- Every handoff carried "not checked in a browser" under Unverified, and the lead merged and deployed through it three times.
- No evaluator ran because the project had no App start line, and nothing told the lead that a UI card without one is unverified by design.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lead.md step 3: when a card's work comes from a design the human chose, the brief hands the design over as files the subagent can Read (the artboard source and a screenshot, copied into the repo or scratchpad), never only a link to a claude.ai canvas
- [ ] #2 lead.md step 3: such a card carries a criterion that the built screen matches the design, proven by a screenshot of the running product set beside the design's, and the lead's defaults never add or drop structure the design has without asking
- [ ] #3 lead.md step 4 or 5: a UI change whose handoff says it was not checked in a browser is not marked ready while an evaluator or a screenshot can check it; with no App start line, the lead looks at the builder's screenshot against the design itself before merging
- [ ] #4 The reviewer's brief from review-round, for a card with design files, tells it to read them and the builder's screenshot and to report a visible difference the handoff does not name as must fix
- [ ] #5 Where /kickoff or /init meets a project with a client UI and no App start line, it says the evaluator will not run and recommends one
- [ ] #6 The OpenCode port says the same where it carries these steps, with a divergence-register row where it differs
- [ ] #7 reviewer.md: a criterion or card reference pointing at a design the reviewer cannot open (a claude.ai canvas, an image it was not given) is reported under Unverified, never passed by silence; the lead treats that as the comparison not done
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
