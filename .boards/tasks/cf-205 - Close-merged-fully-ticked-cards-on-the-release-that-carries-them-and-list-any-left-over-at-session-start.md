---
id: CF-205
title: >-
  Close merged, fully ticked cards on the release that carries them, and list
  any left over at session start
status: In Progress
assignee: []
created_date: '2026-11-12 22:18'
updated_date: '2026-11-13 05:54'
labels: []
dependencies: []
references:
  - claude/coder-fleet/hooks/hooks.json
  - claude/coder-fleet/skills/lead-procedures/SKILL.md
  - claude/coder-fleet/commands/drain.md
  - claude/coder-fleet/commands/triage.md
priority: High
type: bug
ordinal: 333000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human, 13 Nov 2026, filed in Next at his word ("Release hook + start sweep (Recommended)"), after CF-202 sat In Progress for a day, merged, released in v0.54.0 and fully ticked. He says it has happened several times.

Cause, read from the hooks log and the card: the TaskCompleted gate works (FTH-562.7.x and CF-199 to CF-201.1 moved through it), but a card reaches Done only when a session completes a task whose subject carries `[board:<id>]`, a step that lives only in lead-procedures prose, comes last after the release, and is checked by nothing. CF-202's first close task in the log is the one the lead made on 13 Nov. Its comments carry no `lead` author, so it may have been worked in a session not running as the lead. `/drain` skips such cards by design, and a merge on GitHub fires no hook.

The fix, two parts:
1. On the release: when the lead pushes a release tag, every card the release commit's subject names (the `[CF-202, CF-201.2]` list) that is fully ticked and still short of Done is moved to Done through the same card gate and test gate TaskCompleted uses - never a bare status write that skips the gate.
2. At session start: the SessionStart hook names every In Progress card that is fully ticked and whose ready-to-merge pull request has merged, so the lead closes it before other work. This catches merges made on GitHub, projects that do not release, and sessions that ended before the close.

Lead's defaults, easy to reverse: the release-side close runs once per tag push and logs each card it closes or refuses and why; a red test gate leaves the card where it is and says so, as TaskCompleted does; the session-start part only reports and moves nothing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pushing a release tag moves every card named in the release commit's subject that has every criterion and Definition of Done item ticked to Done, through the same card gate and test gate TaskCompleted runs, and leaves any card that fails either gate where it is with a logged reason
- [x] #2 A card named in the release subject that is not fully ticked, already Done, or not on this board is left alone and the log says which and why
- [x] #3 The SessionStart hook's context names every In Progress card that is fully ticked and whose pull request named in a `ready to merge in PR #<n>` comment has merged, and moves nothing itself
- [x] #4 lead-procedures and the drain and triage commands say how a merged card reaches Done after this change, with no step that depends on the lead remembering a close after the release
- [x] #5 A contract test covers: a fully ticked card closed on a tag push, a red test gate refusing it, an unticked card left alone, and the session-start listing naming a merged card and omitting an unmerged one
- [x] #6 `bash claude/evals/lib/check-all.sh` passes
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
created: 2026-11-13 04:29
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-6.

Taken by /drain on 13 Nov 2026 from Next. A coder is building it on branch cf-205-close-cards-on-release. Done so far: nothing you can see yet. Not done: everything. When it lands, pushing a release tag will close every fully ticked card the release names, through the same checks a normal close runs, and each new session will name any In Progress card that is fully ticked and whose pull request has merged.
---

author: lead
created: 2026-11-13 04:48
---
Two proposals from the coder, not filed:

1. In other projects a release tag will close nothing. lead-procedures' generic Shipping step 5 tags the merge commit, and that commit's subject carries no `vX.Y.Z: ... [ids]` list for the hook to read. Those projects rely on the session-start listing instead. Either step 5 names the release's cards somewhere the hook can read them, such as the annotated tag's message, or those projects stay on the listing.
2. The close runs the full test suite inside the hook on the tag push. In this repo that can hold the lead's turn for up to about 8 minutes. One option is to run it in the background or reuse a recent green result.

Filed only if you say so.
---

author: lead
created: 2026-11-13 04:58
---
Sub-issue 1 of 1: ready to merge in PR #185. Done still needs: Definition of Done 4 (version bump, tag and release, after the merge).

Done: once this merges and ships, pushing a release tag closes every fully ticked card that release names, through the same checks a normal close runs. A card that fails those checks stays put with a comment saying why. Each new session also lists any In Progress card that is fully ticked and whose pull request has merged, so nothing sits there unnoticed. Not done: the merge, which is yours, then the release. Nobody has yet seen it fire on a real tag push.

Evidence for the ticks: criteria 1, 2, 3 and 5 are pinned by release-close-contract.sh (34 cases), and four deliberately broken versions of the hooks were each caught. Criterion 4: lead-procedures, drain and triage now describe the new route, with no close step the lead has to remember. The review checked this by reading. Criterion 6 and DoD 1: the independent review approved round 1 at dde0c9dc, and check-all, scope-hook, board-hook and handoff-parity all exited 0 there. DoD 2: in build phase no break-mode round is called for. DoD 3 not applicable: only skill bodies changed, with no agent body and no frontmatter. DoD 5: a Deferred row was added to the OpenCode divergence register. DoD 6 not applicable: no spec.

The review raised two points that need a decision, neither blocking. My defaults, easy to reverse:
1. This repo's DoD item 4 says the release is tagged and pushed, but the hook closes only fully ticked cards at the moment the tag is pushed. Default: I tick DoD 4 in the release step, after the release PR merges and just before I push the tag, as the new lead-procedures text says. The other option, which needs your word, is to reword DoD 4 or have the hook ignore that one item.
2. In other projects a release tag closes nothing, because they tag a merge commit with no card list. Default: those projects rely on the session-start listing, and the coder's proposal to read the cards from the annotated tag's message stays a proposal until you say otherwise.

A dropped Low, noted in the PR body: a `git push --dry-run` of a tag is treated as a real push.
---

author: lead
created: 2026-11-13 05:32
---
Sub-issue 1 of 1: merged to main at 759eaa41. Done still needs: Definition of Done 4 (the v0.57.0 release, tagged and pushed).

Done: the change is on main. Not done: no install has it until v0.57.0 is released. The machine running this session still has the older plugin, so I am closing this card through a normal close rather than the new tag hook.
---

author: lead
created: 2026-11-13 05:54
---
Released in v0.57.0. Release PR #188 merged with CI green, and tag v0.57.0 is pushed on release commit 681773a0. That ticks DoD 4. Done: every install that updates to v0.57.0 gets the release-tag close and the session-start list of merged cards. Not done: nothing on this card. I am closing it through a normal close, because this session still runs the older plugin, which has no tag hook.
---
<!-- COMMENTS:END -->
