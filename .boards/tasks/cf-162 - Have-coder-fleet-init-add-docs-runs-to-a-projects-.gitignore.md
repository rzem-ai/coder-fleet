---
id: CF-162
title: 'Have /coder-fleet:init add docs/runs/ to a project''s .gitignore'
status: In Progress
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-19 07:26'
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

created: 2026-10-19 07:08
---
2026-10-19, the human ordered this card in the session (picked "CF-162" alongside CF-164.3, CF-167 and CF-163).

Sub-issue 1 of 1: started. Done still needs: criteria 1-4.

Done: nothing yet. Not done: a project set up with /coder-fleet:init still commits run articles on a plain `git add -A`.
---

created: 2026-10-19 07:20
---
Sub-issue 1 of 1: review round done on PR #107, fix round running. Done still needs: criteria 1-3, and the release.

Done: init and kickoff in both ports now handle docs/runs/ in .gitignore, and the suite passes (reviewer, exit 0).
Not done: init still accepts a machine-local ignore rule (.git/info/exclude or the global excludes file) in place of the project's .gitignore. The lead confirmed this in a scratch repo, so other clones would still commit run articles. The fix round also tightens the negation wording, handles exit 128 outside a repo, and corrects the register's step number. The version bump is batched at release.
---

created: 2026-10-19 07:26
---
Sub-issue 1 of 1: ready to merge in PR #107. Done still needs: criteria 1-4 proven on main, and the v0.41.9 tag.

Done: init (both ports) adds docs/runs/ to the project's .gitignore unless a project .gitignore already ignores it. A rule only in .git/info/exclude or the global excludes file no longer counts. A negation rule is reported and nothing is added, and init stops outside a repository. Kickoff (both ports) notes a missing or machine-local-only rule. The register row is updated. Suite exit 0 in the fix round (223.7 s). Version bumped to 0.41.9 on the branch (7ed71ab). The review cap is spent: one review round and one fix round.
Not done: not merged and not tagged. The reviewer's two follow-ups (let the reviewer run `git check-ignore`, untrack run articles that are already committed) were put to the human and not filed.
---
<!-- COMMENTS:END -->
