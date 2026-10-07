---
id: CF-28
title: Tag and push every release version in the Releasing rules
status: In Progress
assignee: []
created_date: '2026-09-27 03:17'
updated_date: '2026-10-07 01:58'
labels:
  - outcome/shipped
dependencies: []
references:
  - AGENTS.md
  - claude/coder-fleet/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
priority: Medium
type: enhancement
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human's rule, 2026-09-27: "when you bump the version of the plugin or marketplace, you must also tag the git commit and push the tag". The lead applies it from now on (v0.25.1 tagged on a84db3b, the merge of PR #2, and pushed). The repo does not say it yet: AGENTS.md "Releasing" and design wherever releases are described say only bump plus a `vX.Y.Z:` subject. Add the tag step there, say which commit is tagged (the commit on main that first carries the whole release - the merge commit for a merge-commit PR, since fix rounds land after the branch's bump commit), and decide whether to back-fill v0.25.0 (9f2a139) and earlier. Consider a CI or suite check that the version in plugin.json has a matching tag once on main.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 AGENTS.md Releasing states the annotated vX.Y.Z tag, which commit it goes on, and that it is pushed
- [x] #2 Every plan template or lead instruction that names a release step includes the tag
- [x] #3 The back-fill of v0.25.0 and earlier is decided and either done or recorded as not done
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-10-07 00:17
---
Ordered: the human moved this card into Next on 2026-10-07. Decision from the human, 2026-10-07, on criterion 3: back-fill. Every release before v0.25.1 that has no tag gets one, on the commit whose subject starts with that version (`vX.Y.Z:`), and the tags are pushed. Where a version has no such commit, or more than one, the builder lists it rather than guessing, and the lead decides. Since this repo merges PRs with merge commits and fix rounds land after the bump, the tag goes on the release commit CI proved (the branch head carrying the bump), which is what the lead has done since v0.37.5; AGENTS.md should say that. Waits until CF-138's refuter and CF-21 have their suites run, to keep the machine quiet.
---

author: @SubagentStop
created: 2026-10-07 01:55
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Branch `cf-28-release-tags` in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a13ea3ad3edd42ce1`, cut from origin/main, committed as 3a6bff4 "Add the tag step to the Releasing rules and list the tag back-fill (CF-28)". No version bump and no PR, as ordered.
- Criterion 1: `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a13ea3ad3edd42ce1/AGENTS.md` "Releasing" now states the `vX.Y.Z` tag. It is annotated (`git tag -a vX.Y.Z <commit> -m "vX.Y.Z: <what it releases>"`). It goes on the branch head that carries the version bump, not the merge commit. It is pushed with `git push origin vX.Y.Z` after the PR merges.
- Annotated or lightweight: I chose annotated. The brief said every tag is lightweight, but 40 of the 51 tags on origin are annotated, with a tagger and a message. Only v0.28.0 and v0.37.6 onward are lightweight. The card also says annotated.
- Criterion 2: `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a13ea3ad3edd42ce1/docs/fleet-design.md` has its versioning rule line extended with the tag and a pointer to AGENTS.md. `.boards/config.yml` DoD #4 already says "tagged and pushed". No agent body, command, workflow or template names a release step, so I left them alone. README line 167 explains why the bump matters rather than naming a step, so I left it too.
- Criterion 3, tags created locally and not pushed: `v0.27.18` on 1b20329 (the merge of PR #40) and `v0.28.1` on 6190b58 (the merge of PR #42). Both are annotated. For each, the merge's second parent is the `vX.Y.Z:` subject commit.
- The full back-fill list with reasons is in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a13ea3ad3edd42ce1/docs/findings/CF-28-tag-backfill.md`.
- Left untagged and listed there: `v0.24.3` is the imported tree's number and has no `vX.Y.Z:` subject commit. `v0.34.1`, `v0.35.3`, `v0.35.4` and `v0.37.0` were only ever branch numbers, renumbered on merge and never on main's first-parent history. The releases they became are tagged.
- Commands run: `git ls-remote --tags origin`, `git for-each-ref refs/tags`, and a `git log -p -G'"version"'` sweep of plugin.json, with and without `--full-history -m`.
- Ran `bash claude/evals/lib/check-all.sh` once, with output to a file. It exited 1 after 525 s with `FAILED: scope-hook-contract board`.
- Reran `bash claude/evals/lib/scope-hook-contract.sh` alone: 701 passed, 0 failed across 4 shards.
- Reran the four board files that timed out (focus, cli-board-behaviour, actions-for-human-cli, server-host-guard) alone with `./node_modules/.bin/bun test`: 60 pass, 0 fail.
- Both full-run failures were load timeouts, with CF-81 running on the machine. The scope hook section took 459 s, and a 3072-byte scout command took 15 s against a 10 s budget. The board section had several 10 s test timeouts. Every other section passed, including handoff-parity, handoff-extractor, versions, agent pairs, syntax and suite-coverage.
- The change is docs only. The two runs differ, but only after I reran the files alone, so whether these are intermittent failures is the lead's call.
- Tests added: none. There is no failing-then-passing test to report, because the change is documentation and local tags.
---

created: 2026-10-07 01:58
---
Sub-issue 1 of 1: merged to main in PR #82, released as v0.39.5 (annotated tag on 0abc60d, the first release tagged under the new rule). Done still needs: nothing.

Done: AGENTS.md's Releasing section now says every release is tagged vX.Y.Z, annotated, on the branch head carrying the bump that CI proved (not the merge commit), and pushed. Every release on main now has a tag on origin.

Evidence: 1, the AGENTS.md Releasing paragraph on main. 2, fleet-design.md's versioning line now names the tag and points to AGENTS.md; the scripter searched every agent body, command, workflow and template and none names a release step, and the board's DoD item 4 already says tagged and pushed. 3, back-fill done per the human's decision: v0.27.18 (6813a48), v0.28.1 (01db94e) and v0.28.2 (654d078) were missing from origin, now pushed on their release commits; the lead moved the first two off the merge commits the scripter had chosen, to match the new rule. The numbers that were only branch versions (v0.24.3, v0.34.1, v0.35.3, v0.35.4, v0.37.0) were never releases and are listed in docs/findings/CF-28-tag-backfill.md. CI SUCCESS on 0abc60d.

Definition of Done: 1, CI ran the full suite; the scripter's local run failed only on load timeouts with CF-81's suite beside it, and each failing file passed alone. 2, docs only under the size floor, read by the lead. 3, 5, 6 not applicable. 4, v0.39.5 tagged and pushed.

Held for the human, not filed: a suite check that plugin.json's version has a tag on origin.
---
<!-- COMMENTS:END -->
