---
id: CF-171
title: >-
  Seed a project's Definition of Done from the project, not from coder-fleet's
  release list
status: In Progress
assignee: []
created_date: '2026-10-22 08:55'
updated_date: '2026-11-11 23:50'
labels:
  - board
  - lead
dependencies: []
priority: Medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, after asking whether the plugin held the work back on Fathom FTH-285: "create cards for all those issues in coder-fleet please".

Seen on Fathom, 22 Oct 2026: /init seeded Fathom's .boards/config.yml definition_of_done with coder-fleet's own release list - check-all.sh, a migration-checklist run, the plugin.json and marketplace.json version bump and tag, the port divergence register. None exists in Fathom. Every card carries them, and the TaskCompleted hook blocked FTH-285.7's close, moved the card to Blocked and listed six unticked items, until the lead ticked each as not applicable.

The list is right for this repository and wrong for every project /init sets up.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /init and /kickoff write a project-neutral definition_of_done (reviewer approved; refuter where lead step 4 calls for one; the project's declared gates green; spec linked where there is one) and never coder-fleet's own release steps
- [x] #2 /init offers the project's gates block from AGENTS.md as the gates item when one exists
- [x] #3 /kickoff on a project whose board already carries coder-fleet's release items says so and offers to replace them, changing nothing without the human's yes
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
created: 2026-11-11 22:24
---
Sub-issue 1 of 1: started, 12 Nov 2026, by drain; the card is in Next, which is the human's order. Done still needs: criteria 1 to 3.

Lead notice: /init and /kickoff seed a new project's board with a project-neutral Definition of Done instead of coder-fleet's own release list, /init offers the project's gates block as the gates item, and /kickoff offers to replace the release items on a board that already carries them. What the human will see: a new project's cards no longer carry check-all.sh, the plugin version bump and the divergence register, and a close is no longer blocked by them.

Lead defaults for the builder: the neutral list follows the current fleet, where the refuter is folded into the reviewer, so its second item reads as the reviewer approved, with a break round where the lead's step 4 calls for one; this repository's own board keeps its release list, which is right here; /kickoff recognises the release items by their text and changes nothing without the human's yes. Base: main at e7c332e. Two other cards in this drain change other steps of init.md (CF-188 step 2a, CF-191 step 2b).

Done: nothing yet. Not done: /init still seeds coder-fleet's release list.
---

author: lead
created: 2026-11-11 22:38
---
Coder handoff, 12 Nov 2026: branch cf-171-neutral-definition-of-done at 644e41a, two commits on e7c332e, up as draft PR https://github.com/rzem-ai/coder-fleet/pull/157. The template's seeded list is now three items: the reviewer approved, with a break round where the lead's step 4 calls for one; the gates declared in AGENTS.md are green on the branch; the spec, where there is one, is linked. A test pins them and that the template names no release step (check-all.sh, migration-checklist, plugin.json, marketplace.json, divergence register); it failed against the old template and with a release step added back. init.md gains step 3a, which offers the project's gates block as the gates item on the human's yes; kickoff.md gains a Definition of Done paragraph that names release items on an existing board, shows the replacement and changes nothing without a yes, skipping the coder-fleet repo itself. The port has no board, so nothing changes there. Coder's check-all.sh: exit 0 after a 230 s lock wait.

A finding that changes the card's premise: nothing in today's plugin seeds coder-fleet's release list. Since CF-24.2 the template has seeded four general items, so the coder could not find what put the release list on the Fathom board; the likeliest cause, unconfirmed, is a lead rebuilding the list from this repo's board. Kickoff's offer repairs such a board whatever put it there.

Unverified by the coder: the template drops the general "docs updated" item because criterion 1 lists only three kinds; the gates item names each gate and does not quote the commands; step 3a's two-copy config edit was never run on a real project; how init.md merges with CF-188's and CF-191's edits.

Proposed by the coder (not filed): offer to remove the release steps from open cards that already carry them, since the replacement reaches only cards made afterwards.

Review round 1 running. No break round: build phase, no authentication path.
---

author: lead
created: 2026-11-11 22:48
---
Sub-issue 1 of 1: ready to merge in PR #157. Done still needs: the merge, which is the human's under drain, and Definition of Done 4, the version bump and tag.

Review round 1 (e7c332e..644e41a): approve with follow-ups, no must-fix. Gates run by the reviewer at 644e41a: check-all.sh exit 0 (board 366/0), scope-hook 916/0, board-hook 268/0, handoff-parity 32 agree. CI on 644e41a: deterministic pass.

Ticked on evidence: criterion 1 (the template's three items and the TEMPLATE_DEFAULTS pin in dod-defaults-config.test.ts; the reviewer confirmed from the template's history that no release step was ever seeded there); 2 (init.md step 3a, read by the reviewer); 3 (kickoff.md's Definition of Done paragraph, read by the reviewer). Definition of Done: 1 the reviewer's and CI's runs; 2 the review approved, no break round in the build phase off an authentication path; 3 not applicable: commands and a template changed, no agent body or skill frontmatter; 5 not applicable: the port has no board; 6 not applicable: no spec.

Left open, recorded here and not filed. Follow-up: after a yes, open cards that already carry the release steps keep them; removing them is new behaviour for the human to decide. Low, dropped: kickoff's five markers miss this repo's sixth item, the old refuter-round line, so a repaired board keeps it beside the template's reviewer item; a test comment says four markers where there are five; the release-marker test would also pass on the old template, and the list pin is what catches a revert. Unverified: step 3a has never run on a real project; what put the release list on Fathom's board is still unknown; init.md's merge with CF-188 and CF-191.

Done: on the branch, a new project's board is seeded with three neutral items, and /kickoff offers to drop coder-fleet's release steps from a board that has them. Not done: not merged, not released.
---

author: lead
created: 2026-11-11 23:50
---
Sub-issue 1 of 1: merged to main at 347baf4 (PR #157, squash-merged by the lead on the human's order of 12 Nov 2026, "merge the ready PRs yourself, then tag a new version"). GitHub reported it mergeable on top of CF-191's change to another step of init.md; the combination's first suite run is CI on main. Done still needs: Definition of Done 4, the release bump and tag the human ordered.

Done: on main, a new board is seeded with three neutral Definition of Done items and /kickoff offers to drop coder-fleet's release steps. Not done: not released. The worktree and branch are removed.
---
<!-- COMMENTS:END -->
