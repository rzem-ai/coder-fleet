---
id: CF-11
title: Re-sync the OpenCode glossary's Board meaning with its source
status: Done
assignee: []
created_date: '2026-09-27 01:34'
updated_date: '2026-10-18 03:55'
labels: []
dependencies: []
references:
  - opencode/coder-fleet/skill/glossary/SKILL.md
  - claude/coder-fleet/skills/glossary/SKILL.md
  - opencode/docs/divergence-register.md
priority: Low
type: docs
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-9 planner. `opencode/coder-fleet/skill/glossary/SKILL.md` gives the Board term's meaning as "The Tasks database" where the source skill `claude/coder-fleet/skills/glossary/SKILL.md` says "The tracked items". `opencode/docs/divergence-register.md:18` claims the port keeps every term and every meaning verbatim, so the register is currently false. Older drift, out of CF-9's scope; CF-9 touches the same row only to change "doing" to "in progress".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every meaning in the OpenCode glossary matches the source verbatim, or the register row records the divergence and its reason
- [x] #2 opencode/test invariant tests pass
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
Ticks on main, PR #91 (rzem-ai/coder-fleet), merged to main as e827588. #1: every meaning in opencode/coder-fleet/skill/glossary/SKILL.md matches the source verbatim but Memory and Handoff, whose divergence and reason are the register's "glossary's Memory and Handoff meanings" row; vendored.test.ts checks the Term and Meaning cells. #2: opencode/test/run.sh unit 59/59 and live 14/14, and in CI. DoD #1 by CI deterministic green on the PR head 7b12fef, which ran check-all.sh and check-slow.sh. DoD #2: No fleet reviewer or refuter round ran: the session worked under the human's order to finish the port without stopping, the Codex review bot reviewed the PR and its one finding was fixed in 4c5c35a, and the human merged it. DoD #3 not applicable: no Claude Code agent body or skill frontmatter changed, and the port's migration-checklist is deferred with fleet-steward. DoD #4 not applicable: nothing under claude/coder-fleet/ changed, and the version is the Claude Code plugin's. DoD #5 by the skills/glossary, board-terms and Memory and Handoff rows. DoD #6 not applicable: no spec of its own; the port's spec is opencode/docs/specs/opencode-agents-port.md.
---
<!-- COMMENTS:END -->
