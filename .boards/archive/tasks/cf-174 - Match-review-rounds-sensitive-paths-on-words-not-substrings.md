---
id: CF-174
title: 'Match review-round''s sensitive paths on words, not substrings'
status: To Do
assignee: []
created_date: '2026-10-22 08:55'
labels:
  - workflows
  - security
dependencies: []
priority: Low
ordinal: 298000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, after asking whether the plugin held the work back on Fathom FTH-285: "create cards for all those issues in coder-fleet please".

Seen on Fathom, 22 Oct 2026: review-round marked FTH-285.1, FTH-285.4 and their round 2s as touching a sensitive path because the board card .boards/tasks/fth-285.1 - Give-each-chosen-LoRA-a-weight-defaulting-to-the-authors-recommendation.md contains "auth" inside "authors". The reviewer spent part of each verdict explaining the false alarm. The sensitive flag decides the deeper review and, in harden, a refuter, so a substring match costs real time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 review-round's sensitive-path check matches on path segments and word boundaries (auth, authn, authz, oauth, secret, credential, token, session and the like as whole segments or words), not substrings, and a test pins 'authors' as not sensitive and 'auth/' and 'oauth.ts' as sensitive
- [ ] #2 Files under .boards/ and .claude/agent-memory/ are never sensitive
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
