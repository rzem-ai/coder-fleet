---
name: help-boards
description: How the board works - the repository's GitHub issues grouped by status label, the meaning of the six columns (to do, next, in progress, blocked, blocked by human, done), which columns are written by hooks and which a human-facing assistant writes itself, the checkout's focus (`focus.sh`, `/work`) that tells the hooks which issue the work is on, the issue body's checklists, how the handoff's Decisions needed lines reach the human queue, and what earns an issue at all.
when_to_use: Read before filing, reading, labelling, commenting on or closing any issue, before spawning a subagent against an issue, before reporting board status to the human, and whenever you are deciding whether a piece of work is board work or just a task inside the session.
---

# The board

The board is this repository's GitHub issues, grouped into columns by status label, and reached through the `gh` CLI with the human's own authentication. There is no other store: no files, no server, no web UI of the fleet's own. GitHub's issue list, filtered by label, is the view. Nothing sits between the board and Claude Code's native task list.

**Projects** - a project is the repository. A monorepo that wants to say which part an issue touches uses a label for it; there is no list to be on.

**Issues** - one GitHub issue per tracked unit of work, written `#12`. A sub-issue is a GitHub sub-issue of its parent, and an issue with sub-issues is done when they are. A milestone is a GitHub milestone, set only where there is a real date or deliverable. One repository, one board: what you see is this project's state and nothing else's.

## What earns an issue

An issue in the glossary sense earns a GitHub issue. That is the unit of work the human cares about, and it either has a spec or is trivial enough not to need one. A sub-issue earns one too, linked under its parent.

A Task in the glossary sense never becomes an issue. Tasks are the execution layer inside a session, cheap and many, created with `TaskCreate` and dead when the session ends. One issue may spawn twenty of them and the board does not move. Sessions, phases, rounds, handoffs and reviews are not issues either. If you are filing something to remember it for the next ten minutes, it is a task, not an issue.

The lead files work that surfaces mid-run. An agent that spots adjacent work while doing a task does not file it itself: the work leaves the run as a `Propose item:` line under Decisions needed, and the lead files it when it merges the handoffs. A Low review finding never earns an issue: it is fixed in a fix round that runs anyway or dropped.

`fleet-steward` is the named exception, and the only one. Its sweep is scheduled and unattended rather than mid-run, and there is no lead in the loop to file for it, so proposing would mean a weekly run produced nothing at all until the human next started a session. It files what the sweep found itself, as issues on the coder-fleet repo. That is a licence to create issues and comment on them and nothing else: it never edits, labels, closes or reopens one that already exists.

## The six columns

| Column | On GitHub | Means | Written by, in the fleet |
|---|---|---|---|
| To do | Open, no status label | Filed, not started | The human, the lead filing a proposal, or `fleet-steward` filing its own scheduled sweep |
| Next | `status:next` | The human's ordered queue: issues the fleet takes before anything else queued, oldest first. An issue here is the human's order to build it | The human only. The lead may suggest an issue for Next and never labels one |
| In Progress | `status:in-progress` | An agent has picked it up | `SubagentStart` hook |
| Blocked | `status:blocked` | Waiting on something that is not the human - a build, an API, another issue, or a failing suite | `TaskCompleted`, when tests fail, a strict gate has no result, or the card is not finished |
| Blocked by human | `status:blocked-by-human` | Waiting on an answer from the human. The human queue | `SubagentStop`, on a `Blocker:` line in the handoff |
| Done | Closed | The pull request that closes it merged | GitHub, on the merge of a pull request whose body says `Closes #N` |

A hook that labels an issue removes every other status label in the same edit, so an open issue carries at most one. If a person leaves two, the one nearer the human wins: blocked by human, blocked, in progress, next. A status label the repository lacks is created by the first hook that needs it, and `/init` creates all four. Next is ordered oldest first, by issue number: `gh issue list --label status:next --search "sort:created-asc"`. A start moves an issue from Next to In Progress like any other open issue that is not held for the human.

Blocked and blocked by human are separate columns because they need different responses. Blocked is something to wait out or work around. Blocked by human costs the human an interruption, and it is the only column they monitor: `gh issue list --label status:blocked-by-human`.

## Who writes the columns

Two environments share this board and they write it differently. Know which one you are in before you touch anything.

