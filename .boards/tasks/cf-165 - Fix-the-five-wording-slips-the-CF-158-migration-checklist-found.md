---
id: CF-165
title: Fix the five wording slips the CF-158 migration checklist found
status: In Progress
assignee: []
created_date: '2026-10-18 08:22'
updated_date: '2026-10-18 08:57'
labels: []
dependencies: []
type: docs
ordinal: 302000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-18: "fix the wording slips". These are the five lows from the migration-checklist review recorded in CF-158 comment #9.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 claude/coder-fleet/agents/lead.md and opencode/coder-fleet/agent/lead.md tell the lead to save an article returned above a handoff by any read-only agent that returns one (reviewer, researcher, refuter, evaluator where it exists)
- [x] #2 run-article SKILL.md (both copies) states accurately which agents preload it and which return articles rather than writing them, without claiming their frontmatter forbids file creation
- [x] #3 The comment at claude/coder-fleet/agents/lead.md lines 9-10 names only the board server
- [x] #4 opencode compound and run-article skills no longer name a memory destination the port lacks
- [x] #5 opencode/coder-fleet/agent/researcher.md says where durable findings go (a heading the OpenCode lead acts on), or drops the instruction
- [x] #6 Vendored copies stay in sync, and bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-18 08:40
---
Sub-issue 1 of 1: ready to merge in PR #98 (v0.41.4). Done still needs: the human to merge #98, after #97 (CF-159, v0.41.3), with a rebase on the version lines; then the tag.

Evidence:
- Review round 1 asked for changes: the OpenCode run-article description said 'Preloaded'; the researcher's register row said 'Ported'.
- Fix commit 833fc77 changes exactly those 3 lines, read by the lead. Prose only, so no refuter.
- CI 'deterministic' passed in 3m35s on 833fc77.
- opencode unit: 56 pass, 0 fail.

Not done: nothing merged yet.
---

created: 2026-10-18 08:53
---
Sub-issue 1 of 1: merged to main at 0caf5b7 (PR #98); release commit a2085c7 tagged v0.41.4. Done still needs: nothing.

Evidence:
- #1 to #5: the lead body step 5, both run-article copies, the lead.md comment, the OpenCode compound and run-article, and OpenCode researcher step 6 were all reviewed. Round 1's must-fix and low were closed in 833fc77, which the lead read.
- #6: opencode unit 56/56; check-all on a2085c7 exited 0 on macOS, all 37 sections ok; CI passed in 3m11s.
---

created: 2026-10-18 08:57
---
Definition of Done:
- #1: check-all exited 0 on a2085c7 on macOS (37 sections ok); CI passed in 3m11s.
- #2: the reviewer requested changes in round 1, and the lead read and confirmed the fix commit 833fc77. No refuter: prose-only change.
- #3: the migration-checklist structural checks are recorded in the PR #98 body. Frontmatter keys, tools, skills and step counts are unchanged.
- #4: 0.41.4 in plugin.json and marketplace.json; v0.41.4 tagged on a2085c7 and pushed.
- #5: the divergence register rows for skills/run-article and agents/researcher.md are updated.
- #6: not applicable: no spec.
---
<!-- COMMENTS:END -->
