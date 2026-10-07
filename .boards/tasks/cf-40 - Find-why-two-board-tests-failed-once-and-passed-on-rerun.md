---
id: CF-40
title: Find why two board tests failed once and passed on rerun
status: To Do
assignee: []
created_date: '2026-09-27 06:51'
updated_date: '2026-10-07 03:54'
labels: []
dependencies: []
priority: Low
type: bug
ordinal: 233000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-26 coder. Two intermittent failures at 7d857f6 on cf-26-27-completed-edit, each failing once and passing on rerun at the same commit:

- content-store.test.ts "refreshes completed identity state when the completed corpus changes" (watcher timeout).
- dependency.test.ts "accepts an archived task as a dependency at create and edit time" (archiveTask(...).success false), beside leaked jsdom dispatchEvent / "fetch() URL is invalid" errors from a web test (App.tsx:649, TaskDetailsModal.tsx:1106) that the baseline shows too.

Neither touches the code CF-26 changed, but that is shown only by the code paths involved, not by a test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provisional: the spec settles what done means here, and its criteria replace this one
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
author: @lead
created: 2026-09-27 07:44
---
Two more content-store.test.ts failures under full-suite load, each passing when the file ran alone (2026-09-27): "retries incomplete moved identities without a second watcher event" (ENOENT on a rename under board/tmp/test-content-store-*, CF-26 fix round at 885ce74) and "retries initialization when the root changes after a coherent load resolves" (assertion compared two different test directories' root-b paths, CF-43 at 18cd5ba). Neither branch touches the code those tests exercise. Together with the watcher-timeout case, content-store.test.ts looks sensitive to load or shared tmp state rather than to any one change.
---

created: 2026-10-07 03:54
---
Triage 2026-10-07 against main, recorded on the human's word: unsure from reading. content-store.test.ts has had no change since the import (c094a3d) and no commit names this card. Settled by rerunning the two named tests several times on one commit, alone and under load; it may be the same load pattern as CF-76.
---
<!-- COMMENTS:END -->
