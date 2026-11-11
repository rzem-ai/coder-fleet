---
name: lead-procedures
description: How the lead carries out each step of its delegation policy - taking an order, the card's comments and ticks, briefing and spawning, the challenge gate and a chosen design, building a change itself, review and escalation, the editors, merging handoffs, shipping, and worktrees and memory. Preloaded into the lead; not discovered.
disable-model-invocation: true
---

# Lead procedures

The lead's body says what it decides at each step and why; this skill says how. Each rule is stated once, here or in the body, and the board's own mechanics - focus, binding, completion, the `Board-Item:` line, the task tools and Actions for Human - are in `help-boards`, which the lead also preloads.

## Taking an order

On every ask from the human for an outcome, search the board for an item that already covers it, across sessions and not only this one. A match is your judgement, and only a repeat counts: an ask for an outcome the human already asked for or ordered in words, earlier, and has not had delivered yet. Filing a card alone is no earlier ask, so the first order on a filed item is the order, not a repeat.

On a repeat, comment on that item the date and the human's words, quoted, raise it to High with `task_edit` (a field, never a column), and take it ahead of any sweep and the next spawn on any other item, never by stopping a running spawn, naming in one line what you moved back.

Take Next cards ahead of any other queued work, top of the column first by ordinal, never by priority. The MCP `task_list` returns a status in ordinal order; the `board.sh` fallback lists by id, so reorder its output. A repeat ask wins over Next: a repeat for a card outside Next goes ahead of the column, and one for a card in Next but not at the top goes ahead of the cards above it, because Next is the queue for when the human is not asking in the session. Only the human moves a card into Next; suggest one to the human, and never move one there yourself.

When the human orders an item, check the card carries what finishes it - acceptance criteria, and a sub-issue for any part they do not cover - because the human reads the card and not the transcript. Before the first spawn, record as a card comment each decision the human gave in the session that the builder needs and no criterion already says, because the builder never sees the session. Each sub-issue carries its own criteria, because `review-round`'s card gate commissions no fix for a card without them.

Before each spawn on an item, reread the human's words on the card; if they no longer match your one-line notice, stop the spawn and either restate the notice to match the card or ask the human. A `reviewer`'s follow-up question gets your default, recorded as a comment on the card, unless that default is hard to reverse, because the item's design questions were asked once already.

## The card

Leave three comments on each sub-issue, an item not split being sub-issue 1 of 1: when it starts, when its pull request is ready to merge, and when it merges to main. Each one's first line is exact, because `/drain` resumes from it and the human scans for it:

```
Sub-issue <n> of <m>: <started | ready to merge in PR #<n> | merged to main at <sha>>. Done still needs: <criteria numbers or sub-issues>.
```

Its body gives Done and Not done in the human's terms, as the Invariants say. Fold a build finishing, a review running and each round's result into the ready-to-merge comment; any other note is yours to judge. Implementation Notes is the human's field, never yours.

Tick an acceptance criterion or a Definition of Done item only on evidence, named in a comment - the test, or the use-mode check that proves it. Tick each as soon as it is verified on the branch: the review approved it, a use-mode reviewer passed it where one runs, and the gates are green. Do it at the latest in the same `task_edit` as the ready-to-merge comment, never waiting for the merge, because a verified card that still reads 0 of n tells the human nothing is done. Tick the Definition of Done in that same call, because the `TaskCompleted` card gate refuses a card with any item unticked and moves it to Blocked; an item that does not apply is ticked, with `not applicable: <reason>` in the ticking comment.

The column is not yours. Once the pull request has merged, and the release is deployed where the project grants it, complete the one task whose subject carries `[board:<id>]` for the card; that completion moves it to Done, and ticks alone never do, so a merged card with no such task sits in In Progress. Judge done against the card's criteria and Definition of Done, never against how many sub-issues have merged. All of this is comments, ticks and fields through `task_edit`.

## Briefing and spawning

Write the brief into the spawn prompt with at least one acceptance criterion, written from the human's words when there is no card, and a `Board-Item: <id>` line when the spawn does board-tracked work. The line is context for the agent and moves nothing; `help-boards` says which spawns carry it. Restate in the brief every rule the agent needs from the session, because a subagent sees only its own body and its prompt.

Ask for a run article in the spawn prompt, and only there: for a substantial or hard run, work someone will have to understand later, or a decision that took real reasoning. Never for routine work, and never left to the agent to judge, because an optional instruction decays. No agent preloads `run-article`, so the brief names where the format is read from: `${CLAUDE_PLUGIN_ROOT}/skills/run-article/SKILL.md`.

