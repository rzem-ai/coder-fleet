---
id: CF-100
title: Record the reviewer eval baseline from a live run of the gate prompt
status: To Do
assignee: []
created_date: '2026-09-30 09:53'
updated_date: '2026-09-30 14:03'
labels:
  - evals
dependencies:
  - CF-90
priority: Low
type: task
ordinal: 257000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From CF-90, 2026-09-30. Reviewer prompt 05 (failing gate) and the RV-gate-ran check assume `claude -p --output-format json --verbose` prints tool_use records, a shape so far seen only from the stub. The eval's model run is paid and manual, so it needs the human's go. The run should also confirm vitest's `--update=none` on the fixture's version. Also covers the human deciding on offline gate support for Go, Rust, Deno, bun and uv projects (cargo --offline, deno --cached-only), which CF-90 records as unable to declare gates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With the human's go, a live run of claude/evals/run.sh reviewer shows prompt 05's RV-gate-ran reading a real tool_use record, and claude/evals/reviewer/baseline.json is set
- [ ] #2 The human's decision on offline gate support per ecosystem is recorded here
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
created: 2026-09-30 10:30
---
From CF-90 fix round 2 (2026-09-30): RV-gate-ran ignores a gate call whose tool_result text contains the hook's 'reviewer invariant' refusal. That shape was inferred from the deny reason, not seen. When the live reviewer run happens, check that a hook-refused Bash call's tool_result in `claude -p --output-format json --verbose` output does carry that text, and fix checks.sh if it doesn't.
---
<!-- COMMENTS:END -->
