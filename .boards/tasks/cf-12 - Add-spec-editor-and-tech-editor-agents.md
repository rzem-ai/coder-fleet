---
id: CF-12
title: Add spec-editor and tech-editor agents
status: Next
assignee: []
created_date: '2026-09-27 01:45'
updated_date: '2026-10-06 14:02'
labels: []
dependencies: []
references:
  - docs/fleet-design.md
  - claude/coder-fleet/commands/kickoff.md
  - claude/coder-fleet/agents/spec-writer.md
  - claude/coder-fleet/agents/tech-writer.md
  - docs/specs/CF-12.md
priority: Medium
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's idea, verbatim (2026-09-27): "there are 2 more agents that I would like you to consider adding: `spec-editor` and `tech-editor`. these 2 agents for claude would use Fable. they are super short lived to ensure that they don't cost a fortune. part of the kickoff step should ask whether these agents use Fable class models or Opus class, or should then exist at all"

Needs a spec before planning. It is a deliberate, narrow exception to design sections 2, 4 and 5 ("Fable is never a subagent model"), whose stated reason is frequency; the spec has to say why a short-lived, low-frequency editor pass is outside that argument.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provisional: the spec settles what done means here, and its criteria replace this one
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @SubagentStop
created: 2026-09-27 01:49
---
Blocked by human. coder-fleet:spec-writer raised 3 blocker(s). From "## Decisions needed" in its handoff:

- Q1 and Q2. Does `spec-editor` exist, and does it edit the human's spec or only report on it? The roster, scope hook, evals and workflow changes all depend on this.
- Q7. Which mechanism carries the Fable / Opus / neither choice to a plugin agent? M1 (two definitions per agent) keeps frontmatter static but doubles every body. M3 (setting the model on each spawn) means changing the lead's "never set another agent's model" rule and `docs/agent-contract.md` section 3.
- Q3. Fable as the default on judgement, or settle it with one eval run of both models.
---

author: @SubagentStop
created: 2026-09-27 02:02
---
Blocked by human. coder-fleet:spec-writer raised 1 blocker(s). From "## Decisions needed" in its handoff:

- when a project answers "neither" for the tech editor, does the lead fall back to its own review pass on external-audience documents, or does no second pass happen? The decisions replace the lead's pass but don't say what happens when it's switched off, and `lead.md` step 4 can't be rewritten without the answer.
---

author: @SubagentStop
created: 2026-09-27 02:04
---
Blocked by human. coder-fleet:spec-writer raised 2 blocker(s). From "## Decisions needed" in its handoff:

- when a project answers "neither" for the tech editor, does the lead fall back to its own review pass on external-audience documents, or does no second pass happen? `lead.md` step 4 can't be rewritten without the answer.
- must every must-resolve challenge be resolved or struck before the human approves a spec, and does the lead refuse to plan from a spec that still has one open? This decides whether the lead or `spec-to-plan` gains a gate check.
---

author: @SubagentStop
created: 2026-09-27 02:10
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Recorded Q13 and Q14 under Decisions as the human's answers of 2026-09-27, and updated the header and "How to read this spec" to mention them.
- Q13 gives the intended wording for `lead.md` step 4: the chosen tech editor on every `tech-writer` output when the project has one, otherwise the lead's opus pass on external-audience output only, and none on internal output.
- Q14 records the gate: each must-resolve challenge is fixed or struck with a one-line reason, the lead greps before planning with no hook, and the check lives in `lead.md` step 3 and `spec-to-plan`'s plan stage.
- Added the section "The challenge notation": the exact heading, one line per challenge (id, severity, state), `[open]` written by `spec-editor`, the human's `[resolved]` or `[struck: <reason>]`, and that inline markers take no part in the gate.
- The same section spells out the gate: what it refuses, and that only must-resolve lines can block.
- Roster ripple: `lead.md` gains the step 3 gate and the step 4 wording, the design's escalation note becomes conditional on Q13, and `spec-to-plan`'s plan stage gains the gate with tests in `workflow-logic.mjs`.
- Added two non-goals: no hook enforces the gate, and no second pass on internal documents without a tech editor.
- Acceptance criteria are now 19. New criterion 8 lists the gate's test fixtures and the outcome each must give.
- New criterion 9: `spec-to-plan` refuses to spawn its Plan agents and names the blocking ids, and `lead.md` step 3 states the same gate.
- Criterion 12 now matches Q13, and criterion 4 now requires every new challenge line to be `[open]`.
- Removed the two answered open questions ("neither" for the tech pass, and what happens to challenges after the edit). Added one: one gate script or two copies.
- Every earlier guess is still marked.
---

author: @lead
created: 2026-09-27 02:16
---
Split into sub-issues on 2026-09-27 at the human's request: CF-12.1 spike; CF-12.2 one body source per editor pair (generator plus check-all check); CF-12.3 the spec-editor pair and the challenge gate, with the design's bounded Fable exception; CF-12.4 the tech-editor pair and lead step 4; CF-12.5 the per-project questions at init and kickoff with the deny rules (after CF-9). Each pair carries its own roster rows so the roster contract stays green between merges. CF-12 closes when CF-12.5 lands; the spec docs/specs/CF-12.md covers all five.
---

