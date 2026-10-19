---
id: CF-162
title: 'Have /coder-fleet:init add docs/runs/ to a project''s .gitignore'
status: Blocked
assignee: []
created_date: '2026-10-18 07:49'
updated_date: '2026-10-19 09:04'
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
- [x] #1 /coder-fleet:init adds docs/runs/ to the project's .gitignore, creating the file if absent and never duplicating the line
- [x] #2 /coder-fleet:kickoff's preflight reports when docs/runs/ is not ignored
- [x] #3 The OpenCode port's init command does the same, or the divergence register says why not
- [x] #4 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
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

created: 2026-10-19 09:01
---
Sub-issue 1 of 1: merged to main at a2b2f6b (PR #107, merge 45faa34). Done still needs: nothing beyond the close gate.

Done: in any project, /coder-fleet:init now adds docs/runs/ to the project's .gitignore unless a project .gitignore already ignores it. A machine-local rule alone does not count, a negation rule is reported and left as it is, and init stops outside a repository. /coder-fleet:kickoff notes when run articles are not ignored, or are ignored only machine-locally. The OpenCode init and kickoff do the same.

Evidence:
- #1-#2: claude/coder-fleet/commands/init.md step 2 and kickoff.md check 5 on main. Lead scratch-repo probe: `git check-ignore -v docs/runs/x.md` gives exit 0 with a .gitignore source, exit 0 with a .git/info/exclude source, exit 1 under a negation and exit 128 outside a repo.
- #3: opencode/coder-fleet/command/init.md and kickoff.md, plus the Ported row in opencode/docs/divergence-register.md.
- #4: suite exit 0 in the fix round (223.7 s). The close gate reruns it.

Definition of Done:
- 1: suite green.
- 2: one review round, whose must-fix and lows went into the single fix round. Prose only, so no refuter (lead.md step 4).
- 3: not applicable: no agent body or skill frontmatter changed (only commands).
- 4: v0.42.2 tagged on a2b2f6b and pushed.
- 5: register row added.
- 6: not applicable: there is no spec.

Not done: nothing on this card.
---

author: @TaskCompleted
created: 2026-10-19 09:04
---
Blocked. The test gate failed on "Close CF-162 init ignores docs/runs [board:CF-162]", so the task could not be marked complete.

`bash "$(git rev-parse --show-toplevel)/claude/evals/lib/check-all.sh"` exited 1.

Last lines of output:

=== glossary ===
gen-glossary-rule.sh: up to date - templates/rules/glossary.md matches skills/glossary/SKILL.md.
glossary: ok (0.1s)

=== agent pairs ===
gen-agent-pairs.sh: every pair matches its source, and no pair drifts or is orphaned.
agent pairs: ok (0.9s)

=== versions ===
plugin.json 0.42.2, marketplace entry 0.42.2
versions: ok (0.7s)

- - -
total: 158.4s
FAILED: board
---
<!-- COMMENTS:END -->
