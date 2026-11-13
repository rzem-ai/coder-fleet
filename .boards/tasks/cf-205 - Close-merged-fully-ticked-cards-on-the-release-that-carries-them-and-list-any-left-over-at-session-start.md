---
id: CF-205
title: >-
  Close merged, fully ticked cards on the release that carries them, and list
  any left over at session start
status: In Progress
assignee: []
created_date: '2026-11-12 22:18'
updated_date: '2026-11-13 04:48'
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
- [ ] #1 Pushing a release tag moves every card named in the release commit's subject that has every criterion and Definition of Done item ticked to Done, through the same card gate and test gate TaskCompleted runs, and leaves any card that fails either gate where it is with a logged reason
- [ ] #2 A card named in the release subject that is not fully ticked, already Done, or not on this board is left alone and the log says which and why
- [ ] #3 The SessionStart hook's context names every In Progress card that is fully ticked and whose pull request named in a `ready to merge in PR #<n>` comment has merged, and moves nothing itself
- [ ] #4 lead-procedures and the drain and triage commands say how a merged card reaches Done after this change, with no step that depends on the lead remembering a close after the release
- [ ] #5 A contract test covers: a fully ticked card closed on a tag push, a red test gate refusing it, an unticked card left alone, and the session-start listing naming a merged card and omitting an unmerged one
- [ ] #6 `bash claude/evals/lib/check-all.sh` passes
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
<!-- COMMENTS:END -->
