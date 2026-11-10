---
id: CF-185
title: >-
  Add /coder-fleet:triage to close finished In Progress cards and ask the human
  what unblocks the rest
status: Done
assignee: []
created_date: '2026-11-10 02:05'
updated_date: '2026-11-10 04:51'
labels: []
dependencies: []
priority: Medium
type: feature
ordinal: 314000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked (2026-11-10): "there needs to be a new command added: `/status` - this command is to go through all in progress items are either move to done if they have passed their Acceptance Criteria, or inform the user as to what the status of the cards are. If there are any any cards in "Blocked" or "Blocked by Human", then a set of multiple choice Q&A options needs to be provided to the user to unblock them. if the are any cards in "In Progress", "Blocked", or "Blocked by Human" and they have open "Actions for Human", then multiple choice Q&A options needs to be provided to the user to unblock them"

Named `triage` rather than `status` because Claude Code's built-in `/status` shadows a plugin command of that name (human's choice in the session).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `claude/coder-fleet/commands/triage.md` exists with a description frontmatter, runs as `/coder-fleet:triage`, and is named in the commands paragraph of `claude/README.md`
- [x] #2 An In Progress card whose every acceptance criterion and Definition of Done item is ticked, and whose work is merged to the default branch, is closed through the board's closing path (a task whose subject carries `[board:<id>]`, which the TaskCompleted gate checks), never by writing a status; when the gate refuses, triage reports the refusal for that card
- [x] #3 Every other In Progress card gets one entry saying, in the human's terms, what is Done and what is Not done: the unticked criteria by number, and any sub-issue or pull request not yet merged
- [x] #4 Every card in Blocked or Blocked by human gets a multiple-choice question through AskUserQuestion, built from its blocker comments, with two to four options and the recommended one first
- [x] #5 Every unticked Actions for Human entry on a card in In Progress, Blocked or Blocked by human is asked as a multiple-choice question through AskUserQuestion, batched at most four questions per prompt, and not asked twice when the card is also covered by criterion 4
- [x] #6 Each answer is recorded on its card: an answered action is ticked with `actionsCheck` in the same `task_edit` call as a comment that names its number and quotes the answer, and a Blocked card's answer is a comment; triage never writes a column and builds nothing
- [x] #7 `bash claude/evals/lib/check-all.sh` passes
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
created: 2026-11-10 02:05
---
Decisions from the human in the session, 2026-11-10:

1. Name: `triage`, run as `/coder-fleet:triage`. Bare `/status` stays Claude Code's built-in.
2. Close rule: close only In Progress cards already fully ticked (every criterion and DoD item) with their work merged to the default branch. Triage never ticks a criterion itself and never runs the suite to prove one; the rest are reported with Done / Not done.

Lead defaults:

3. A Blocked card with no blocker comment to build options from still gets a question, with options such as giving it a decision the human types, leaving it, or moving it back to To Do by hand; triage itself moves nothing.
4. Answering records the decision on the card and stops there. Triage starts no build; the human orders that, or drain picks it up.
5. A card already in Done, To Do, Next or Draft is out of scope.
---

author: lead
created: 2026-11-10 02:05
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-7.

Done: nothing yet. Not done: the human cannot yet run /coder-fleet:triage; scripter is building the command file and README entry.
---

author: lead
created: 2026-11-10 02:08
---
Propose item (from scripter, not filed): bring the commands tree in `docs/fleet-design.md` (around line 211 to 213) up to date; it lists init, kickoff, board, work and prune-worktrees and is missing drain, flush, sweep, agents, triage and springclean. Filed only if the human says so.
---

author: lead
created: 2026-11-10 02:23
---
Sub-issue 1 of 1: started (review round 1 done, fix round 1 running). Done still needs: criteria 1-7.

Review round 1 on 6a6603d: approve with follow-ups, nothing blocking. Gates in the review worktree: check-all.sh exit 0 (118 ok, 0 failed, 318.7 s with 230 s lock wait), scope-hook 773/0, board-hook 269/0, handoff-parity 32 ok.

Fix round 1 commissioned because triage.md:16 contradicts criterion 6 (a "leave it" answer went unrecorded). The reviewer's other three lows ride it: a criterion-less card would be bounced to Blocked by the gate; the dedupe rule could leave an answered blocker-action unticked; a gate refusal already moves the card to Blocked, which the report did not say.

Done: the command is built and reviewed on a branch. Not done: the fix round; unmerged; never run against a live board.
---

author: lead
created: 2026-11-10 02:36
---
Sub-issue 1 of 1: ready to merge in PR #135. Done still needs: criteria 1-7 proven on main (merge), and the release (version bump, tag, flush).

Review round 2 on the fix 6a6603d...babe534: approve with follow-ups, nothing blocking. Gates at babe534: check-all.sh exit 0 (118 ok, 0 failed, 110.3 s), scope-hook 773/0, board-hook 269/0, handoff-parity 32 agree. Two lows dropped under the round cap: the "several minutes per close" warning is true only where the project's gate is strict (this repo), and the leave-it skip keys on the latest comment so a second answer can make it re-ask.

Done: /coder-fleet:triage is reviewed and up as draft PR #135. Not done: unmerged, so the human cannot run it yet; never run against a live board; no version bump. This repo grants the lead nothing past opening the PR, so the merge is the human's.
---

author: lead
created: 2026-11-10 04:35
---
Sub-issue 1 of 1: merged to main at b1dade3. Done still needs: the v0.50.0 release (bump, tag, flush), then ticking criteria and DoD.

Merged at the human's word, 2026-11-10 ("You merge all three"), after CI passed on babe534 and GitHub reported it mergeable.

Done: /coder-fleet:triage is on main. Not done: installs still run 0.49.0, so the human cannot invoke it until v0.50.0 ships.
---

author: lead
created: 2026-11-10 04:49
---
Ticked on evidence, 2026-11-10. Criteria 1-6 are instruction prose in claude/coder-fleet/commands/triage.md and the claude/README.md commands paragraph, on main since b1dade3 (PR #135) and released in v0.50.0 (tag on 829ab6f); each was read against the board source and hooks by the reviewer and approved in round 2 (6a6603d...babe534), as AGENTS.md says prose is proven by reading. Criterion 7: CI deterministic suite passed on babe534 and on the release head 829ab6f, which carries this change.

DoD 1: check-all.sh exit 0 on the branch (babe534, 118 ok). DoD 2: reviewer approved round 2; no refuter round, since the change is prose on no code path and the phase is build. DoD 3: not applicable: no agent body or skill frontmatter changed. DoD 4: bumped to 0.50.0 in plugin.json and marketplace.json (829ab6f), tagged v0.50.0 and pushed. DoD 5: not applicable: the OpenCode port carries no board and none of the board commands. DoD 6: not applicable: no spec.

Done for the human: once the plugin updates to 0.50.0, /coder-fleet:triage runs. Not done: it has never run against a live board; the dropped lows are CF-191.
---
<!-- COMMENTS:END -->
