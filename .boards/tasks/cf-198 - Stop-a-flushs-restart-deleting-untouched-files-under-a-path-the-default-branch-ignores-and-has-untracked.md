---
id: CF-198
title: >-
  Stop a flush's restart deleting untouched files under a path the default
  branch ignores and has untracked
status: Next
assignee: []
created_date: '2026-11-11 23:51'
updated_date: '2026-11-11 23:51'
labels: []
dependencies: []
priority: High
type: bug
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed at the human's word, 12 Nov 2026, answering CF-188.1's action 1: "Release, file a card (Recommended)". Not ordered: it waits in To Do for his go.

Proved by the CF-188.1 coder with a probe it then reverted. In a project whose default branch ignores `.claude/agent-memory/` and untracked it with `git rm --cached` (what /init's Ignore answer does), a flush that carries only a board change restarts the state branch and drops untouched memory files (the probe lost `coder-fleet-lead/MEMORY.md`) from both `coder-fleet/state` and the live state worktree. It happens with nothing held back and no carry, and with a carry. The files stay in the state branch's history. Cause: the restart takes the tip's untracking as a deletion for every path the state branch did not change. The same shape is expected for an ignored and untracked `.boards/`. It predates CF-188. The coder's suggested mechanism: on restart, keep the state branch's whole tree under any root the tip ignores.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a project whose default branch ignores and has untracked `.claude/agent-memory/`, a flush leaves every memory file that was on the state branch still on it and in the live state worktree, whether or not the flush held anything back
- [ ] #2 The same holds for an ignored and untracked `.boards/`
- [ ] #3 A test with a real linked state worktree reproduces the loss on the unfixed code
- [ ] #4 `bash claude/evals/lib/check-all.sh` passes
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
