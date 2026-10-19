---
id: CF-34
title: Port the Blocker rule to the OpenCode handoff skill
status: Done
assignee: []
created_date: '2026-09-27 04:26'
updated_date: '2026-10-18 04:02'
labels: []
dependencies:
  - CF-31
references:
  - opencode/coder-fleet/skill/handoff/SKILL.md
  - docs/plans/CF-31.md
priority: Low
type: enhancement
ordinal: 227000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CF-31 plan open question 8, approved 2026-09-27. CF-31 changes the Claude Code handoff skill (Blocker: only for a question only the human can answer, with a worked example of a must-fix finding that is not a blocker). `opencode/coder-fleet/skill/handoff/SKILL.md` is the port's copy and drifts until it follows. Port work traces to the Claude tree (AGENTS.md "The ports"); a deliberate difference is a divergence-register row.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 opencode/coder-fleet/skill/handoff/SKILL.md carries the CF-31 Blocker rule and worked example, or a divergence-register row says why not
- [x] #2 The OpenCode invariant tests pass
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-18 03:55
---
Ticks on main, PR #91 (rzem-ai/coder-fleet), merged to main as e827588. #1: opencode/coder-fleet/skill/handoff/SKILL.md carries CF-31's Blocker rule and the "A finding is not a blocker" worked example, with "card" read as "item". #2: the OpenCode invariant tests pass, unit 59/59 and live 14/14, and in CI. DoD #1 by CI deterministic green on the PR head 7b12fef, which ran check-all.sh and check-slow.sh. DoD #2: No fleet reviewer or refuter round ran: the session worked under the human's order to finish the port without stopping, the Codex review bot reviewed the PR and its one finding was fixed in 4c5c35a, and the human merged it. DoD #3 not applicable: no Claude Code agent body or skill frontmatter changed, and the port's migration-checklist is deferred with fleet-steward. DoD #4 not applicable: nothing under claude/coder-fleet/ changed, and the version is the Claude Code plugin's. DoD #5 by the skills/handoff row. DoD #6 not applicable: no spec of its own; the port's spec is opencode/docs/specs/opencode-agents-port.md.
---

created: 2026-10-18 04:02
---
Correction to DoD #3, after review on PR #92: this card changed a skill body, and the checklist was run anyway: the migration-checklist checks that apply under OpenCode's schema were run over the files PR #91 changed (the compound, glossary, handoff, looping and run-article SKILL.md files and agent/scout.md), and the findings table is in PR #92. For handoff: frontmatter unchanged and still loads, no dashes or hard wraps. No failure.
---
<!-- COMMENTS:END -->
