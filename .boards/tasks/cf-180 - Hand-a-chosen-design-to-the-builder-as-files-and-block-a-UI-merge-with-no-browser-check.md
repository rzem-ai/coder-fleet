---
id: CF-180
title: >-
  Hand a chosen design to the builder as files, and block a UI merge with no
  browser check
status: In Progress
assignee: []
created_date: '2026-11-07 08:03'
updated_date: '2026-11-08 08:32'
labels:
  - lead
  - evaluator
dependencies: []
priority: High
ordinal: 5000
---

## Actions for Human
<!-- ACTIONS:BEGIN -->
- [ ] #1 CF-180 has every UI change from a chosen design proven by a screenshot of the running product, but coders have no browser tools and nothing tells them how to take one; with no App start line a builder who cannot produce a screenshot leaves the comparison undone and the change can still merge. Should builders be taught to screenshot (for example a Playwright script run through Bash), or should such a card go to the human queue when no screenshot is possible?
<!-- ACTIONS:END -->

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
- [x] #1 lead.md step 3: when a card's work comes from a design the human chose, the brief hands the design over as files the subagent can Read (the artboard source and a screenshot, copied into the repo or scratchpad), never only a link to a claude.ai canvas
- [x] #2 lead.md step 3: such a card carries a criterion that the built screen matches the design, proven by a screenshot of the running product set beside the design's, and the lead's defaults never add or drop structure the design has without asking
- [x] #3 lead.md step 4 or 5: a UI change whose handoff says it was not checked in a browser is not marked ready while an evaluator or a screenshot can check it; with no App start line, the lead looks at the builder's screenshot against the design itself before merging
- [x] #4 The reviewer's brief from review-round, for a card with design files, tells it to read them and the builder's screenshot and to report a visible difference the handoff does not name as must fix
- [x] #5 Where /kickoff or /init meets a project with a client UI and no App start line, it says the evaluator will not run and recommends one
- [x] #6 The OpenCode port says the same where it carries these steps, with a divergence-register row where it differs
- [x] #7 reviewer.md: a criterion or card reference pointing at a design the reviewer cannot open (a claude.ai canvas, an image it was not given) is reported under Unverified, never passed by silence; the lead treats that as the comparison not done
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-08 07:51
---
Drain, 8 Nov 2026. Lead decisions before the first build spawn: built on origin/main (095d136), not stacked, since nothing here depends on an unmerged card; review-round.js is also changed by CF-181 (PR #131, the reviewer prompt) and CF-183.2 (the scope lane), so criterion 4's change goes in one small helper and one prompt sentence to keep the merge short; lead.md steps 3 and 4 are also changed by CF-181 (step 4's where-reviews-run sentence) and CF-183.2 (step 5's memory sentences), so this card adds its own sentences and rewords none of theirs. The design files in criterion 1 are copied into the scratchpad when the work is for this session and into the repo only when the card says the design is part of the deliverable.

Sub-issue 1 of 1: started. Done still needs: criteria 1-7.
---

author: lead
created: 2026-11-08 08:02
---
Built on cf-180-design-files-and-browser-check (from origin/main 095d136): 392570c designBrief(id) in review-round.js plus one verdict-prompt element, workflow-logic 688/0 with three new checks watched failing; fe22e82 lead.md step 3 (design handed over as files, a `Design: <path>, <path>` comment on the card, a matches-the-design criterion proven by screenshots side by side, no structure added or dropped without asking) and step 4 (a UI change not checked in a browser is not ready; with no App start line the lead compares screenshots itself; a reviewer's unopenable design means the comparison was not done); b2ed109 reviewer.md step 1; 80eae89 kickoff check 9 and init step 3; c3a641a the OpenCode lead and reviewer with two register rows; efccab5 coder memory. migration-checklist: no findings. Coder's check-all.sh exit 0 captured, 89.0 s.

Coder's unverified points: whether a reviewer can Read the lead's scratchpad; whether a coder can take a screenshot at all; the `Design:` line is a convention nothing parses; lead.md lines 31-32 will conflict with CF-181 (#131) and cf-183.2 as one-paragraph lines.

Proposed by the coder (not filed): (1) the OpenCode register has no row for agents/evaluator.md or the template's App start/App url lines; (2) templates/AGENTS.md after `App url:` could say a UI change with no App start line rests on the lead's screenshot comparison. Review round 1 next.
---

author: lead
created: 2026-11-08 08:12
---
Sub-issue 1 of 1: ready to merge in PR #132. Done still needs: criteria 1-7 ticked once proven on main; the release bump and tag; action 1 (a follow-up beyond the criteria).

Review round 1 (095d136..efccab5): approve with follow-ups. Gates from the review worktree: check-all.sh exit 0 (88.1 s), scope-hook 773/0, board-hook 269/0, handoff-parity agree. All seven criteria met as written. One low dropped (reviewer.md step 1 does not say to report a missing screenshot when spawned outside review-round). No refuter: build phase, prose plus a prompt helper.

The reviewer's follow-up is a decision beyond the criteria, so this drain put it on the card as action 1 rather than parking the card: nothing tells a builder how to produce the screenshot the new criterion relies on. Reviewer's unverified point, for the same decision: the design files go in the session scratchpad, but the `Design:` comment outlives the session, so a later session's fix round finds the paths gone.

Done: design hand-over, the unchecked-UI hold, the reviewer's design brief and kickoff's evaluator note are reviewed and up as draft PR https://github.com/rzem-ai/coder-fleet/pull/132. Not done: not merged; the screenshot question.
---

author: lead
created: 2026-11-08 08:32
---
Sub-issue 1 of 1: merged to main at 61bb049 (PR #132, merged on Alex's "merge the ready PRs"). Done still needs: Definition of Done 4, the version bump and tagged release; action 1, the screenshot question.

After #130 and #131 merged, lead.md lines 31 and 32 conflicted (one paragraph per line); the lead spliced this card's two insertions into main's versions at their anchors, each checked a pure insertion with a unique anchor, so main's #130 example and #131 step 4 text are kept (merge commit bd9315e, workflow-logic passing, CI deterministic pass). Criteria ticked on main, on evidence from review round 1 on efccab5: 1 and 2 lead.md step 3; 3 lead.md step 4; 4 designBrief in review-round.js with three workflow-logic checks; 5 kickoff check 9 and init step 3; 6 the OpenCode lead and reviewer with two register rows; 7 reviewer.md step 1. Definition of Done: 1 check-all.sh exit 0 at efccab5 and CI on bd9315e; 2 review round 1 approved, no refuter; 3 migration-checklist findings in PR #132 (none); 5 two register rows; 6 not applicable, no spec.

Done: on main, a chosen design reaches the builder and reviewer as files and an unchecked UI change is held from ready. Not done: not released; the screenshot question in action 1.
---
<!-- COMMENTS:END -->