author: @SubagentStop
created: 2026-09-27 02:20
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- Recorded Q19 under Decisions: the closed-marker line, what `<sha>` names, the three gate outcomes, and why a hand-typed marker passes. Updated Q18 from "removes" to "replaces the section with the closed marker (Q19)", and "How to read this spec" now says Q15 to Q19.
- "The challenge notation" now defines the closed marker and runs the gate in order: closed marker passes; intact section is checked; neither present refuses when the project has a spec editor; "neither" has no gate; a hand-typed marker passes by design.
- The close sequence in that section now replaces the section with the marker, strips the inline markers, commits "Close the challenges on <issue>", then plans. The history stays readable at the commit the marker names.
- Roster ripple: `lead.md` step 3 and `spec-to-plan`'s plan stage pass on a closed marker, close and commit an intact passing section, and refuse otherwise.
- Criterion 8 now says no fixture reads git history. It adds "closed-marker line passes", keeps "section deleted by hand before the gate refuses", and the close fixture now expects the closed-marker line, no other Challenges content and no markers.
- Criterion 9 now requires `<sha>` to name a commit that holds the intact, gate-passing section.
- Criterion 10: on a closed marker, `spec-to-plan` plans without a new commit.
- Added one non-goal: the gate doesn't defend against a hand-typed closed marker (Q19).
- Removed the git-history lean and the "planning a spec whose challenges were already closed" open question.
- The "developer-written specs" paragraph now says Q18 and Q19 reduce the challenges to a one-line marker before planning.
---

author: @lead
created: 2026-09-27 02:20
---
Spec docs/specs/CF-12.md approved by the human 2026-09-27 (Q1-Q19 recorded under Decisions, including the drafter's step of committing the edited spec before closing the challenges). All earlier Blocker: questions on this card are answered. Next: plans for CF-12.1 (spike) and CF-12.2 (generator), for approval.
---

author: @lead
created: 2026-09-27 03:17
---
CF-12.1 spike finished (branch cf-12.1-spike, findings docs/findings/CF-12.1-claude-code-behaviours.md; review pending). Answers: (1) `model: fable` runs on Fable 5.1 on this account (message.model claude-fable-5-1); Pro rests on ranked substitutes - Fable bills to usage credits silently under -p. (2) A maxTurns-capped run does NOT reliably end in a valid handoff, and SubagentStop was not observed to fire at all when the cap hit mid-tool-call - an early-handoff instruction in the body (the turncap-early probe) worked. (3) permissions.deny `Agent(coder-fleet:<name>)` blocks the namespaced spawn and a bare-name spawn reads as "not found", not denied. Two inputs for the CF-12.3/12.4 plans, folded here rather than filed as items: treat "no SubagentStop within a capped editor's lifetime" as its own failure mode and fix it in the body (early handoff), not the hook; and the deny-rule error text should say a denied definition surfaces as "not found".
---

author: lead
created: 2026-09-28 14:38
---
CF-12.1 findings landed in #36 (v0.27.15): docs/findings/CF-12.1-claude-code-behaviours.md, on Claude Code 2.1.283. (1) A subagent with model fable runs on this account, and a fallback shows in message.model. On a Pro account Fable may bill usage credits without saying so: inferred, not observed, since no Pro account was available. /init's Fable wording must say so. (2) A run cut off by maxTurns mid-task never ended with the four-heading handoff (4 of 4). The "make your last turn the handoff" instruction worked on Opus (2 of 2) and failed on Haiku (1 of 1), and is untested on Fable, so keep it as a best-effort body invariant and set maxTurns (15) as a backstop, not a working budget. (3) SubagentStop did not fire when the cap cut a run off (0 of 4, against 4 of 4 for runs that finished), so a cut-off editor gets no gate and no card comment. (4) permissions.deny Agent(coder-fleet:<name>) blocks a plugin agent outright, without leaking. These stand without plans; CF-59 re-specs CF-12 with them.
---

author: lead
created: 2026-09-29 13:24
---
Triage 2026-09-29: CF-12.1 and CF-12.2 are Done. CF-12.3 to CF-12.5 are To Do, but their cards and docs/specs/CF-12.md still depend on spec-to-plan, docs/plans/ and a planning gate, and none of those exist any more. At the human's word, CF-59 is now running for this spec: spec-writer is revising it so it no longer uses plans, keeping Q1 to Q19. The sub-issues get re-cut acceptance criteria once the human approves the revision. Nothing can be built on 12.3 to 12.5 until then.
---

created: 2026-10-06 14:02
---
Sub-issue 3 of 5 (CF-12.3) started on 2026-10-07, on the human's order (card placed in Next). Done still needs: CF-12.3, CF-12.4, CF-12.5, then this card's provisional criterion replaced by the spec's.

Done: CF-12.1 (spike findings, v0.27.15) and CF-12.2 (the agent-pair generator) are on main.

Not done: no spec-editor or tech-editor exists yet; nothing asks a project which editor models to use; the design still says Fable is never a subagent model.
---
<!-- COMMENTS:END -->
