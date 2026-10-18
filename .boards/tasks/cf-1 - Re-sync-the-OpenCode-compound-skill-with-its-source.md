---
id: CF-1
title: Re-sync the OpenCode compound skill with its source
status: Done
assignee: []
created_date: '2026-09-26 12:21'
updated_date: '2026-10-18 03:55'
labels: []
dependencies: []
priority: Low
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
opencode/coder-fleet/skill/compound/SKILL.md has drifted from claude/coder-fleet/skills/compound/SKILL.md at its lines 36 and 58; re-sync both or record each as a divergence in opencode/docs/divergence-register.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each line where opencode/coder-fleet/skill/compound/SKILL.md differs from claude/coder-fleet/skills/compound/SKILL.md (today lines 36 and 58: the `claude-agents/skills/` path and 'too long for Notion') is either re-synced to the source or recorded as a divergence row in opencode/docs/divergence-register.md with its reason
- [x] #2 The register's compound row no longer says 'body verbatim' unless the body is verbatim
- [x] #3 bash claude/evals/lib/check-all.sh passes on the branch
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
created: 2026-10-07 04:08
---
2026-10-07, lead, on the human's request to check every To Do card has acceptance criteria: the provisional criterion is replaced with criteria written from this card's own description; nothing was added beyond what it asks. Not ordered.
---

created: 2026-10-18 03:55
---
Ticks on main, PR #91 (rzem-ai/coder-fleet), merged to main as e827588. #1: opencode/coder-fleet/skill/compound/SKILL.md re-synced to its source; every remaining difference is a register row, and vendored.test.ts now fails on any unexplained one. #2: the register's skills/compound row now says Re-expressed and lists each difference. #3 as DoD #1. DoD #1 by CI deterministic green on the PR head 7b12fef, which ran check-all.sh and check-slow.sh. DoD #2: No fleet reviewer or refuter round ran: the session worked under the human's order to finish the port without stopping, the Codex review bot reviewed the PR and its one finding was fixed in 4c5c35a, and the human merged it. DoD #3 not applicable: no Claude Code agent body or skill frontmatter changed, and the port's migration-checklist is deferred with fleet-steward. DoD #4 not applicable: nothing under claude/coder-fleet/ changed, and the version is the Claude Code plugin's. DoD #5 by the skills/compound row in opencode/docs/divergence-register.md. DoD #6 not applicable: no spec of its own; the port's spec is opencode/docs/specs/opencode-agents-port.md.
---
<!-- COMMENTS:END -->