Spawn a fleet agent with its type and prompt and nothing else. A spawn given a `name` runs as a teammate whose events carry the name instead of the type, so everything keyed on the type - the scope hook, the handoff gate, worktree isolation - stands down without an error (`docs/limits.md`). A properly typed `coder` or `scripter` gets its worktree from its own definition, and agent worktrees are cut from your current HEAD, so a spawn from a feature branch stacks on it.

Concurrent spawns against one external endpoint - a local model server, a rate-limited API, one database pool - contend for it, and contention surfaces as a misleading error at the far end. Cap or serialise them, and read the endpoint's own logs before believing the client's error.

Whether a paid run - a cloud model or any metered service - needs the human's word is the project's call, read from its `AGENTS.md` on a `Paid runs:` line or in its own words, and never assumed. A brief for a spawn that may start one quotes what it says, and a paid run it does not allow is a `Blocker:`, never a run.

Binding follows `help-boards`: the checkout's focus binds every new spawn, so clear the focus before work that is not the item's, and a resume with SendMessage stays on the item the agent first started on, so to put a finished agent on a different item, spawn a fresh one. If `task_focus` is not among your tools, the board server did not load: name the cause and focus with `board.sh focus <id>`, as `help-boards` says under "When the tools are missing", because the hooks read the focus file, not the tool. Never skip the focus because the tool is gone, and never tell the human the board is unavailable.

## The challenge gate and designs

The challenge gate is the one script `spec-to-card` runs too: `python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/challenge-gate.py" run <id>`, from the checkout, before the first `coder` or `scripter` spawn on an item or any of its sub-issues. Read its `verdict` line. On a pass, spawn: on an intact challenges section it has already closed the challenges and committed "Close the challenges on <issue>", and on a closed marker, a neither answer or no recorded answer it commits nothing, so pass on its `/kickoff` suggestion. On a refusal, or any exit but 0, spawn nothing and tell the human the challenge ids its `blocking` line names.

When a card's work comes from a design the human chose, hand the design to every build and review spawn as files it can Read - the artboard source, such as a canvas's `.dc.html`, and a screenshot of it - copied into the session's scratchpad, or into the repository when the card says the design is part of the deliverable. Never hand over only a link to a claude.ai canvas, because no subagent can open one. Record the paths on the card in one comment whose first line is `Design: <path>, <path>`, which `review-round` reads, and give the card a criterion that the built screen matches the design, proven by a screenshot of the running product set beside the design's. Your own defaults never add or drop structure the design has, such as a column, a control or a section, without asking the human.

## Building a change yourself

Scope's exception lets you build a change under the size floor that you can state completely in your notice. File a card for it first if there is none, recording that the human asked; then call `task_focus` and leave the start comment before you start, because no `SubagentStart` fires for your own build.

Build in a worktree you cut yourself, on a branch named for the card's id and a few words of its title, lowercase and hyphenated (`cf-176-drop-an-old-port`). Every commit subject starts with the id and a colon, or, where the project's own rules fix a subject's start, such as a version on a release commit, theirs comes first and the id goes in brackets at the end. Never build on a branch in the main checkout or on main, so nothing else written there rides in your pull request; land it through a pull request and remove the worktree after the merge.

Spawn no other builder, and ignore `review-round`'s suggestion of `fix: true` or a `coder` as you ignore its gates note. Run `review-round` without `fix: true`, fix its findings yourself in your own worktree, then review the fix commit before it merges: with `review-round` again, which is the second round an auth diff needs, or otherwise with a break-mode `reviewer`, whose baseline runs the full gates; and name break mode wherever Review and escalation calls for one. Take this build's gates from `review-round`'s reviewer (`gates`, `gatesMissing`), never from your own run, because you wrote the code; where the workflow says to run a missing gate yourself, spawn a break-mode `reviewer` instead.

## Review and escalation

A `reviewer` runs the declared gates read-only, never changing the diff or its dependencies, in a worktree at the reviewed head and never in the main checkout or whatever checkout your shell is in. `review-round` reads the coder's clean worktree at that head or cuts one it removes after; a `reviewer` you spawn gets the coder's worktree and head in its brief. It reports each gate's command, exit code and counts. The builder ran the gates too, but wrote the code, so every change needs them run by someone independent.

A `reviewer` reads its modes from one line among the brief's first five, written exactly `Modes: review, break` from the words review, break and use. Review is in every spawn. The hooks read the same line to cap break mode at 25 minutes and to give break and use their outside-the-project write rule, and a malformed line is capped and scoped as review alone, so write it exactly.

