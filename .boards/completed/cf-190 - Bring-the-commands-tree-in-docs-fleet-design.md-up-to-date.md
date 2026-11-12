---
id: CF-190
title: Bring the commands tree in docs/fleet-design.md up to date
status: Done
assignee: []
created_date: '2026-11-10 04:28'
updated_date: '2026-11-11 16:11'
labels: []
dependencies: []
priority: Low
type: docs
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 2026-11-10, from the CF-185 scripter: the commands tree in docs/fleet-design.md (around lines 211-213) lists init, kickoff, board, work and prune-worktrees, and is missing drain, flush, sweep, agents, triage and springclean.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The commands tree in docs/fleet-design.md lists every file under claude/coder-fleet/commands/, and the comment beside it matches
- [x] #2 `bash claude/evals/lib/check-all.sh` passes
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
author: lead
created: 2026-11-11 15:31
---
Sub-issue 1 of 1: started, 12 Nov 2026. Done still needs: criteria 1 and 2.

The card is in Next, the human's order. Lead notice: the design doc's tree comment beside commands/ names all eleven command files instead of five. The lead builds it itself under the size-floor exception (one line of prose, no endpoint, schema or credential path), in its own worktree on branch cf-190-list-every-command, through a pull request, with review-round's reviewer running the gates rather than the lead.

Done: nothing yet. Not done: the tree lists init, kickoff, board, work and prune-worktrees only.
---

author: lead
created: 2026-11-11 15:41
---
Sub-issue 1 of 1: merged to main at 393ed91 (PR #148, squash-merged by the lead on 12 Nov 2026 on the human's order). Done still needs: Definition of Done 4, which rides the release the human ordered; the change itself is a design doc outside the shipped plugin.

Review round 1 (bcec78a..b02a398): approve with one follow-up. The reviewer compared docs/fleet-design.md:209 with the eleven files under claude/coder-fleet/commands/, nothing missing or extra, and ran the gates from the review worktree, not the lead: check-all.sh exit 0 (119.4 s), scope-hook 916/0, board-hook 268/0, handoff-parity 32 ok. CI on b02a398: deterministic pass in 4m39s. No break round: prose only.

Ticked on that evidence: criterion 1 (the reviewer's comparison) and 2 (its check-all run and CI). Definition of Done: 1 the same; 2 review round 1 approved; 3 not applicable: no agent body or skill frontmatter changed; 5 not applicable: no ported artefact changed; 6 not applicable: no spec. The lead's worktree and branch are removed.

Proposed by the reviewer, not filed: a structural check in check-all.sh that parses the commands/ tree line and compares it with the files on disk, as the roster check does for the README table, so the line cannot fall behind again unnoticed.

Done: on main, the design doc's tree names every command. Not done: nothing on this card but the release item.
---

author: lead
created: 2026-11-11 16:05
---
Released with v0.51.0, 12 Nov 2026: bump b53330a, tag v0.51.0 pushed, flush e552c9d. Ticked: Definition of Done 4. Done still needs: nothing on this card.
---
<!-- COMMENTS:END -->
