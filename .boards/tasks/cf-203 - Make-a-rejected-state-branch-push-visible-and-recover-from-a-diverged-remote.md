---
id: CF-203
title: 'Make a rejected state-branch push visible, and recover from a diverged remote'
status: To Do
assignee: []
created_date: '2026-11-12 14:53'
labels: []
dependencies: []
priority: Medium
type: bug
ordinal: 331000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found on 2026-11-13 during a worktree cleanup: the local coder-fleet/state branch was 100 commits ahead of and 21 behind origin/coder-fleet/state. GitHub's last state commit was two days old (CF-185 to CF-192 comments and moves), so every board and memory push since then had been rejected as non-fast-forward. Nothing told the human. Another clone or a Claude Code on the web session would have seen a board two days stale. The lead merged origin into the local branch by hand, with one add/add conflict on the CF-192 card, where the local copy was a superset, and pushed. A plain `git add` in the state worktree also refuses `.boards/` now that `.git/info/exclude` lists it, so any hand recovery needs `git add -f`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a board or memory push to the state branch is rejected, the human sees it in the session (for example a hook message or a SessionStart line naming the branch and how far it has diverged), not only in a log
- [ ] #2 When the remote state branch has commits the local one lacks, the next board write or session start fetches and merges them before pushing, with no force push, and a push that still fails says why
- [ ] #3 A merge conflict on a card is resolved, or left for the human with its path named, rather than silently skipping the push
- [ ] #4 A contract test pins the diverged-remote case: local and remote each hold commits the other lacks, and after the recovery step both sides hold all of them
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