Name break only against a change to a code path - a hook, the board binary, a script, an authentication or credential path, or code that writes data (a database, a migration, the board's state or a user's files) - and then only when it touches authentication, authorisation, secrets or data writes, when the item is High, or when a reviewer suspects a test would pass with the fix reverted. Config or prose alone gets no break mode, and a prose mutant that survives is recorded as a low on the card and dropped. A break-mode reviewer runs the full gates as its baseline before it mutates anything; read its review as complete only with that run in hand.

The build phase is the default unless `.claude/coder-fleet.json` sets `harden`. In build, no break mode runs outside an authentication or credential path, whatever the item's priority and whatever the other triggers say: not from `review-round`, whose `refutation skipped by build phase` stop counts as the review being complete, and not from you. Build asks whether the card's criteria hold for the inputs a person will give the product; harden asks what input they would not give. A build-phase finding that answers the second question is a Low and is dropped, and in build a `must fix:` or `survived:` bullet with no user-reachable path is read as one. In harden the other triggers apply.

On a change with no break mode, `review-round`'s verdict reviewer runs the gates once a round at the pinned head, with `refute: false` passed when `fix: true` is; outside `review-round`, you run them once in the coder's worktree with the output captured to a file, and read the summary. Before calling the review complete, read the result's `gates`, and on a change someone else built run the gates yourself when anything is under `gatesMissing`. Then read the verdict and its follow-ups for a suspected test that would pass with the fix reverted, and in harden spawn a break-mode `reviewer` if one is there. A `refuter` or `evaluator` entry under `disabledAgents` switches nothing off, since both are reviewer modes and the reviewer cannot be disabled; `review-round` logs it and goes on, and you tell the human the entry can go.

A round with anything under `gatesFailed` - a gate line with a non-zero exit - is not approved, whatever the verdict says, because the gate run is the round's evidence and the verdict is one reviewer's reading. Read why it failed before anything else; a pass on a rerun is an intermittent failure, not a pass.

The round after an accepted fix is narrow: the reviewer alone, over the fix commit, against what the round before asked for. When git says the fix changed prose alone, `review-round` runs no such round and stops with `prose-only fix`: no round reviewed the fix and no gate ran at its head, and `gatesMissing` names that head. Read the fix's diff against each finding yourself, and call the review complete only when the gates pass at that commit - run by someone other than the builder, or CI's result on it - and each finding is answered; one that is not goes in the Polish sub-issue. A fix that touches a board or agent-memory file is never prose, nor is one under a hooks, scripts, workflows, tests or evals directory, so it gets the narrow round. In harden, where a break lane would have run on that round, decide from the triggers above whether to spawn a break-mode `reviewer`. Neither shortcut applies on an authentication or credential path, whose round after the fix is the full, deeper one.

A break-mode round is 20 minutes and a hook stops it at 25, so brief it for 20 minutes and at most eight mutants, never a longer budget. When one hands back work under Not done, spawn a fresh break-mode `reviewer` on that list rather than resuming it with SendMessage, because a resume keeps its first start time, so once that is 25 minutes past, every tool call it makes is denied.

Where the main checkout's `AGENTS.md` has an `App start:` line with no `<...>` placeholder, spawn a `reviewer` with use mode after the review round and before its fix round, with the builder's worktree, its head and the card's acceptance criteria, so one fix round carries both. It grades each criterion against what it saw the running product do, and its `must fix:` bullets are findings like any review's. After a fix round that touched a failed criterion, spawn it once more in use mode on those criteria alone. A criterion it failed is never ticked, and its pass is the evidence a tick names beside the test.

A UI change whose handoff says it was not checked in a browser is not ready, and its pull request is not marked ready, while a use-mode reviewer or a screenshot can still check it: spawn a use-mode `reviewer` where there is an `App start:` line, or send the builder back for a screenshot of the running product. With no `App start:` line, set the builder's screenshot beside the design's yourself before merging; a difference its handoff does not name is a finding for the fix round. A reviewer's Unverified line saying it could not open a design, or had no screenshot to set beside it, is that comparison not done, never a pass.

## Editors

Once `spec-writer` has revised a spec after the interview, and before the human edits it, spawn the spec editor the project's `AGENTS.md` names on its `Spec editor:` line, once, with the spec's path in the brief: `spec-editor` for opus, `spec-editor-fable` for fable, none for neither. With no such line, or a `<...>` placeholder value, spawn none and suggest `/kickoff` to the human.

Every `tech-writer` output goes, before it ships, to the tech editor named on the `Tech editor:` line, spawned once on it with the document's path and its sources in the brief: `tech-editor` for opus, `tech-editor-fable` for fable. With neither, no such line or a placeholder value, output with an external audience gets an opus pass before it ships, which is you, on Fable too if you are switched to it, and internal output gets none.

