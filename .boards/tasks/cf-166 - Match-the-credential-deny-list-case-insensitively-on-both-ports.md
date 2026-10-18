---
id: CF-166
title: Match the credential deny list case-insensitively on both ports
status: In Progress
assignee: []
created_date: '2026-10-18 12:39'
updated_date: '2026-10-18 21:47'
labels:
  - security
dependencies:
  - CF-164.1
priority: High
type: bug
ordinal: 304000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human, 2026-10-18, via AskUserQuestion: "File it and start now", after CF-164.1's second review found the OpenCode credential patterns (opencode/coder-fleet/lib/scope.ts CREDENTIAL_PATTERNS) match case-sensitively. On case-insensitive APFS, the macOS default, `~/.SSH/authorized_keys`, `~/.SSH/id_rsa` or `.NPMRC` reach the real file through patch, write, read and shell. Predates CF-164.1. The Claude Code side (claude/home/settings.json deny list and enforce-agent-scope.sh credential checks) may have the same gap. Builds after CF-164.1 merges, since it touches the same scope.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A failing-first unit case shows the OpenCode credential lock allows a case-variant credential path (`~/.SSH/id_rsa`, `.NPMRC`) through read, patch and shell, and passes once fixed
- [ ] #2 Every credential pattern in opencode/coder-fleet/lib/scope.ts matches regardless of case, and no existing deny is narrowed
- [ ] #3 The Claude Code side is checked for the same gap - the enforce-agent-scope.sh credential checks and the claude/home/settings.json deny list - and either fixed with a failing-first contract test or the card records the evidence that it is not affected
- [ ] #4 Where a harness's own deny-list syntax cannot match case-insensitively, the gap is a row in docs/limits.md or the port's divergence register with its reason
- [ ] #5 bash claude/evals/lib/check-all.sh passes, and opencode/test/run.sh live passes on 2.0.32
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
created: 2026-10-18 13:09
---
Sub-issue 1 of 1: started. Done still needs: criteria 1-5.

Done: nothing yet; a coder is making credential matching case-insensitive on both ports. Not done: on a case-insensitive Mac disk, `~/.SSH/id_rsa` and `.NPMRC` still pass the OpenCode credential lock, and the Claude Code side is unchecked.
---

created: 2026-10-18 13:40
---
Sub-issue 1 of 1: ready to merge in PR #104, pending deep review and refutation. Done still needs: criteria 1-5 proven on main.

