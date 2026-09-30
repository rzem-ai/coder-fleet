---
id: CF-104
title: >-
  Make the scope hook's segmenter quote-aware, and catch every way a coder can
  change directory
status: To Do
assignee: []
created_date: '2026-09-30 10:01'
updated_date: '2026-09-30 14:03'
labels:
  - hooks
  - security
dependencies:
  - CF-90
priority: Medium
type: bug
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-90 round-2 review, 2026-09-30. (1) strip_quoted pairs quotes naively (the recorded limit in docs/limits.md:23), so `echo "'" && cd /main && echo "'" && ./node_modules/.bin/vitest run` is segmented as if the cd were quoted text: the gate is judged in the worktree but runs in the main checkout. The limit already hid commands from every allowlist role; now the reviewer executes code, so it matters more. Apply the escape-aware stripper to the general segmenter. Inferred by the reviewer with sed; to be confirmed by a probe. (2) The coder's worktree guard misses zsh's `chdir` in SHELL_CD_WORDS, and cd inside `eval`, `source` or a function definition. The Bash tool runs under zsh here. Related: CF-88 (the zsh audit).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The general segmenter strips quotes escape-aware, so the quote-pairing command above is denied for the reviewer, with a contract case (confirmed first with a probe)
- [ ] #2 The coder guard counts chdir, and treats eval, source and function definitions as possible directory changes (deny when a writing git verb follows), with contract cases
- [ ] #3 bash claude/evals/lib/check-all.sh passes
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
