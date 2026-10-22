---
id: CF-114
title: Stop the worktree guard refusing a heredoc whose text merely mentions git
status: To Do
assignee: []
created_date: '2026-10-04 09:44'
updated_date: '2026-10-07 03:54'
labels: []
dependencies: []
priority: Low
type: bug
ordinal: 263000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111.1 coder, 2026-10-04: the coder's scope hook refused a python heredoc because its text contained the word 'git', even though the word only appeared inside README prose being written. It forced a switch to Edit. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A coder Bash call whose heredoc body mentions git in prose but runs no git command is not refused, and scope-hook-contract.sh covers that case alongside the existing refusals
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
created: 2026-10-07 03:54
---
Triage 2026-10-07 against main, recorded on the human's word: unsure from reading. coder.md:36 attributes the refusal to the harness's own guard, not the plugin's hook. One run settles which: feed enforce-agent-scope.sh a coder Bash event whose heredoc only mentions git and see whether it denies; if it allows, the card belongs to the harness and can close as not ours.
---
<!-- COMMENTS:END -->
