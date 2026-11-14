---
id: CF-209
title: >-
  A project can name its own trunk, keep the fleet's work local and say whether
  it releases: baseBranch, push and release settings
status: Next
assignee: []
created_date: '2026-11-14 02:27'
updated_date: '2026-11-14 02:54'
labels: []
dependencies: []
type: feature
ordinal: 9000
---

## Actions for Human
<!-- ACTIONS:BEGIN -->
- [x] #1 Under a restricted `push`, may the lead push the base branch itself after landing a card, or is every push yours, so the fleet pushes nothing at all?
- [x] #2 Under a restricted `push`, does a card land on the base branch as one squashed commit, or with the builder's commits kept?
<!-- ACTIONS:END -->

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Asked by the human in the session on 2026-11-14, first as a "gitflow" skill for the lead and coder, then redirected once it was clear a skill could not deliver it. The human's words:

"there has to be an option somewhere to say which is the "main" branch. In other work I wish to use this plugin for, `main` is not the "right" branch, and I also do not want it pushing everything into git. For example, my work with LibreChat at Deloitte, the "main" branch is MY feature branch (`feat/citations` for example), and I do not want the agent to push any other branches, I want all the work to be local, and only my branch (`feat/citations` in this case) is ever pushed"

and: "let's drop the SKILL idea, you have shown that that is the wrong path, and a more fully fleshed out card+subcards needs to be fleshed out"

and, on releases: "how do we add a flag to say that it should create tags and releases when configured on a repo".

The problem. The plugin works out the trunk from `origin/HEAD` in five separate places with no shared helper, and its written rules make "push the branch and open a pull request" the default way work lands. In a repository where the human's own feature branch is the trunk and upstream's `main` is not, the fleet fast-forwards the wrong branch, checks merged work against the wrong branch, reviews against the wrong base, and pushes item branches to a remote the human wants kept clean.

The shape. Three keys in `.claude/coder-fleet.json`, which is already local to the main checkout, kept out of history and read by the hooks, so nothing has to go in a client repository's own `AGENTS.md`. Each is independent of the other two:
- `baseBranch`: the branch the fleet treats as the trunk. Unset means today's behaviour: what the remote's HEAD names, else `main`.
- `push`: unset or `all` means today's behaviour. `base-only` keeps item branches local and opens no pull request; work lands on the base branch locally as one squashed commit per card, and the lead may push the base branch, and only it, after a landing. Builders never push.
- `release`: whether the fleet cuts releases in this project. `off`: no tag is ever created or pushed and no GitHub Release is made, and a card ends at Done. `tag`: after a landing the lead puts an annotated `vX.Y.Z` tag, whose message carries the `Cards:` line, on the landed commit on the base branch and pushes it, and the board's own tag watch moves the cards to Released. `github`: the tag, plus a GitHub Release made from it with `gh release create`. Unset means today's behaviour: the project's shipping words decide.

So a client checkout sets `push: base-only` and `release: off`, and one of the human's own repositories with an unusual trunk can set `push: base-only` and `release: tag`.

