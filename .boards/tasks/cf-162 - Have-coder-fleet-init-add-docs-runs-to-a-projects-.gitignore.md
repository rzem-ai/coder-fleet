---
id: CF-162
title: 'Have /coder-fleet:init add docs/runs/ to a project''s .gitignore'
status: To Do
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-18 08:21'
labels: []
dependencies: []
type: enhancement
ordinal: 297000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's word, 2026-10-18. CF-158 makes run articles local and unversioned and gitignores docs/runs/ in the coder-fleet repo; projects initialised by the fleet need the same.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 /coder-fleet:init adds docs/runs/ to the project's .gitignore, creating the file if absent and never duplicating the line
- [ ] #2 /coder-fleet:kickoff's preflight reports when docs/runs/ is not ignored
- [ ] #3 The OpenCode port's init command does the same, or the divergence register says why not
- [ ] #4 bash claude/evals/lib/check-all.sh passes
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
created: 2026-10-18 08:21
---
2026-10-18, migration-checklist review of CF-158: the run-article skill, the glossary and the OpenCode coder and lead all tell agents that docs/runs/ is git-ignored, but only the coder-fleet repo's .gitignore has the line. In any other fleet project a plain `git add -A` in the main checkout commits the articles. This card makes that wording true.
---
<!-- COMMENTS:END -->
