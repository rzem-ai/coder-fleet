---
id: CF-201
title: >-
  Keep the fleet's board, memory, rules, config and specs out of a project's
  history with .git/info/exclude
status: In Progress
assignee: []
created_date: '2026-11-12 08:13'
updated_date: '2026-11-12 09:49'
labels: []
dependencies: []
priority: High
type: feature
ordinal: 327000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human, 12 Nov 2026: "the boards being committed is cause of pain in a lot of different ways. so, rather than gitignoring the board, config, et al, use the `.git/info/exclude` file. that means that this plugins `/init` should add: `.boards/` `.claude/agent-memory/coder-fleet-*/` `.claude/rules/{whatever we place here}` etc to the exclude file".

His answers to three questions the same day:
1. Default or choice: "Always, no choice (Recommended)" - /init always writes the exclude entries; the board and memory live only on the state branch; a flush lands nothing on main.
2. What else is excluded beyond the board, the fleet's agent memory and the rule files it installs: ".claude/coder-fleet.json, docs/specs/ and docs/runs/". He did not pick .claude/settings.json, so it stays committed, as does AGENTS.md.
3. Existing projects: "/init migrates it (Recommended)" - re-running /init untracks what is committed with `git rm --cached` in one commit it asks about first (files stay on disk and on the state branch), removes the old .gitignore lines it wrote, and writes the exclude entries.

Background. Today /init step 2a (CF-188) asks whether to commit or ignore the board and memory and writes `.gitignore` for ignore; `board flush` (CF-183, CF-188, CF-198) lands board and memory from `coder-fleet/state` on the default branch after a release tag, skipping what the default branch ignores; lead-procedures has a rule for a project that gitignores agent memory (CF-189); the glossary's Memory row says memory reaches the default branch in the flush after a release tag. `.git/info/exclude` lives in the common git dir, so every linked worktree shares it and it is never committed; it hides only untracked files.

Open to the build, with the lead's defaults in comment 1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 /init writes to the common git dir's info/exclude, once and idempotently, an entry for each of: .boards/, .claude/agent-memory/coder-fleet-*/, each rule file the fleet installs under .claude/rules/, .claude/coder-fleet.json, docs/specs/ and docs/runs/; it asks no commit-or-ignore question, writes no .gitignore line for them, and leaves .claude/settings.json and AGENTS.md to be committed
- [x] #2 In a project where any of those paths is tracked, /init says what it will untrack, asks once, then untracks them with git rm --cached in one commit, removes the .gitignore lines an earlier /init wrote for them, and leaves every file on disk and on the state branch; declined, it changes nothing and says the project is half set up
- [x] #3 The board, its hooks and every agent's memory still work in an excluded project: cards are written and committed on the state branch, the hooks move them, memory is committed on the state branch, and linked worktrees and the state worktree see the same exclude
- [x] #4 board flush and /coder-fleet:flush in an excluded project land nothing on the default branch and say so in one line, lose no board or memory file from the state branch or its worktree, and the lead's shipping steps no longer require a flush commit after a tag
- [x] #5 Every place that says the board or memory reaches the default branch says what is true now: the glossary Memory row and its generated rule, lead.md, lead-procedures (the ignored-memory rule from CF-189 folded in or removed), help-boards, flush.md, init.md, kickoff.md, the templates, claude/README.md, docs/fleet-design.md, docs/board-config.md and AGENTS.md's Releasing section
- [x] #6 A contract or board test covers: a fresh /init's exclude entries, a second run adding nothing, the migration of a tracked project, a flush that lands nothing, and a linked worktree honouring the exclude
- [x] #7 The coder-fleet repo itself is migrated by its own /init steps in this pull request or the handoff says exactly which commands the human runs to migrate it, and CI still passes with the board untracked
- [x] #8 `bash claude/evals/lib/check-all.sh` passes
- [x] #9 The state branch is pushed to the remote as its own branch automatically after board and memory commits, never to the default branch: a push that fails or has no remote is logged and blocks nothing, and a fresh clone that fetches it gets the board and memory back, with a test
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-12 08:15
---
Fourth decision from the human, 12 Nov 2026. Asked whether the fleet should push the state branch, since nothing pushes it today and an excluded board would otherwise live on one machine: "Push it automatically (Recommended)". Criterion 9 added for it.

Lead's defaults for what the card leaves to the build, each easy to reverse:
- The push is of `coder-fleet/state` to the remote the main checkout fetches from, without force, in the background or bounded by a short timeout so no hook or tool call waits on the network; a rejected non-fast-forward is logged and reported to the lead, never forced.
- `board flush` stays as a command and now reports that nothing lands on the default branch and pushes the state branch; the lead's shipping steps drop the flush commit after a tag.
- Excluded paths are untracked, so they exist only in the main checkout, not in a linked worktree. Anything an agent in a worktree needs from them - a spec under docs/specs/, .claude/coder-fleet.json, the installed rule files - must be read from the main checkout (or the state worktree where it is committed there). The coder finds every reader and says how each is reached; a reader that cannot be reached is a Blocker, not a guess.
- This repo is a special case: it is the plugin's source, its installed glossary rule is checked by the suite, and its docs/specs/ are committed. If migrating it breaks the suite or CI, the coder says so and proposes the smallest exception rather than weakening a check.
- The exclude entry for memory is the human's pattern, `.claude/agent-memory/coder-fleet-*/`, so another tool's memory beside it is left alone.

