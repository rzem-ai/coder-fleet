---
id: CF-28
title: Tag and push every release version in the Releasing rules
status: Next
assignee: []
created_date: '2026-09-27 03:17'
updated_date: '2026-10-07 00:11'
labels: []
dependencies: []
references:
  - AGENTS.md
  - claude/coder-fleet/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
priority: Medium
type: enhancement
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's rule, 2026-09-27: "when you bump the version of the plugin or marketplace, you must also tag the git commit and push the tag". The lead applies it from now on (v0.25.1 tagged on a84db3b, the merge of PR #2, and pushed). The repo does not say it yet: AGENTS.md "Releasing" and design wherever releases are described say only bump plus a `vX.Y.Z:` subject. Add the tag step there, say which commit is tagged (the commit on main that first carries the whole release - the merge commit for a merge-commit PR, since fix rounds land after the branch's bump commit), and decide whether to back-fill v0.25.0 (9f2a139) and earlier. Consider a CI or suite check that the version in plugin.json has a matching tag once on main.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md Releasing states the annotated vX.Y.Z tag, which commit it goes on, and that it is pushed
- [ ] #2 Every plan template or lead instruction that names a release step includes the tag
- [ ] #3 The back-fill of v0.25.0 and earlier is decided and either done or recorded as not done
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