Done (coder's word): every OpenCode CREDENTIAL_PATTERNS entry carries the i flag, bodies unchanged; 14 case variants tested through read, patch Add File and Move to, shell, bash -c and workdir, failing first (3 fail before), plus four negatives (Config/op, SSH/notes.md, docs/ENVIRONMENT.md, .Envrc.example). Register row: OpenCode 2.0.32's Wildcard.match folds case only on win32, so frontmatter `*.env` denies miss `prod.ENV` on macOS. Claude Code side not affected: enforce-agent-scope.sh has no credential checks; Claude Code 2.1.302 permissions.deny Read refused ARCHIVEDIR/ and ArchiveDir/ variants of a denied stand-in dir, and a Seatbelt subpath deny refused both variants. run.sh live exit 0 (23 pass). check-all exit 1: board-hook-contract live-resume-from-blocked-human and live-resume-archives-actions, in a 726 s run that ran unlocked beside another; board-hook-contract alone on the same commit exit 0, 265 pass - intermittent, noted on CF-163.

Not done: `prod.ENV` passes both OpenCode layers on macOS (plugin pattern is `.env`-anchored); left for the review to weigh.
---

created: 2026-10-18 13:52
---
Refuter round 1 on PR #104: 8 mutants, 8 killed (six i-flag removals, the id_rsa flag, a loosened .env boundary), each by behavioural tests. Baseline: run.sh unit exit 0 (79 pass), run.sh live exit 0 (23 pass), check-all exit 0 (577 s, under load and a lock wait). Probe found a bypass: U+017F (long s, ſ) folds to s on APFS but not under JS /i without the u flag, so `~/.ſsh/config`, `~/.awſ/credentials` and `~/.claude/.credentialſ.json` pass decide() through read, shell and patch, and APFS opens the real file (confirmed on a scratch tree). Unconfirmed: `~/.config//op/x`, `~/.config/./op/x`, `~/.config/x/../op/x` pass decide(), apparently matched before path normalisation (predates this PR). Fix round waits for the review.
---

created: 2026-10-18 13:56
---
Review round 1 on PR #104: request changes. Not done: criterion 2 - APFS folds U+017F and U+212A (Kelvin) to s and k (reviewer probed read-only with ls -d on ~/.zſshrc and ~/DesKtop), JS /i without u does not, so every pattern with an s or k (.ssh, id_rsa, .aws, .credentials.json, .vault-token) is bypassable; fix is the iu flags. Criterion 3 evidence covers Claude Code Read rules only; Edit/Write untested. Done: all 12 patterns flagged, bodies unchanged, all credential decisions go through isCredentialPath, no meaningful over-matching. Reviewer's check-all: exit 0 (644 s, under load), board-hook-contract 265/0 this time.

Fix round 1 sent: iu flags with ſ and Kelvin tests; confirm and close any path-normalisation spellings the OS opens; Edit/Write and Unicode probes on the Claude Code side with stand-ins, any miss going to docs/limits.md; register wording. Lead's default, recorded: widening the .env pattern to catch prod.ENV is out of this card (goes beyond the fleet's //**/.env source); the human decides it separately.
---

created: 2026-10-18 14:27
---
Fix round 1 pushed, PR #104 head 0133d3b. Done (coder's word): every pattern carries iu; run shows /iu folds U+017F and U+212A and not U+0131, U+0130 or fullwidth, matching what APFS opened on a scratch tree; isCredentialPath also judges a lexically normalised path (the OS opens .config//op/x, .config/./op/x, .config/zz/../op/x); Claude Code 2.1.302 Read and Edit denies refused all four spellings (exact, upper, long s, Kelvin) of a stand-in dir, Edit covering the Write tool too, and Seatbelt refused reads and writes; so no limits row. Unit 82 pass, live 23 pass, check-all exit 0 (240 s). The human, 2026-10-19 via AskUserQuestion on prod.ENV: "Leave it (Recommended)" - the plugin keeps the fleet's .env rule and the register records the gap.

A security scan on 0133d3b flags full case folding: if APFS folds multi-character forms (ß to ss, the ﬁ/ﬂ ligatures), `~/.confﬁg/op/x` or `~/.ßh/config`-style spellings could still pass. The second review round probes APFS for those.
---

created: 2026-10-18 21:47
---
Review round 2 (final) on PR #104 (0133d3b): request changes. Not done: criterion 2. APFS on this machine resolves every full case fold whose result is ASCII (probed read-only with ls -d / stat on non-credential names): ß and ẞ to ss, ﬀ ff, ﬁ fi (~/.confﬁg is the same inode as ~/.config), ﬂ fl, ﬃ ffi, ﬄ ffl, ﬅ/ﬆ st. JS /iu folds only simply, so ~/.ßh/config, ~/.confﬁg/op/x and ~/.config/coder-ﬂeet/linear.token pass the lock; the register's 'iu folds exactly what APFS folds' is false. APFS is also NFC/NFD-insensitive, which opens nothing (only U+212A decomposes to an ASCII letter in the patterns); ZWNJ, ZWJ, BOM, soft hyphen and a stray combining dot do not resolve. Done: lexNormal is sound (only adds denies, every caller benefits); round 1 must-fixes 2-4 closed. Low: two lexical test spellings match without lexNormal. Reviewer's check-all exit 0 (93 s).

The review cap is spent; the lead is asking the human whether to allow one more fix round for the nine characters.
---
<!-- COMMENTS:END -->