Fable is never a subagent model except for the Fable spec or tech editor a project chose, because that editor runs a fixed number of times on one document under a hard turn cap, so its draw on the shared weekly cap is bounded (design section 4).

## Handoffs and proposals

A `Propose item:` line gets a board search first. A match becomes a comment on the matched card; no match becomes a comment on the card being worked, never a line in your reply, or one line in your reply when no card is being worked. File a card from it only when the human says so, with `task_create`, and with `docs/specs/<id>.md`, where there is one, added as a reference rather than pasted in. `fleet-steward` files what its scheduled sweep found itself, so never re-file what it lists under Done.

Every item you file carries acceptance criteria. One filed ahead of its spec carries provisional ones saying what the spec must settle, and at sign-off you replace them with one card criterion per spec criterion, same number. In a project that names a requirements source and has no spec, an item's criteria are the requirement clauses it answers, in clause order, written when you file it. Either way, any criterion you add follows after them, and a revised spec means rewriting the list.

Each `Blocker:` line also lands as a numbered action in the card's Actions for Human section. When the human answers one in the session, tick it with `actionsCheck` and comment the answer in the same call, as `help-boards` says, because a card in Blocked by human stays there while any action is unticked. When you need the human's decision outside a subagent handoff, add one with `actionsAdd`, phrased as a question ending in `?`, and ask in the session as well, since adding moves no column. Clear the section with `actionsClear` and a reason only for an action you know is void, such as a mis-bound or mislabelled blocker.

A spawn that returns with no handoff is a failed run: respawn it or investigate. Say so in a comment on its card if the hook has not, because the hook covers foreground spawns only, never background ones. Resume an agent stopped at its turn cap with SendMessage rather than treating its partial result as done.

An article a `reviewer` or `researcher` returns above its handoff, you save under `docs/runs/`, named as the `run-article` skill says, and never commit.

## Shipping

The project's `AGENTS.md` says under `Where work lives`, on a `Shipping:` line or in its own words, which of these steps you take and names its deploy command, and nothing else grants one. Take each granted step without asking, in this order:

1. Commit and push the branch.
2. Open its pull request as a draft.
3. Give it the body's step 4 review: one review round and at most one fix round. When commits land after an approval, review only those, in one narrow round, which licenses no further fixes on the first findings.
4. Mark it ready with `gh pr ready` and merge it on GitHub, only once the review approved it, CI is green and GitHub reports it mergeable.
5. Tag the merge commit `vMAJOR.MINOR.PATCH`, the next minor for a change a person sees and otherwise the next patch, and push the tag. A merge that changes nothing the product runs is neither tagged nor deployed.
6. Run `${CLAUDE_PLUGIN_ROOT}/board/board.sh flush --tag <that tag> --by lead` from the main checkout. It lands the board and memory written since the last flush on the default branch as one commit after the tagged one and pushes it, so the tag stays on the commit CI proved and the flush commit is never tagged. Report a flush that fails rather than pushing its commit any other way.
7. Deploy that release with the project's command.
8. Remove the worktree and its branch.

Where the project's `AGENTS.md` says otherwise on a detail, such as which commit carries the tag, it wins. Stop at the first step it does not grant and report where the work stands, so a project that grants none keeps the default: you push and open the pull request, and the merge is the human's.

Never ask before a step the orders cover. When the harness or a permission refuses one covered step, report the refusal and ask about that step once, and take the covered steps after it without asking, because one refusal changes nothing the orders granted.

## Worktrees and memory

As soon as a worktree's work is merged into the default branch and nothing is using it - a `coder`'s or `scripter`'s, or one you cut yourself - remove it without asking the human. The harness keeps every changed worktree by design, both builders are forbidden from deleting their own, and nothing else in the pipeline owns the step, so without you they accumulate. `/coder-fleet:prune-worktrees` is the procedure: it removes only what is clean, unlocked and already an ancestor of the default branch, so it can never destroy unadopted work and is not the hard-to-reverse deletion the Invariants reserve for the human. Never remove a worktree with unsaved work, memory the state branch has not taken included: report it instead.

Each agent keeps its own memory under `.claude/agent-memory/` in the checkout Claude Code put it in, and the `memory-state.sh` hook commits every change on the state branch, `coder-fleet/state`, from where it reaches the default branch only in the flush after a release tag. Never commit memory with an item's work, so a feature branch carries only the item. Never copy memory between checkouts, a write the Claude desktop app's own worktree guard refuses from a session in a worktree. Never discard, revert or rewrite another agent's notes; a memory change that should not ship is a question for the human, not a delete.
