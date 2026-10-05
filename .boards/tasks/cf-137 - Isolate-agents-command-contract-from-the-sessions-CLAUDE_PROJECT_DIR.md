---
id: CF-137
title: Isolate agents-command-contract from the session's CLAUDE_PROJECT_DIR
status: To Do
assignee: []
created_date: '2026-10-05 12:17'
updated_date: '2026-10-05 12:24'
labels: []
dependencies: []
references:
  - claude/evals/lib/agents-command-contract.sh
  - claude/coder-fleet/hooks/enforce-disabled-agents.sh
  - CF-128
priority: High
type: bug
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lead on 2026-10-05 while closing CF-128. `claude/evals/lib/agents-command-contract.sh:127`, "the spawn hook denies the refuter the command disabled", fails whenever CLAUDE_PROJECT_DIR is set to a real project, which it always is inside a session hook: run with it set, the suite gives 65 passed, 1 failed. With it unset, 66 pass. The likely cause is that the spawn hook resolves the project from CLAUDE_PROJECT_DIR and reads the real repo (which has no .claude/coder-fleet.json) instead of the test's fixture project. It reproduces on fc5bd80 (before 2026-10-05's merges), so it has been there since CF-111.1/CF-113 (v0.30.0). Effect: this repo's strict TaskCompleted gate runs check-all from the hook, so every [board:<id>] close here is refused with `FAILED: agents-command`. CF-128 was moved to Blocked by it; CF-24.4 and CF-127 can't close either. Not yet ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 agents-command-contract.sh passes 66/66 both with CLAUDE_PROJECT_DIR unset and with it set to a real project with no .claude/coder-fleet.json, because every case clears or overrides the variable for its fixture
- [ ] #2 A case proves the suite cannot read the caller's project config, and it fails if the isolation is removed
- [ ] #3 Every other contract suite that runs fleet-config or a spawn hook is checked for the same leak, and any found is fixed or filed
- [ ] #4 check-all.sh is green when run as the TaskCompleted hook runs it
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
created: 2026-10-05 12:24
---
2026-10-05, the human, in the session: "Fix CF-137 now", ordered. Decision recorded for the builder: the fix goes in the tests (isolate them from the caller's environment); the spawn hook's use of CLAUDE_PROJECT_DIR is correct production behaviour and stays as it is. Version: v0.33.1 (patch, test-only).

Sub-issue 1 of 1: started. Done still needs: criteria 1-4. Done: nothing yet. Not done: every [board:] close in this repo is still refused under the strict gate, so CF-24.4, CF-127 and CF-128 can't reach Done.
---
<!-- COMMENTS:END -->
