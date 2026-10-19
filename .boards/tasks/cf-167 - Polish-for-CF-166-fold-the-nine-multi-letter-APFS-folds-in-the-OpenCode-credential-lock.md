---
id: CF-167
title: >-
  Polish for CF-166: fold the nine multi-letter APFS folds in the OpenCode
  credential lock
status: Done
assignee: []
created_date: '2026-10-18 21:50'
updated_date: '2026-10-19 09:56'
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
- [x] #1 isCredentialPath in opencode/coder-fleet/lib/scope.ts also judges a spelling with the nine characters mapped to their ASCII folds, proven by failing-first unit cases for `~/.ßh/config`, `~/.ẞH/known_hosts`, `~/.conﬁg/op/x` and `~/.config/coder-ﬂeet/linear.token` through read, patch and shell
- [x] #2 Dotless i and fullwidth spellings stay allowed (the existing negative test still passes)
- [x] #3 The divergence register row no longer says `iu` folds exactly what APFS folds
- [x] #4 The two lexical test spellings that match without lexNormal (`src/a/../.env`, `~/.claude/./.credentials.json`) are replaced by ones that need it
- [x] #5 The Claude Code side's Read/Edit denies and the Seatbelt sandbox are probed with a stand-in directory for the same spellings; any miss is a row in docs/limits.md
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-19 07:08
---
2026-10-19, the human ordered this card in the session (picked "CF-167 leftover letters" alongside CF-164.3, CF-162 and CF-163).

Sub-issue 1 of 1: started. Done still needs: criteria 1-5.

Done: nothing yet. Not done: `~/.ßh/config`, `~/.confﬁg/op/x` and similar spellings still get past the OpenCode credential lock.
---