Sub-issue 1 of 1: started. Done still needs: criteria 1 to 9.

Done: nothing yet. Not done: /init still asks commit or ignore and writes .gitignore, a flush still lands the board on main, and nothing pushes the state branch. A coder is being spawned; because this changes hooks, the board binary and where the board's data lives, the review gets a second round.
---

author: lead
created: 2026-11-12 09:26
---
Built on PR #171 at ac580d67; review round 1: request changes, one must fix. Whether a project is excluded was read from the clone-local .git/info/exclude, so on a fresh clone or a second machine the old flush ran: it would land the board and memory on the default branch again and, in a migrated project, restart the state branch with most cards gone. Sent to the coder as the item's one fix round. Lead's ruling from the human's "Always, no choice": remove the fork - a flush never lands board or memory on the default branch in any project; a not-migrated project gets one line naming /init; adopting the state branch on a fresh clone writes the exclude entries. Riding the round: stageUnexcluded bypasses only the fleet's own exclude entries; the migration question says the files stay on disk only in the migrating clone. All four declared gates were green at ac580d67. A narrow round 2 follows.

Two more decisions from the human, 12 Nov 2026, each filed as its own sub-issue: specs go on the state branch too ("Yes, on the state branch (Recommended)"), and this repo is migrated after its three tests accept the excluded layout ("Fix the tests, then migrate (Recommended)"). Criterion 7 is met by the second: the handoff gives the exact commands and the three failing checks.

Seven automated security findings on the push and restore paths were folded in during the build: restore only from the fetch remote and never over a local branch; the push's files out of .git; the push to the one literal fetch URL; mirror, pushurl, URL-named remote sections and legacy remotes files refused. Unverified by the coder: a real https or ssh remote (all through a stub), and whether a subagent in a worktree loads .claude/rules/.

Coder's proposal, not filed: port fleet-exclude.py and the exclude step to OpenCode with the board.
---

author: lead
created: 2026-11-12 09:48
---
Sub-issue 1 of 3: ready to merge in PR #171. Done still needs: sub-issues CF-201.1 (specs on the state branch) and CF-201.2 (migrate this repo), and Definition of Done 4 (the version bump and tag, which are the human's).

Done: /init writes the fleet's paths to .git/info/exclude with no commit-or-ignore question and migrates a project that tracks them, after asking once. The board, hooks and memory work in an excluded project. `board flush` lands nothing on the default branch in any project on any clone, prints one line and pushes the state branch; the landing path and its CF-188 and CF-198 machinery are deleted. The state branch is pushed automatically after board and memory commits to the one literal fetch URL, never forced; a fresh clone adopts it from the fetch remote and gets the exclude entries written. Head 2c646827.

Evidence for the ticks. Criterion 1: fleet-exclude-contract.sh X01-X04. Criterion 2: M01-M10, R01-R04. Criterion 3: excluded-board.test.ts (move, agent-worktree writes, never committed on main, empty memory, same exclude in every worktree), fleet-exclude W01-W02, board-git-check `excluded:` cases. Criterion 4: flush.test.ts `lands nothing on the default branch from a clone with no exclude file...`, `lands nothing after pulling a migration commit...`, `says in one fixed line that a project not yet migrated...`, each seen failing at ac580d67; round 2's reviewer confirmed they fail on revert. Criterion 5: the prose sweep, read in both rounds; round 2 swept for `flush lands` and found only accurate historical references. Criterion 6: the tests above. Criterion 7: met by its second arm - the coder's handoff gives the exact commands and the three checks that fail, and the migration is sub-issue CF-201.2 at the human's word. Criterion 8 and Definition of Done 1: round 2 reviewer's check-all.sh at 2c646827 exit 0 (board 366 pass), scope-hook, board-hook and handoff-parity exit 0, tsc clean, binary builds; CI green on the same head. Criterion 9: state-push-contract.sh P01-P20, B01-B03 (B03 the fresh clone), excluded-board.test.ts adoption and `--from` cases. Definition of Done 2: round 1 request changes (one must fix), one fix round, narrow round 2 `approve with follow-ups`, no blocking finding; build phase, no refuter round. Definition of Done 3: migration-checklist findings in the PR - one sentence each in coder.md and scripter.md, frontmatter untouched. Definition of Done 5: the port's register rows. Definition of Done 6: no spec.

Not done: not released. This repo is not migrated, so its own flush now says the default branch still tracks the board and lands nothing, and its board on main goes stale until CF-201.2. Never run against a real https or ssh remote. Unverified whether a subagent in a worktree loads .claude/rules/ once untracked.

Dropped lows, recorded: board-git-check.sh's printed manual fix uses `git add -f`, which would stage a file a personal exclude pattern hides; `board state --from` on a clone with no local state branch writes no exclude entries.
---

author: lead
created: 2026-11-12 09:49
---
Sub-issue 1 of 3: merged to main at d1f65655. Done still needs: sub-issues CF-201.1 and CF-201.2, and Definition of Done 4 (the version bump and tag, which are the human's).

Done: the exclude, the migration, the flush that lands nothing and the automatic state-branch push are on main (PR #171, squash-merged after round 2 approved, CI green including all five binary builds). The coder's memory note is on the state branch and its run article is in docs/runs/. Worktree and branches removed.

Not done: not released; this repo not migrated; specs still on one machine once a project is excluded.
---
<!-- COMMENTS:END -->
