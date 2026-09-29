---
id: CF-3
title: Qualify the agent type names in the review-round workflow script
status: To Do
assignee: []
created_date: '2026-09-18 04:14'
updated_date: '2026-09-29 12:12'
labels: []
dependencies: []
references:
  - memory-tree BD-26
priority: High
project: Claude Agents
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Formerly BD-1 on the claudecode-agents board, renumbered when the boards were folded into the coder-fleet repo on 26 September 2026. Log entries below keep the old ids.

The review-round workflow fails on its first agent in any project where the fleet agents are namespaced, which is all of them.

skills/review-round ships a script whose agent type constants are bare names:

  const SCOUT = 'scout'
  const REVIEWER = 'reviewer'
  const CODER = 'coder'
  const REFUTER = 'refuter'

The runtime registers them as 'claudecode-agents:scout' and so on, so the first agent() call throws "agent type 'scout' not found" and the whole run dies about eighteen seconds in. Hit live on myassist-researcher RZE-289 phase 1, round 1. Patching the four constants in the generated script and resuming ran it fine, so the four constants are the whole defect.

The fix is not simply a find and replace, because the script's own header comment says the SubagentStop matcher lists the ten bare fleet names, and the bare names were presumably chosen for that. So whoever fixes this needs to establish which form the hook matcher actually receives and match on that, rather than swapping one broken assumption for another. If the hook wants the bare name and the runtime wants the qualified one, the script needs both and a comment saying why.

Worth checking every other shipped workflow script for the same constants before closing.
<!-- SECTION:DESCRIPTION:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-18 04:26
---
A second defect in the same script, and the worse of the two: unknown arguments are silently ignored.

Invoked with { round, target, issue, phase }, the script reads only `range` (line 156: `input.range || (input.base && input.head ? ... : 'HEAD~1...HEAD')`). `target` is not a parameter, so it fell through to the HEAD~1...HEAD default and reviewed the previous commit on main - a docs commit - instead of the branch it was pointed at. The run completed, reported "request changes" with four blocking findings, and named a range in its result that nobody reads as carefully as they read the verdict.

Silently reviewing the wrong thing is worse than failing to start. The agent-name defect at least announced itself in eighteen seconds.

Two fixes worth considering together: reject unknown top-level keys in `input` rather than ignoring them, and accept a branch or worktree name as a target by resolving it to `<merge-base>...<branch>`, since pointing a review at a branch is the common case and `range` makes the caller construct it by hand.

Found the same way as the first defect, on myassist-researcher RZE-289 phase 1.
---

author: @SubagentStop
created: 2026-09-26 14:01
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- /Users/alex/Dev/Work/extensions/coder-fleet/claude/coder-fleet/hooks/hooks.json:18 matcher: `^(coder-fleet:)?(lead|scout|spec-writer|coder|scripter|reviewer|ui-designer|tech-writer|researcher|fleet-steward|refuter)$` — lists 11 agent names: lead, scout, spec-writer, coder, scripter, reviewer, ui-designer, tech-writer, researcher, fleet-steward, refuter.
---

author: lead
created: 2026-09-29 12:12
---
Triage 2026-09-29 (scout, against main at 458312f).

Defect 1 (bare agent type names) is gone. All three workflows use qualified names: `claude/coder-fleet/workflows/review-round.js:110-113` (`coder-fleet:scout`, `:reviewer`, `:coder`, `:refuter`), `spec-to-card.js:56-58` and `deep-research.js:35-36`. The qualified form came in with 508e4eb (plugin rename to coder-fleet). The hooks.json:18 SubagentStop matcher `^(coder-fleet:)?(...)$` accepts both forms, which answers the description's question about which form the hook receives. `claude/evals/lib/workflow-logic.mjs` asserts the qualified names (e.g. lines 292, 399, 1287). The script now lives only under `workflows/`; `skills/review-round/` no longer ships it.

Defect 2 (unknown input keys silently ignored) is still live. `review-round.js:205-206` reads `input.range`, or `base`+`head`, and otherwise defaults to `HEAD~1...HEAD`. It also reads `issue`, `maxRounds`, `fix`, `refute` and `round`. It has no unknown-key check and no `target` or branch resolution, and no test covers either. A caller passing `target` still gets the previous commit on main reviewed without any error.

Not re-verified: a live run showing the runtime still resolves `coder-fleet:`-qualified names. The tests show the expectation only.
---
<!-- COMMENTS:END -->