**In the fleet, status labels are written by hooks and never by an agent, and an issue is closed by a merge and never by an agent.** Three hooks cover the transitions in the table above, each calling `gh` against the repository its working directory is in. So do not add or remove a status label, do not close or reopen an issue, do not ask for either - the lead suggesting an issue for Next to the human is the one exception - and do not report that you did. The only thing you contribute is a correctly formatted handoff, because that is what the hook reads. Filing a new issue is a different act from writing a column: a new issue arrives in To do because that is where new issues start. Labelling one that already exists is the thing nobody but a hook does. Other labels - `priority:high`, `outcome/*`, a monorepo part - are fields, and the lead sets them.

**Ticks are body edits, never column writes.** Only the lead ticks an acceptance criterion or a Definition of Done item, and only on evidence - for a criterion, that it is proven on main - naming the evidence, such as the test, in a comment. A Definition of Done item that does not apply is ticked, with `not applicable: <reason>` in the ticking comment. No subagent, hook or handoff line ticks.

A comment ending in a `[Cut to fit an issue comment ...]` line names a file under `~/.local/state/coder-fleet/archives/<session-id>/` on the human's machine: that is the whole comment, written by the hook at the moment it cut it, and it is the only copy of the part the issue is missing.

**In Cowork there are no hooks, so the assistant layer writes the board by instruction.** The assistant labels issues itself, and the discipline the hooks provide has to come from three rules instead. First, label an issue in progress when you actually start it, in the turn it happens, never batched up at the end of a day, and let the merge close it. Second, the only thing that goes into blocked by human is something genuinely waiting on the human, with the reason as a comment on the issue. Third, never file an issue for a step you are about to take in the same turn - that is a task.

## The issue body

The body carries the human's words and three checklists, each a level-2 heading followed by GitHub task-list items. The hooks parse these headings, so spell them exactly, ignoring case:

```markdown
## Actions for human
- [ ] 1. Which auth provider should we use?

What the human asked for, in their words.

Spec: docs/specs/12.md

## Acceptance criteria
- [ ] The login page accepts a valid password and refuses an invalid one
- [ ] ...

## Definition of Done
- [ ] The project's gates pass on the branch
- [ ] ...
```

An item's number is its position in its section, from 1. `## Actions for human` exists only once something has asked the human a question, and is always first. The Definition of Done is the list under `Definition of Done` in the project's `AGENTS.md`, copied in unticked when the issue is filed; a project with none has no such section. Every issue the lead files has at least one acceptance criterion, because the card gate refuses one with none.

To tick, edit the body: read it with `gh issue view <n> --json body -q .body`, change `- [ ]` to `- [x]` on that one line, write it back with `gh issue edit <n> --body-file <file>`, and comment the evidence with `gh issue comment <n>`. Change nothing else in the body: add comments rather than rewriting the description, because the history of an issue is how a blocked one is understood a week later.

## Telling the hooks which issue

Hooks write the columns, but nothing tells a hook which issue a subagent is working on.

**The binding is the checkout's focus.** `SubagentStart` receives the agent's identity and nothing else - no spawn prompt under any name - so a line in the prompt cannot reach it. What it reads is one line in `<git common dir>/coder-fleet/focus`, the main checkout's `.git`, shared by its linked worktrees and never committed. The lead writes it with the plugin's script, and the human with `/work`:

```
"${CLAUDE_PLUGIN_ROOT}/scripts/focus.sh" '#12'
```

It takes `#12`, `12` or the issue's URL, checks the issue with `gh` and prints `#12 <title>`, refusing one that does not exist or is closed; `--show` prints the focus and `--clear` forgets it. Run it when you start work on an issue, before the first spawn. Every direct spawn in that checkout then belongs to that issue until the focus changes. A resume with SendMessage stays on the issue the agent first started on, whatever the focus says now, so there is no need to refocus before resuming. A workflow run belongs to the issue its earliest-started agent was bound to - the focus when you launched it, in practice - or to nothing if that agent bound nothing, so you can refocus while it runs: `SubagentStop` identifies the run from the lane's transcript path, and every comment and Blocker of the run lands on the run's issue. One thing still follows the focus: a lane that starts after a refocus binds provisionally at its start and may label the newly focused issue In Progress, because a start cannot tell a workflow lane from a direct spawn. A start, first or resumed, labels its issue In Progress unless it is closed, or Blocked by human with an action still open (below). A focus that names a closed issue is taken as stale and binds nothing, so that agent's stop comments nowhere; an `Issue:` line or the launch variable naming a closed issue still binds it, and its stop still comments there. Every new, cleared or resumed session starts unfocused, because a `SessionStart` hook clears the focus an earlier session left, so focus the issue before the session's first spawn on it. Work on an unrelated issue focuses that issue first, and an unfocused checkout binds a new spawn to nothing and moves nothing - which is correct, because most spawns are not board work. `CODER_FLEET_BOARD_PAGE_ID` at launch still works and is read last; nothing asks anyone to set it.