created: 2026-10-19 07:23
---
Correction to the description, 2026-10-19 (coder's stand-in probe on PR #108): `~/.confﬁg` is conf + U+FB01 + g, which folds to `conffig`, and APFS treats it as a different folder from `.config`. The correct spelling is `~/.conﬁg` (con + U+FB01 + g). Criterion 1's tests use `~/.conﬁg/op/x`, and a negative test keeps `conffig` allowed.

Criterion 5 probe: Claude Code 2.1.303 Read deny rules (Edit refused through the Read deny) and a Seatbelt `subpath` deny both refused every multi-letter fold spelling against stand-in folders, so docs/limits.md gets no row.

Sub-issue 1 of 1: PR #108 built; deep review and refuter running. Done still needs: criteria 1-5 proven on main, and the release.
Done: in the PR, OpenCode refuses `~/.ßh/config`, `~/.ẞH/known_hosts`, `~/.conﬁg/op/x` and `~/.config/coder-ﬂeet/linear.token` through read, patch and shell; suite exit 0.
Not done: not merged, so those spellings still pass on main.
---

created: 2026-10-19 07:35
---
Criterion 1 text corrected from `~/.confﬁg/op/x` to `~/.conﬁg/op/x`: the original bytes fold to `conffig`, a different folder (reviewer confirmed from the card's bytes, PR #108 round 1).

Sub-issue 1 of 1: review round done (reviewer approved with follow-ups; refuter killed 6 of 7 mutants). Fix round running. Done still needs: criteria 1-5 proven on main, and the release.
Done: the reviewer confirmed the fold reaches every caller of the lock (read, edit, write, patch, shell words, workdir), that the nine-character map matches Unicode's full folds to ASCII, and that there is no NFC/NFD gap. Suite exit 0.
Not done: one surviving mutant. No test spells a path needing both a fold and lexNormal (`~/.conﬁg//op/x`), so the fix round adds those tests. Not merged.
---

author: @SubagentStop
created: 2026-10-19 07:35
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- The review is in the report I sent earlier: approve with follow-ups for PR #108 (CF-167), nothing to fix before merge.
- gate: bash claude/evals/lib/check-all.sh - exit 0 - counts printed per section, 0 failed in every section (opencode-unit 108 pass 0 fail; board 319 pass 0 fail)
- low: opencode/test/invariants/scope.test.ts:616 - no test combines a fold with lexNormal or uses a folded workdir
- low: .boards/tasks/cf-167 criterion 1 - names `~/.confﬁg/op/x`, which folds to `conffig`; amend to `~/.conﬁg/op/x` when ticking
- The leftover background task that followed the suite output (bm6libuar) has stopped, so nothing from this review is still running.
---

created: 2026-10-19 09:00
---
Second review round on PR #108 (fix commit 3ec2439): approved, no findings. The new `~/.conﬁg//op/x` and `~/.conﬁg/a/../op/x` variants kill the surviving mutant; the change touches the test file only. The coder's suite on 3ec2439 exited 0 (165.6 s). The reviewer's first gate run exited 1 with the failing section unseen, and its rerun on the same commit showed all 38 sections ok. That is an intermittent failure of unknown section, same family as CF-163; CI on the release head is the check.

Sub-issue 1 of 1: ready to merge in PR #108 once the v0.42.3 bump lands after PR #107 merges. Done still needs: criteria 1-5 proven on main, and the tag.
Done: OpenCode refuses the nine multi-letter fold spellings of every credential path through read, patch, shell and a folded workdir, in the PR. Claude Code's denies and Seatbelt already refused them.
Not done: not merged, so main still lets those spellings through.
---

created: 2026-10-19 09:26
---
Sub-issue 1 of 1: merged to main at 3ec2439 (PR #108), released in PR #109 as v0.42.3. Done still needs: nothing beyond the close gate.

Done: on OpenCode, reading, patching or shelling into a credential path spelt with any of the nine multi-letter APFS folds (`~/.ßh/config`, `~/.ẞH/known_hosts`, `~/.conﬁg/op/x`, `~/.config/coder-ﬂeet/linear.token` and the like) is refused, including through a folded workdir. Dotless i and fullwidth spellings stay allowed, as APFS treats them as different names.

Evidence:
- #1: the case-folding variants in opencode/test/invariants/scope.test.ts (read, patch, cat, bash -c), which failed first under an apfsFold stub. Fix-round variants `~/.conﬁg//op/x` and `~/.conﬁg/a/../op/x` kill the refuter's surviving mutant.
- #2: the dotless-i and fullwidth negative test plus the pinned apfsFold("ı İ ｓ") test.
- #3: opencode/docs/divergence-register.md row.
- #4: lexical spellings replaced, with a test that none matches the raw patterns.
- #5: stand-in probes (Claude Code 2.1.303 Read deny, with Edit refused through it, and a Seatbelt subpath deny) refused every spelling, so docs/limits.md needs no row.

Definition of Done:
- 1: suite exit 0 on 3ec2439. The close gate reruns it.
- 2: deep review approved with follow-ups, then the second round approved. Refuter killed 6 of 7 mutants, and the survivor was killed by the fix round.
- 3: not applicable: no agent body or skill frontmatter changed.
- 4: v0.42.3 tagged on a2199d5 and pushed.
- 5: register row updated.
- 6: not applicable: there is no spec.

Not done: nothing on this card.
---

author: @TaskCompleted
created: 2026-10-19 09:35
---
Blocked. The test gate failed on "Close CF-167 APFS multi-letter folds [board:CF-167]", so the task could not be marked complete.

`bash "$(git rev-parse --show-toplevel)/claude/evals/lib/check-all.sh"` exited 124.

Last lines of output:

valid-trailing-whitespace                  valid     valid     valid     ok
valid-review-finding-not-blocker           valid     valid     valid     ok
valid-refuter-survived-in-done             valid     valid     valid     ok
bad-survived-under-decisions               invalid   invalid   invalid   ok

32 cases
The skill example "A finding is not a blocker" matches valid-review-finding-not-blocker.txt byte for byte.
The hook and the eval gate agree on every case, and every verdict is the expected one.
handoff-parity: ok (78.8s)

=== handoff-extractor ===

144 passed, 0 failed
The fix loop reads a handoff exactly as the board hook does.
handoff-extractor: ok (71.9s)
---

author: @TaskCompleted
created: 2026-10-19 09:48
---
Blocked. The test gate failed on "Close CF-167 APFS multi-letter folds, retry [board:CF-167]", so the task could not be marked complete.

`bash "$(git rev-parse --show-toplevel)/claude/evals/lib/check-all.sh"` exited 1.

Last lines of output:

=== glossary ===
gen-glossary-rule.sh: up to date - templates/rules/glossary.md matches skills/glossary/SKILL.md.
glossary: ok (0.3s)

=== agent pairs ===
gen-agent-pairs.sh: every pair matches its source, and no pair drifts or is orphaned.
agent pairs: ok (2.6s)

=== versions ===
plugin.json 0.42.3, marketplace entry 0.42.3
versions: ok (1.9s)

- - -
total: 292.2s
FAILED: board-hook-contract
---
<!-- COMMENTS:END -->
