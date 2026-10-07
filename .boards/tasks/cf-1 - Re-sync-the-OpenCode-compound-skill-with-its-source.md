---
id: CF-1
title: Re-sync the OpenCode compound skill with its source
status: To Do
assignee: []
created_date: '2026-09-26 12:21'
updated_date: '2026-10-07 04:08'
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
- [ ] #1 Each line where opencode/coder-fleet/skill/compound/SKILL.md differs from claude/coder-fleet/skills/compound/SKILL.md (today lines 36 and 58: the `claude-agents/skills/` path and 'too long for Notion') is either re-synced to the source or recorded as a divergence row in opencode/docs/divergence-register.md with its reason
- [ ] #2 The register's compound row no longer says 'body verbatim' unless the body is verbatim
- [ ] #3 bash claude/evals/lib/check-all.sh passes on the branch
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
created: 2026-10-07 04:08
---
2026-10-07, lead, on the human's request to check every To Do card has acceptance criteria: the provisional criterion is replaced with criteria written from this card's own description; nothing was added beyond what it asks. Not ordered.
---
<!-- COMMENTS:END -->