**Completion is a separate question.** The binding says which issue is in flight. The merge says it is done: the pull request's body carries `Closes #12`, one line per issue it finishes, and GitHub closes each on merge. A pull request for one sub-issue closes that sub-issue, never its parent. `TaskCompleted` checks the last step: only a task whose subject carries `[issue:#12]` is held to that issue's card gate, and that marker goes on the one task that represents completing the whole issue, after its pull request has merged. The gate refuses, labelling the issue Blocked, until the issue has at least one acceptance criterion and every criterion and Definition of Done item is ticked. An ordinary execution task carries no marker however much it contributed.

**The route through the gate needs the task tools.** Claude Code offers `TaskCreate` and `TaskUpdate` only to a fixed list of older models unless `CLAUDE_CODE_ENABLE_TODO_TOOLS` is set, and the lead runs on a newer one, so the fleet sets it in the project settings `/init` writes, and `/kickoff` checks it. If the tools are still missing, say so; the merge still closes the issue, but nothing checked its card.

**An unconfigured gate is not a green one.** `TaskCompleted` runs `CODER_FLEET_TEST_COMMAND`, else reads a fresh `.claude/test-status` marker; with neither, the default lenient gate lets the task complete and only logs that the gate was not configured. Set a command, and `CODER_FLEET_TEST_GATE=strict`, in the project's `.claude/settings.json` `env` where the gate is the point.

**The `Issue:` line is still worth writing, as context for the agent.** It tells the agent which issue it is working against so it can read it with `gh issue view`; it is not a hook transport. Do not describe it as one.

```
Issue: #12
```

If a future runtime does send the spawn prompt to `SubagentStart`, the hook already reads it, and this is the format it accepts, as `hooks/lib/board.sh` parses it:

- The first matching line wins. Later ones are ignored, so one line per spawn.
- The label is case-insensitive and may be indented, and a leading `- ` is tolerated so the line survives being written as a list item. Nothing else may precede it on the line.
- The value is the first whitespace-separated token after the colon: `#12`, `12`, or the issue's URL. Anything after it on that line is discarded, so do not append a title or a note.
- A value in none of those shapes is not a ref. The line is then treated as absent, silently.

If you are the agent receiving the line, use it to read the issue you are working against; never treat it as permission to label it. Columns belong to the hooks.

**Which spawns carry it.** Any spawn doing board-tracked work: a `coder` on an issue or sub-issue, a `reviewer` on that diff, a `spec-writer` interviewing against a filed issue, a `ui-designer`, `tech-writer` or `researcher` commissioned against one. The test is whether the result belongs on an issue.

**Which legitimately do not.** A `scout` sent to find where something lives, or any agent spawned to answer a question inside the conversation, is not board work and gets no line. Neither is an exploratory spawn, a second opinion, or anything you would otherwise have done yourself in the main session.

**What happens when the focus is absent.** `SubagentStart` logs that no issue was resolved, moves nothing, and exits 0. For a scout that is the correct outcome and the end of it. For real work it is a silent failure with a long tail: the issue sits in To do while the work happens, and `SubagentStop` finds no binding, so a `Blocker:` line never reaches blocked by human. No error is raised anywhere. The only evidence is a `no board item` line in `~/.local/state/coder-fleet/log/hooks.log`.

**When gh cannot reach GitHub.** The hooks need `gh` installed and signed in (`gh auth status`) on the machine the session runs on. Without it every hook logs why and moves nothing, and the session carries on. A Claude Code on the web session has `gh` only where its environment provides it and a token; where it does not, say so in the handoff as an Unverified line, and never report a column as moved.

## Decisions needed and the human queue

Every handoff ends with a Decisions needed heading carrying typed lines, and only one of the three types touches the board.

`Blocker:` labels the issue blocked by human and the blocker text lands as a comment on it, so the queue answers what is blocked, on what, and for how long, without anyone opening a transcript. Each `Blocker:` line also becomes one numbered action in the issue's `## Actions for human` section, the first thing in the body, so the human sees the ask before anything else. `Propose item:` becomes a new issue in to do, filed by the lead - or by `fleet-steward` for its own scheduled sweep, per What earns an issue above.

