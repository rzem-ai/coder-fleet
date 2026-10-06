---
id: CF-149
title: Retry a SubagentStart board move that loses the file lock to another process
status: To Do
assignee: []
created_date: '2026-10-06 13:22'
labels:
  - hooks
dependencies: []
priority: Medium
type: bug
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed on the human's go, 2026-10-06, from a read of ~/.local/state/coder-fleet/log/hooks.log. Since 2026-10-05T12Z the log has 20 lines `[SubagentStart] board task edit failed (exit 1): Edit failed: CF-n is being modified by another process; retry if appropriate.` When two spawns start together, or a start lands beside a comment write, one hook loses the lock and its move or comment is dropped without retrying, so the card can stay in the wrong column.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board edit from a hook that fails with 'being modified by another process' is retried with a short bounded backoff before it is logged as failed, in one shared place every board-writing hook uses
- [ ] #2 A contract case under claude/evals/lib/ holds the lock from a second process, shows the edit succeeding once the lock is released, and shows a bounded give-up when it never is
- [ ] #3 No hook's run can exceed its hooks.json timeout because of the retries
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
