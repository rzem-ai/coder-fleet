---
id: CF-167
title: >-
  Polish for CF-166: fold the nine multi-letter APFS folds in the OpenCode
  credential lock
status: In Progress
assignee: []
created_date: '2026-10-18 21:50'
updated_date: '2026-10-19 07:08'
labels:
  - security
dependencies:
  - CF-166
priority: High
type: bug
ordinal: 305000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Open after CF-166's review cap; the human, 2026-10-19, declined a further round on CF-166 ("no more. that is enough"), so it is filed here and waits for the human's go. APFS resolves every full case fold whose result is ASCII: U+00DF and U+1E9E to ss, U+FB00 ff, U+FB01 fi, U+FB02 fl, U+FB03 ffi, U+FB04 ffl, U+FB05 and U+FB06 st (probed read-only; ~/.confﬁg is the same inode as ~/.config). JS /iu folds only simply, so `~/.ßh/config`, `~/.confﬁg/op/x` and `~/.config/coder-ﬂeet/linear.token` pass the OpenCode credential lock.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 isCredentialPath in opencode/coder-fleet/lib/scope.ts also judges a spelling with the nine characters mapped to their ASCII folds, proven by failing-first unit cases for `~/.ßh/config`, `~/.ẞH/known_hosts`, `~/.confﬁg/op/x` and `~/.config/coder-ﬂeet/linear.token` through read, patch and shell
- [ ] #2 Dotless i and fullwidth spellings stay allowed (the existing negative test still passes)
- [ ] #3 The divergence register row no longer says `iu` folds exactly what APFS folds
- [ ] #4 The two lexical test spellings that match without lexNormal (`src/a/../.env`, `~/.claude/./.credentials.json`) are replaced by ones that need it
- [ ] #5 The Claude Code side's Read/Edit denies and the Seatbelt sandbox are probed with a stand-in directory for the same spellings; any miss is a row in docs/limits.md
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
created: 2026-10-19 07:08
---
2026-10-19, the human ordered this card in the session (picked "CF-167 leftover letters" alongside CF-164.3, CF-162 and CF-163).

Sub-issue 1 of 1: started. Done still needs: criteria 1-5.

Done: nothing yet. Not done: `~/.ßh/config`, `~/.confﬁg/op/x` and similar spellings still get past the OpenCode credential lock.
---
<!-- COMMENTS:END -->
