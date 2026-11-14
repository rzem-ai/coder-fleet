---
id: CF-209
title: >-
  A project can name its own trunk and keep the fleet's work local: baseBranch
  and push settings
status: To Do
assignee: []
created_date: '2026-11-14 02:27'
updated_date: '2026-11-14 02:32'
labels: []
dependencies: []
type: feature
ordinal: 338000
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

and: "let's drop the SKILL idea, you have shown that that is the wrong path, and a more fully fleshed out card+subcards needs to be fleshed out".

The problem. The plugin works out the trunk from `origin/HEAD` in five separate places with no shared helper, and its written rules make "push the branch and open a pull request" the default way work lands. In a repository where the human's own feature branch is the trunk and upstream's `main` is not, the fleet fast-forwards the wrong branch, checks merged work against the wrong branch, reviews against the wrong base, and pushes item branches to a remote the human wants kept clean.

The shape. Two keys in `.claude/coder-fleet.json`, which is already local to the main checkout, kept out of history and read by the hooks, so nothing has to go in a client repository's own `AGENTS.md`:
- `baseBranch`: the branch the fleet treats as the trunk. Absent means today's behaviour: what the remote's HEAD names, else `main`.
- `push`: absent or `all` means today's behaviour. A restricted value keeps item branches local, opens no pull request, pushes no tag, and lands work on the base branch locally.

Decisions recorded (lead's defaults, 2026-11-14):
- The settings live in `.claude/coder-fleet.json`, not `AGENTS.md`, because in a client repository `AGENTS.md` belongs to upstream.
- Out of scope: the `coder-fleet/state` push. CF-207 criterion 50 removes the state branch, `state-push.sh` and the memory hook's branch commits, so no sub-issue here touches `hooks/state-push.sh`, `hooks/lib/memory-state.py`, `board/src/flush.ts`, `board/src/state-worktree.ts`, `scripts/board-git-check.sh` or `commands/flush.md`. Until CF-207 group G ships, a project with a restricted `push` still has its state branch pushed; sub-issue 3 says how that gap is closed in the meantime.
- Release commit subjects keep their shape (`vX.Y.Z: <what> [ids]`), because `board-release-close.sh` keys on it.
- No gitflow skill, and no move to classic Gitflow: the fleet stays single-trunk, and the trunk becomes nameable.

Sequencing against CF-207 (the `fleet` session is draining it). Sub-issues 1 to 3 touch files the CF-207 spec does not mention, except `enforce-agent-scope.sh`, which criterion 52 gives one new rule. Sub-issues 4 and 5 rewrite `lead-procedures`, `/drain`, `/triage`, `/kickoff` and `/init` text that CF-207 criteria 53 and 55 also rewrite, so they are built after those CF-207 groups merge, or the two are coordinated.

Inventory behind the sub-issues (scout, 2026-11-14, paths under claude/coder-fleet/). Executable trunk resolvers that stay: `hooks/main-fast-forward.sh:155-157`, `scripts/prune-worktrees.sh:111-120`, `workflows/review-round.js:1167,1232` (a lane agent resolves it; range at 354). Hard-coded names: `hooks/enforce-agent-scope.sh:1443-1444` (fleet-steward, ` main`/` master`). Shared config reader: `hooks/lib/fleet-config.sh` and `fleet-config.py`; `review-round.js:389` reads the file through a lane agent on its own. Push today: the scope hook lets a coder or scripter push anything from a linked worktree (`:2407-2502`), has no rule for the lead, and nothing executable opens a pull request; the lead does so from `lead-procedures` Shipping (`:109-121`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In a repository whose remote HEAD names `main` and whose `.claude/coder-fleet.json` sets `baseBranch` to another branch, the session-start fast-forward, a worktree prune, a review round in target mode and a sweep each treat the set branch as the trunk, and none of them acts on `main`.
- [ ] #2 With neither `baseBranch` nor `push` set, every hook, script, workflow and command behaves as it does today, shown by the existing contract suites passing with no expectation changed.
- [ ] #3 With `push` restricted, no session or agent in that project - the lead, coder, scripter and fleet-steward included - can push an item branch, push a tag or open a pull request; each attempt is refused with a message that names the setting.
- [ ] #4 With `push` restricted, an ordered card goes from its first spawn to its work landed on the base branch, reviewed and with gates run by someone other than the builder, with no remote operation beyond fetching the base branch and whatever push of the base branch the setting allows.
- [ ] #5 The human sets, changes and reads both settings through a fleet command, and an invalid value is reported by name and never silently treated as the permissive default.
- [ ] #6 A card whose work landed on the base branch without a pull request can reach Done, and its worktree is removed by the prune, without the human doing either by hand.
- [ ] #7 The written rules the lead and builders follow, the project template and the hook documentation describe the trunk as the base branch setting with its fallback, and describe both ways of landing work, with no place left that says the trunk is always what `origin/HEAD` points at.
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
<!-- COMMENTS:END -->