Decisions recorded (2026-11-14; the human's answers are quoted in comments 2 and 5):
- The settings live in `.claude/coder-fleet.json`, not `AGENTS.md`, because in a client repository `AGENTS.md` belongs to upstream.
- `push` has one restricted value, `base-only`, and the lead pushes the base branch after a landing.
- A card lands as one squashed commit whose subject starts with the card's id and a colon.
- `release` takes `off`, `tag` or `github`. With `release: off` a landed card stops at Done; with `tag` or `github` the pushed tag moves it to Released through the board's normal mechanism, with no special path.
- Out of scope: the `coder-fleet/state` push. CF-207 criterion 50 removes the state branch, `state-push.sh` and the memory hook's branch commits, so no sub-issue here touches `hooks/lib/memory-state.py`, `board/src/flush.ts`, `board/src/state-worktree.ts`, `scripts/board-git-check.sh` or `commands/flush.md`, and sub-issue 3 adds one guard to `hooks/state-push.sh` as a stopgap until CF-207 group G deletes the file.
- Release mechanics follow the new board (CF-207 spec 31 and 32, on the `fleet` session's account): a release names its cards on a `Cards:` line in the annotated tag's message, and a pushed tag moves Done cards to Released. The old `vX.Y.Z: <what> [ids]` commit subject and `board-release-close.sh` go with CF-207 group G, so this item puts no constraint on commit subjects beyond the card id on a landing.
- No gitflow skill, and no move to classic Gitflow: the fleet stays single-trunk, and the trunk becomes nameable.

Sequencing against CF-207 (the `fleet` session is draining it, and now owns this item). Sub-issues 1 to 3 touch files the CF-207 spec does not mention, except `enforce-agent-scope.sh`, which criterion 52 gives one new rule. Sub-issues 4 and 5 rewrite `lead-procedures`, `/drain`, `/triage`, `/kickoff` and `/init` text that CF-207 criteria 53 and 55 also rewrite, and sub-issue 4's release step depends on the new board's tag watch from CF-207.5, so they are built after those CF-207 groups merge, or the two are coordinated.

Inventory behind the sub-issues (scout, 2026-11-14, paths under claude/coder-fleet/). Executable trunk resolvers that stay: `hooks/main-fast-forward.sh:155-157`, `scripts/prune-worktrees.sh:111-120`, `workflows/review-round.js:1167,1232` (a lane agent resolves it; range at 354). Hard-coded names: `hooks/enforce-agent-scope.sh:1443-1444` (fleet-steward, ` main`/` master`). Shared config reader: `hooks/lib/fleet-config.sh` and `fleet-config.py`; `review-round.js:389` reads the file through a lane agent on its own. Push today: the scope hook lets a coder or scripter push anything from a linked worktree (`:2407-2502`), has no rule for the lead, and nothing executable opens a pull request or creates a tag; the lead does both from `lead-procedures` Shipping (`:109-121`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a repository whose remote HEAD names `main` and whose `.claude/coder-fleet.json` sets `baseBranch` to another branch, the session-start fast-forward, a worktree prune, a review round in target mode and a sweep each treat the set branch as the trunk, and none of them acts on `main`.
- [ ] #2 With none of `baseBranch`, `push` and `release` set, every hook, script, workflow and command behaves as it does today, shown by the existing contract suites passing with no expectation changed.
- [ ] #3 With `push: base-only`, no session or agent in that project - the lead, coder, scripter and fleet-steward included - can push an item branch or open a pull request, and the only push allowed besides the lead's push of the base branch is a version tag when `release` is `tag` or `github`; each refused attempt gets a message that names the setting.
- [ ] #4 With `push: base-only`, an ordered card goes from its first spawn to its work landed on the base branch as one squashed commit, reviewed and with gates run by someone other than the builder, with no remote operation beyond fetching the base branch, the lead's push of it, and the release step `release` allows.
- [ ] #5 The human sets, changes and reads all three settings through a fleet command, and an invalid value is reported by name and never silently treated as the permissive default.
- [ ] #6 A card whose work landed on the base branch without a pull request can reach Done, and its worktree is removed by the prune, without the human doing either by hand.
- [ ] #7 The written rules the lead and builders follow, the project template and the hook documentation describe the trunk as the base branch setting with its fallback, describe both ways of landing work and the three `release` values, with no place left that says the trunk is always what `origin/HEAD` points at.
- [ ] #8 With `release: off`, the fleet creates no tag, pushes no tag and makes no GitHub Release in that project whatever `push` says, each attempt is refused naming the setting, and a landed card ends at Done.
- [ ] #9 With `release: tag`, after a landing the lead creates an annotated `vX.Y.Z` tag on the landed commit with the `Cards:` line and pushes it, and the cards it names move from Done to Released by the board's own tag watch; with `release: github` the same happens and a GitHub Release exists for that tag.
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
author: lead
created: 2026-11-14 02:28
---
Filed 2026-11-14 with five sub-issues (CF-209.1 to CF-209.5), at the human's request to flesh out a card and sub-cards in place of the gitflow skill. Nothing is ordered for building yet. The inventory in the description comes from a scout run the same day; its Unverified list: the git calls behind `hooks/lib/memory-state.py:835,940` were not traced (the file goes with CF-207), `enforce-agent-scope.sh:2024` was not read, and whether the scope hook has any rule for the lead's own pushes was judged from a grep, not a full read - sub-issue 3's builder confirms that first.
---

author: lead
created: 2026-11-14 02:30
---
Answered by the human in the session, 2026-11-14.

1. Who pushes the base branch under a restricted `push`: "The lead, after landing". So `push` takes one restricted value, `base-only`: the lead may push the base branch, and only it, after a card has landed and its review passed; every other push, every tag push and `gh pr create` is refused for every session and agent, and a force-push, `--force-with-lease` or `--delete` of the base branch is refused too. Builders never push, the base branch included.

2. How a card lands: "One commit per card". The builder's commits are squashed into one commit on the base branch whose subject starts with the card's id and a colon. Sub-issue 4's prune criterion therefore has to recognise a squashed landing, since its HEAD is never an ancestor of the base branch.
---

author: lead
created: 2026-11-14 02:32
---
Correction to the description's decision "Release commit subjects keep their shape", 2026-11-14: that shape is the old board's. Per the `fleet` session, the new board reads a release's cards from a `Cards:` line in the annotated tag's message and `board-release-close.sh` goes with CF-207 group G, so CF-209 places no constraint on commit subjects beyond the card id prefix on a landing. The open consequence, how a card reaches Released with no tag pushed, is an Actions for Human entry on CF-209.4. `fleet` is content for CF-209.3's `state-push.sh` guard to land before group G.
---

author: lead
created: 2026-11-14 02:33
---
Handed over 2026-11-14: the human said the `fleet` session handles CF-209 and its sub-issues from here. The session that filed them (coder-fleet-07) holds no worktree, branch or focus on them and spawned no builder. The Actions for Human entry on CF-209.4 about Released is still unanswered and passes to `fleet`.
---

author: lead
created: 2026-11-14 02:45
---
Decision from the human in the coder-fleet-07 session, 2026-11-14, after the handover to `fleet`. His words: "how do we add a flag to say that it should create tags and releases when configured on a repo", and his pick: "Off / tag / GitHub".

A third key in `.claude/coder-fleet.json`, `release`, independent of `push`, so a repository can keep item branches local and still cut releases, and a client checkout can do neither:
- `off`: the fleet never creates or pushes a tag, and cards there end at Done.
- `tag`: after a landing the lead tags the landed commit on the base branch with an annotated `vX.Y.Z` tag whose message carries the `Cards:` line, and pushes the tag; the new board's own tag watch then moves the cards to Released.
- `github`: the tag, plus a GitHub Release made from it with `gh release create`.
Unset means today's behaviour: the project's shipping words decide.

What it changes in the sub-issues, for `fleet` to fold in as it sees fit, none of it edited by this session:
- CF-209.1 parses and validates `release` with the other two keys, and the command shows and sets it.
- CF-209.3: under `push: base-only` with `release` at `tag` or `github`, the scope hook lets through one more thing, a push of a version tag that points at a commit on the base branch already pushed; with `release: off` a tag push and `gh release create` are refused whatever `push` says.
- CF-209.4: the landing sequence gains the tag step where `release` is on. This answers the open Actions for Human entry on CF-209.4: with `release` on, Released is reached by the board's normal mechanism and no special path is needed; with `release: off`, a card stops at Done. The entry is left unticked for `fleet` to tick against this comment.
- The parent's third criterion ("push a tag" always refused under a restricted push) needs rewording to match.
---

author: lead
created: 2026-11-14 02:54
---
2026-11-14, at the human's request ("can you update the cards please"): `release` is now written into this card's description and criteria and into CF-209.1, .3, .4 and .5, by the coder-fleet-07 session, with `fleet` told. Criterion 3 is reworded for the tag exception, criteria 2, 4, 5 and 7 now cover all three settings, and criteria 8 and 9 are new. The placeholders that pointed at the human's answers now state them: `base-only`, the lead pushes the base branch, one squashed commit per card. CF-209.2 is unchanged, since `release` touches no trunk reader. Comments 3 and 5 are folded into the description and stay as the record of where each decision came from.
---
<!-- COMMENTS:END -->
