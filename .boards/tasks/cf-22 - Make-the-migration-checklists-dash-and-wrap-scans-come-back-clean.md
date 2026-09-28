---
id: CF-22
title: Make the migration-checklist's dash and wrap scans come back clean
status: To Do
assignee: []
created_date: '2026-09-27 02:51'
updated_date: '2026-09-27 09:40'
labels: []
dependencies: []
references:
  - claude/coder-fleet/skills/migration-checklist/SKILL.md
  - claude/coder-fleet/skills/humanize
  - claude/coder-fleet/board/NOTICE.md
  - claude/coder-fleet/templates/rules/glossary.md
priority: Low
type: chore
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-9 coder (2026-09-27). Running the migration-checklist's mechanical scans over the repo gives 42 en or em dash hits and 8 hard-wrap hits in files the repo ships: skills/humanize/SKILL.md and humanize/references/*.md (some deliberate examples of what humanize removes), board/src/mcp/README.md and board/NOTICE.md (board fork files), and a false positive on the generated templates/rules/glossary.md, whose HTML comment header (`<!--` lines) the wrap scan does not skip. Every checklist run reports the same noise, which hides a real new hit. Decide per file: fix, exempt with a reason (humanize's examples, the board fork's carried files), or teach the scan to skip `<!--` comment lines; then make the scans report zero on a clean tree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The migration-checklist's dash and wrap scans report zero hits on main, with any exemption named in the skill and its reason
- [ ] #2 The generated glossary rule's HTML comment header is not flagged
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-27 09:40
---
Current hits from the CF-44 migration-checklist run (2026-09-27, main at v0.27.1): em or en dashes in skills/humanize/** and board/src/mcp/README.md; hard wraps in board/NOTICE.md, five humanize/references/* files and templates/rules/glossary.md:6. Clear them, or record the carried-upstream ones (humanize, the board fork's README and NOTICE) as exempt in docs/limits.md.
---
<!-- COMMENTS:END -->
