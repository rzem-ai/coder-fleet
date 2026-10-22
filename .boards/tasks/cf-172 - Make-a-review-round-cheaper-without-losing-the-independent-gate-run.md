---
id: CF-172
title: Make a review round cheaper without losing the independent gate run
status: To Do
assignee: []
created_date: '2026-10-22 08:55'
labels:
  - workflows
  - reviewer
dependencies: []
priority: Medium
ordinal: 296000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, after asking whether the plugin held the work back on Fathom FTH-285: "create cards for all those issues in coder-fleet please".

Seen on Fathom, 22 Oct 2026, four review-round runs on small diffs: FTH-285.7 round 1 took 27 min, FTH-285.4 round 1 35 min, FTH-285.4 round 2 44 min, FTH-285.1 round 1 44 min. Each ran a mechanical lane and then the reviewer, and both ran tests; the reviewer re-ran the full server suite on trillian (259 files, ~5900 tests) for client-only diffs and for a round-2 fix that touched three client files. Every sub-issue so far needed a fix round, so a sub-issue took about two hours from spawn to merge, which is why four of FTH-285's seven did not start in the session.

The independent gate run is the point and stays. Running each gate twice per round, and running gates the diff cannot affect, is not.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One round runs each declared gate once, not once in the mechanical lane and again in the reviewer, and the result says which lane ran it
- [ ] #2 A gate whose inputs the diff does not touch (a server suite for a diff with no file under app/server, for example, as the project declares it) is reported as unaffected with the reason instead of run, and the reviewer can still ask for it
- [ ] #3 A round after a fix reviews the fix commit against the previous round's findings rather than re-reading the whole range, and runs only the gates the fix's files affect
- [ ] #4 Each round's result records its wall time per lane, so a slow lane is visible
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