**Actions for human.** The section is a numbered task list at the top of the body, `- [ ] 1. <ask>`, and it has two writers. `SubagentStop` appends one action per `Blocker:` line, the ask alone, after the label move, making the section when there is none. The lead adds one by editing the body the same way when it needs the human's decision outside a subagent handoff; adding labels nothing, so a lead-added action on an issue outside the queue is not in the queue, and the lead asks in the session as well. An ask that does not end in `?` is written with the prefix `[not a question] `, whichever writer added it, so a likely false blocker shows at once. A second `Blocker:` handoff appends, numbered after the rest, and ticks stay. When the human answers an action in the session, the lead ticks it and, in the same turn, comments with the number and the answer; the human can tick it on GitHub. While any action is unticked, an issue in blocked by human stays there: `SubagentStart` moves nothing, on a first start or a resume, and logs `waiting on the human: <n> open action(s) on #<n>`, so a scout sent while the human is still reading does not take it out of the queue. Once every action is ticked, the next start labels it In Progress. Ticked actions stay in the body as the record. The lead may strike an action it knows is void, such as a mis-bound or mislabelled blocker, by ticking it with `void: <reason>` in the comment.

A false blocker is not free. The queue is what the human reads, and anything sitting in it costs them an interruption. Park a routine suggestion there and you have interrupted them for nothing; miss a real one and they never learn they were needed.

## Done, and the outcome

There is no success column. Done means the pull request that closes the issue merged, and nothing more. Whether the work was any good is recorded once the answer is known - usually later and often by the human - as an outcome label: `outcome/shipped`, `outcome/abandoned` or `outcome/superseded`. A label is queryable where a comment is not.

So an issue that turns out to have been the wrong idea is closed as not planned with `outcome/abandoned`, not left open. Replacement work is a new issue, and the old one is `outcome/superseded`. Never delete an issue - close it.

## Issue conventions

Title the issue as the change, in the imperative, in the glossary's words - "Rotate refresh tokens on reuse", not "refresh token stuff" and not "Investigate the auth epic". One issue, one outcome. If an issue needs two answers to close, it is two issues or a parent with sub-issues.

Link `docs/specs/<n>.md` in the body rather than pasting the spec into it: the repo is the source of truth for the spec, and a copy on the issue goes stale silently. Its acceptance criteria are the exception and go in the body, because the issue is what a coder builds from and what the human reads. Where the issue and the spec disagree on wording, the spec wins.

A branch for an issue is named for its number and a few words of its title, lowercase and hyphenated (`12-rotate-refresh-tokens`). Every commit subject ends with the number in brackets (`Rotate refresh tokens on reuse (#12)`), never starts with it, because a line starting `#` is a comment to git's editor. Its pull request's body carries `Closes #12`.

Priority is a label: `priority:high` on an issue the human has asked for twice. Absent means normal.

## The gh commands

Every read and write goes through `gh` against the repository the working directory is in; `GH_REPO=<owner>/<repo>` overrides that. The ones the fleet uses:

| Job | Command |
|---|---|
| Read an issue | `gh issue view <n> --json number,title,state,labels,body,comments` |
| List a column | `gh issue list --label status:next --search "sort:created-asc"`, `--label status:blocked-by-human`, `--state open` with no status label for To do |
| Search | `gh issue list --state all --search "<words>"` |
| File an issue | `gh issue create --title "<title>" --body-file <file>` |
| File a sub-issue | `gh issue create`, then `gh api repos/{owner}/{repo}/issues/<parent>/sub_issues -F sub_issue_id=<id>`, where `<id>` is the new issue's `id` from `gh api repos/{owner}/{repo}/issues/<n> -q .id` |
| Comment | `gh issue comment <n> --body-file <file>` |
| Edit the body (ticks, actions) | `gh issue edit <n> --body-file <file>` |
| Set a field label | `gh issue edit <n> --add-label priority:high` |
| Focus | `"${CLAUDE_PLUGIN_ROOT}/scripts/focus.sh" <n>`, `--show`, `--clear` |

Write bodies and comments to a file and pass `--body-file`, never `--body` with the text inline: a body holds backticks, quotes and dollar signs a shell would eat. When `gh` is missing or signed out, say so in the first line of your reply or handoff, name the fix (`gh auth login`), and carry on without the board; never decide the board is empty because a call failed.
