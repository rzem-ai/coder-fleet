---
name: help-boards
description: How the board works - its projects and issues, the meaning of the six columns (to do, next, in progress, blocked, blocked by human, done), which columns are written by hooks and which a human-facing assistant writes itself, the checkout's focus (`task_focus`, `/work`) that tells the hooks which issue the work is on, how the handoff's Decisions needed lines reach the human queue, and what earns a board item at all.
when_to_use: Read before filing, reading, moving, commenting on or closing any board item or project, before spawning a subagent against an item, before reporting board status to the human, and whenever you are deciding whether a piece of work is board work or just a task inside the session.
---

# The board

The board is this repository's: a directory of markdown files, one per item, at `.boards/tasks/` in the main checkout, committed like any other project file, and the board is those files grouped by status. It is written through the plugin's own `board` binary and never by hand, and the binary commits every write it makes. There is no global board; each repository has its own. Nothing sits between the board and Claude Code's native task list.

**Projects** - a project is the repository. The `project` field on an item is optional and exists for a monorepo that wants to say which part; there is no list to be on.

**Issues** - one issue per tracked unit of work, in a project, with milestones on the project where there is a real date, and sub-items as a parent task, `BD-12.1` under `BD-12`. The board is the six-column view over these issues. One repository, one board: what you see is this project's state and nothing else's.

## What earns an item

An issue in the glossary sense earns a task file on the board. That is the unit of work the human cares about, and it either has a spec or is trivial enough not to need one. A sub-issue earns an issue too and stays under its parent.

A Task in the glossary sense never appears on the board. Tasks are the execution layer inside a session, cheap and many, created with `TaskCreate` and dead when the session ends. One issue may spawn twenty of them and the board does not move. Sessions, phases, rounds, handoffs and reviews are not items either. If you are filing something to remember it for the next ten minutes, it is a task, not an item.

The lead files work that surfaces mid-run. An agent that spots adjacent work while doing a task does not file it itself: the work leaves the run as a `Propose item:` line under Decisions needed, and the lead files it when it merges the handoffs. A Low review finding never earns an item: it is fixed in a fix round that runs anyway or dropped.

`fleet-steward` is the named exception, and the only one. Its sweep is scheduled and unattended rather than mid-run, and there is no lead in the loop to file for it, so proposing would mean a weekly run produced nothing at all until the human next started a session. It files what the sweep found itself, as items on the coder-fleet repository's board. That is a licence to create issues and comment on them and nothing else: it still never edits a field, moves an issue or writes a state on one that already exists.

## The six columns

| Column | Means | Written by, in the fleet |
|---|---|---|
| To do | Filed, not started | The human, the lead filing a proposal, or `fleet-steward` filing its own scheduled sweep |
| Next | The human's ordered queue: cards the fleet takes before anything else queued, top of the column first by ordinal. A card here is the human's order to build it | The human only. The lead may suggest a card for Next and never moves one |
| In Progress | An agent has picked it up | `SubagentStart` hook |
| Blocked | Waiting on something that is not the human - a build, an API, another item, or a failing suite | `TaskCompleted`, when tests fail or a strict gate has no result |
| Blocked by human | Waiting on an answer from the human. The human queue | `SubagentStop`, on a `Blocker:` line in the handoff |
| Done | The run finished and its tests passed | `TaskCompleted` hook |

The columns are the `statuses` list in `.boards/config.yml`, spelled exactly as the table has them, and the hooks match them ignoring case. A board not yet renamed still lists `Doing` in place of In Progress; the hooks accept it and write `Doing` there, and `/kickoff` offers the rename. A board made before Next lacks it; nothing in the fleet needs the column to work, and `/kickoff` and `/init` offer to add it after To Do. A start moves a card from Next to In Progress like any other card that is neither Done nor held for the human. `board.env` overrides are for any other spelling, and nothing should need one: the installer only warns about an old `board.env` and never writes one. A session-start hook names any override the config does not list, and a move the board refuses is noted on the card once per session.

Blocked and blocked by human are separate columns because they need different responses. Blocked is something to wait out or work around. Blocked by human costs the human an interruption, and it is the only column they monitor.

## Who writes the columns

Two environments share this board and they write it differently. Know which one you are in before you touch anything.

**In the fleet, columns are written by hooks and never by an agent.** The one exception is the rename from Doing to In Progress that `/kickoff` and `/init` offer on a board not yet renamed, which moves items only with the human's yes. Adding the Next column, which they also offer, edits the config on the human's yes and moves no item. Three hooks cover every transition in the table above, each calling the `board` binary against this repository's `.boards/`. So do not move an item, do not ask for one to be moved - the lead suggesting a card for Next to the human is the one exception - and do not report that you moved one. The only thing you contribute is a correctly formatted handoff, because that is what the hook reads. An agent body or a run that tries to update a state is wrong even when the state it wants is correct. Filing a new issue is a different act from writing a column: a new item arrives in to do because that is where new items start. Moving one that already exists is the thing nobody but a hook does.

**Ticks are field edits, never column writes.** Only the lead ticks an acceptance criterion or a Definition of Done item, and only on evidence - for a criterion, that it is proven on main - naming the evidence, such as the test, in a comment. A Definition of Done item that does not apply is ticked, with `not applicable: <reason>` in the ticking comment. No subagent, hook or handoff line ticks.

A comment ending in a `[Cut to fit a board comment ...]` line names a file under `~/.local/state/coder-fleet/archives/<session-id>/` on the human's machine: that is the whole comment, written by the hook at the moment it cut it, and it is the only copy of the part the card is missing.

**In Cowork there are no hooks, so the assistant layer writes the board by instruction.** The assistant moves items itself, and the discipline the hooks provide has to come from three rules instead. First, move an item to in progress when you actually start it and to done when it is finished and verified, in the turn it happens, never batched up at the end of a day. Second, the only thing that goes into blocked by human is something genuinely waiting on the human, with the reason as a comment on the issue. Third, never file an item for a step you are about to take in the same turn - that is a task.

## Telling the hooks which item

Hooks write the columns, but nothing tells a hook which issue a subagent is working on.

**The binding is the checkout's focus.** `SubagentStart` receives the agent's identity and nothing else - no spawn prompt under any name - so a line in the prompt cannot reach it. What it reads is `.boards/.focus` in the main checkout, one line, written by the `task_focus` tool or the human's `/work` command, and never an item the session bound before:

```
task_focus BD-12
```

Call it when you start work on an item, before the first spawn. Every direct spawn in that checkout then belongs to that item until the focus changes. A resume with SendMessage stays on the item the agent first started on, whatever the focus says now, so there is no need to refocus before resuming. A workflow run belongs to the item its earliest-started agent was bound to - the focus when you launched it, in practice - or to nothing if that agent bound nothing, so you can refocus while it runs: `SubagentStop` identifies the run from the lane's transcript path, and every comment and Blocker of the run lands on the run's item. One thing still follows the focus: a lane that starts after a refocus binds provisionally at its start and may move the newly focused card to In Progress, because a start cannot tell a workflow lane from a direct spawn. A start, first or resumed, moves its item to In Progress unless it is Done, or Blocked by human with an action still open (below); no start moves a Done item, whatever bound it, and its stop still comments there. Work on an unrelated item focuses that item first, and an unfocused checkout binds a new spawn to nothing and moves nothing - which is correct, because most spawns are not board work. `CODER_FLEET_BOARD_PAGE_ID` at launch still works and is read last; nothing asks anyone to set it.

**Completion is a separate question.** The binding says which item is in flight. It never says that a given task finished it, and `TaskCompleted` will not guess: only a task whose subject carries `[board:<issue>]` moves an issue to done, and that marker goes on the one task that represents completing the whole issue. An ordinary execution task carries no marker however much it contributed. A card that silently reads done is taken as finished work.

**The route to done needs the task tools.** Claude Code offers `TaskCreate` and `TaskUpdate` only to a fixed list of older models unless `CLAUDE_CODE_ENABLE_TODO_TOOLS` is set, and the lead runs on a newer one, so the fleet sets it in the project settings `/init` writes and in the user settings the installer merges, and `/kickoff` checks it. If the tools are still missing, nothing is moved to done by anyone but the human: name the merged item and ask the human to move it in the web UI. Moving it through the board's own `task_complete` or a status write would skip the test gate, and it is a column write the lead never makes.

**An unconfigured gate is not a green one.** `TaskCompleted` runs `CODER_FLEET_TEST_COMMAND`, else reads a fresh `.claude/test-status` marker; with neither, the default lenient gate moves the item to done and only logs that the gate was not configured. A done card on such a project says the task was completed, not that anything passed. Set a command, and `CODER_FLEET_TEST_GATE=strict`, in the project's `.claude/settings.json` `env` where the gate is the point.

**The `Board-Item:` line is still worth writing, as context for the agent.** It tells the agent which issue it is working against so it can fetch it; it is not a hook transport, and it never was. Do not describe it as one.

```
Board-Item: BD-12
```

If a future runtime does send the spawn prompt to `SubagentStart`, the hook already reads it, and this is the format it accepts, as `hooks/lib/board.sh` parses it:

- The first matching line wins. Later ones are ignored, so one line per spawn.
- The label is case-insensitive and may be indented, and a leading `- ` is tolerated so the line survives being written as a list item. Nothing else may precede it on the line.
- The value is the first whitespace-separated token after the colon. Anything after it on that line is discarded, so do not append a title or a note.
- The value may be an item identifier in any case (`bd-12` resolves as `BD-12`), a sub-task id (`BD-12.3`), or the task file's path as the CLI or the web UI hands it back.
- A value in none of those shapes is not a ref. The line is then treated as absent, silently.

If you are the agent receiving the line, use it to fetch the issue you are working against; never treat it as permission to move a state. Columns belong to the hooks.

**Which spawns carry it.** Any spawn doing board-tracked work: a `coder` on an item or sub-issue, a `reviewer` on that diff, a `spec-writer` interviewing against a filed item, a `ui-designer`, `tech-writer` or `researcher` commissioned against one. The test is whether the result belongs on an issue.

**Which legitimately do not.** A `scout` sent to find where something lives, or any agent spawned to answer a question inside the conversation, is not board work and gets no line. Neither is an exploratory spawn, a second opinion, or anything you would otherwise have done yourself in the main session. Most spawns are not items, per What earns an item above, and adding the line to a spawn that is not one drags a real issue into doing for work that is not it.

**What happens when it is absent.** `SubagentStart` logs that no board item was resolved, moves nothing, and exits 0. For a scout that is the correct outcome and the end of it. For real work it is a silent failure with a long tail: the issue sits in to do while the work happens, `SubagentStop` finds no binding so a failed run never reaches blocked and a `Blocker:` line never reaches blocked by human, and `TaskCompleted` moves an item only on a `[board:<issue>]` marker in the task title. No error is raised anywhere. The only evidence is a `no board item` line in `~/.local/state/coder-fleet/log/hooks.log`.

## Decisions needed and the human queue

Every handoff ends with a Decisions needed heading carrying typed lines, and only one of the three types touches the board.

`Blocker:` moves the item into blocked by human and the blocker text lands as a comment on the issue, so the queue answers what is blocked, on what, and for how long, without anyone opening a transcript. Each `Blocker:` line also becomes one numbered action in the card's Actions for Human section, the first thing on the card in every view, so the human sees the ask before anything else. `Propose item:` becomes a new issue in to do, filed by the lead - or by `fleet-steward` for its own scheduled sweep, per What earns an item above. `Propose memory:` never touches the board at all - it is corpus work for the researcher or the lead.

**Actions for Human.** The section is a numbered checklist at the top of the task file, `- [ ] #1 <ask>`, and it has two writers. `SubagentStop` adds one action per `Blocker:` line, the ask alone, through `task edit --action=<text>`, in a call of its own after the move. The lead adds one with `task_edit` `actionsAdd` when it needs the human's decision outside a subagent handoff; adding moves no column, so a lead-added action on a card outside the queue is not in the queue, and the lead asks in the session as well. The binary flags an ask that does not end in `?` with the prefix `[not a question] `, whichever writer added it, so a likely false blocker shows at once. A second `Blocker:` handoff appends, numbered after the rest, and ticks stay. When the human answers an action in the session, the lead ticks it with `actionsCheck` and, in the same call, comments with the number and the answer; the human can tick it in the web modal. A ticked action stays on the card, shown ticked. While any action is unticked, a card in blocked by human stays there: `SubagentStart` moves nothing, on a first start or a resume, and logs `waiting on the human: <n> open action(s) on <id>`, so a scout sent while the human is still reading does not archive the questions. Once every action is ticked, the next start moves the card as before.

The section clears in three ways, and every clear archives the actions, ticked or not, as one `@board` comment listing each number, its text and whether it was ticked. Any status change out of blocked by human clears it in the same write, whoever makes it: a hook, the CLI, MCP, or the human's drag or demote in the web UI. A move into done from any other column clears it too, so an action never rides into the completed folder. And the lead may clear it with `actionsClear` and a reason, moving no column, only for an action it knows is void, such as a mis-bound or mislabelled blocker. Ticking the last open action moves nothing; the human or a hook moves the card.

A false blocker is not free. The queue is read out to the human twice a day, and anything sitting in it for more than four hours during working hours escalates immediately. Park a routine suggestion there and you have interrupted them for nothing; miss a real one and they never learn they were needed.

## Done, and the outcome

There is no success column. Done means the run finished and its tests passed, and nothing more. Whether the work was any good is recorded once the answer is known - usually later and often by the human - as an outcome label on the issue: `outcome/shipped`, `outcome/abandoned` or `outcome/superseded`. A label is queryable where a comment is not.

So an item that turns out to have been the wrong idea is done with `outcome/abandoned`, not dragged back into to do. Replacement work is a new issue, and the old one is `outcome/superseded`. A second terminal column is exactly where items go to be stranded, which is why there is not one.

## Item conventions

Title the issue as the change, in the imperative, in the glossary's words - "Rotate refresh tokens on reuse", not "refresh token stuff" and not "Investigate the auth epic". One item, one outcome. If an issue needs two answers to close, it is two issues or a parent with sub-issues.

The project field on an issue is optional: it names a part of a monorepo when there is one, and is otherwise left unset, because the project is the repository. A label naming the repo (`coder-fleet`, `opencode-agents`) goes on the project, and on an issue only when the project spans repos. A milestone is set only when there is a real date or deliverable, not to express urgency.

Link `docs/specs/<issue>.md` on the issue rather than pasting the spec into it: the repo is the source of truth for the spec, and a copy on the issue goes stale silently. Its acceptance criteria are the exception and go on the card, because the card is what a coder builds from and what the human reads. Where the card and the spec disagree on wording, the spec wins.

Add comments, do not rewrite descriptions. The history of an issue is how a blocked item is understood a week later, and an edited description destroys it. Never delete an issue - abandon it. Implementation Notes is the human's field: no agent writes it, and the lead's comments at each sub-issue start, when its PR is ready to merge, and at each merge to main are the progress record.

## Git

Every write the binary makes is a commit: `git add -- .boards` then `git commit -- .boards` in the main checkout, on whatever branch is checked out there, with an imperative, unprefixed subject such as `Move BD-12 to In Progress on the board` or `Create BD-12 on the board`, and who made the write in a `Board-Writer:` trailer (`Board-Writer: SubagentStart`), never in the subject. The pathspec keeps the human's own staged work out: everything outside `.boards` is left alone; anything inside it, staged or not, goes with the next board commit. Nothing pushes; the human's next push carries it. A commit that cannot be made - a locked index after three retries, a checkout mid-rebase, an ignored `.boards` - leaves the file write standing and logs `commit skipped`. Commits happen only when `auto_commit: true` is set in the config - an absent key means no commits - and `CODER_FLEET_BOARD_NO_COMMIT=1` turns them off for a shell.

A hook fired inside a coder's worktree resolves to the main checkout, so a feature branch never carries a board change unless a person put one there. Ids are allocated above the highest id in every branch the clone knows, so two contributors do not mint the same one; a clone that has not fetched cannot know, and that is the limit.

`git log -- .boards/tasks/BD-12*` is the history of an item: who moved it and when, which a comment trail can forget and a commit cannot.

## The CLI

Every write goes through the `board` binary, reached by the shim at `${CLAUDE_PLUGIN_ROOT}/board/board.sh`, against the main checkout of the repository containing the working directory (`CODER_FLEET_BOARD_ROOT` overrides that when set). This table exists rather than a pointer at the tool because nested `--help` fell through in the upstream tool the package was carried from, so "run `board task create --help`" was not an answer; the carried CLI does answer it, but a machine that has not built the binary still has to be able to read the flags here.

| Command | Flags |
|---|---|
| `board task create <title>` | `-d/--description text`, `-s/--status status`, `-a/--assignee names`, `-l/--labels labels`, `--priority p`, `--project name`, `--milestone m`, `-p/--parent id`, `--dep id`, `--ac text`, `--plan text`, `--notes text`, `--by <name>`, `--json`, `--plain` |
| `board task edit <id>` | `-t/--title text`, `-d/--description text`, `-s/--status status`, `-a/--assignee names`, `-l/--labels labels`, `--add-label l`, `--remove-label l`, `--priority p`, `--project name`, `--milestone m`, `--dep id`, `--ref text`, `--ac text`, `--check-ac n`, `--uncheck-ac n`, `--remove-ac n`, `--dod text`, `--plan text`, `--append-plan text`, `--notes text`, `--append-notes text`, `--comment text` (needs `--comment-author @name`), `--final-summary text`, `--action text` (`--action=text` for one starting with `-`), `--check-action n`, `--uncheck-action n`, `--clear-actions reason`, `--by <name>`, `--json`, `--plain` |
| `board task view <id>` | `--json`, `--plain` |
| `board task list` | `--status s`, `--project p`, `--assignee a`, `--labels l`, `--search q`, `--limit n`, `--json`, `--plain` |
| `board task search <query>` | `--type t`, `--limit n`, `--json`, `--plain` |
| `board focus [id]` | `--show`, `--clear` - this checkout's focused item |
| `board config show` | `--json` - the statuses and the Definition of Done defaults, as the board parses them |
| `board export` | none - the whole board as a markdown table on stdout |
| `board mcp` | none - the MCP server on stdio |
| `board serve` | `--port n`, `--host h` - random port on `127.0.0.1` unless overridden by the flag, `CODER_FLEET_BOARD_PORT`/`_HOST`, or `default_port` in the config; a busy port from any of them moves up until one binds, and the output says so |

`--dep`, `--ac`, `--check-ac`, `--uncheck-ac`, `--remove-ac`, `--dod`, `--ref`, `--add-label`, `--remove-label`, `--append-plan`, `--append-notes`, `--comment`, `--action`, `--check-action` and `--uncheck-action` repeat, as do `list --status` and `search --type`; `-a` and `-l` take a comma-separated list or repeat. `-s` on `create` and `edit` takes one status, not a list. `--json` returns a versioned document whose `kind` is `task-view`, `task-list`, `search` or `config`, and a comment's text is its `body` field. There is no `--cwd`: the board is found from the working directory through git, to the main checkout, never to a linked worktree's copy.

**When the tools are missing.** If `task_focus`, `task_view` and the rest are not among your tools, the board MCP server did not load in this session, and the plugin being enabled does not rule that out. Say so before doing anything else, and say why, checking in this order: the server is switched off for this project (`~/.claude.json` holds `disabledMcpServers` under `projects["<this project path>"]`; if it lists `plugin:coder-fleet:board`, the `/mcp` toggle turned it off, and `/mcp` turns it back on for the next session - this is the common case); the plugin is not enabled here (`claude plugin list` from the project shows no enabled `coder-fleet@rzem`); the binary is not built (`${CLAUDE_PLUGIN_ROOT}/board/board.sh --help` does not run). Then do the work through the CLI above: `board.sh focus <id>` writes the same `.boards/.focus` the tool does and the hooks read the file, not the tool, so the item moves just the same; `board.sh task view`, `list`, `search`, `create` and `edit` are the same operations the tools expose. An agent that reached the board this way says so in its handoff, as an Unverified line naming the cause, so the lead sees it and the human can fix it for the sessions that follow. Never fall back silently, and never decide the board is unavailable because a tool search came back empty - the CLI is always there.

**The web UI is per session, and optional.** The `/board` command calls the MCP server's `board_serve` tool, which starts the UI inside that session's own MCP process on a loopback port and returns the URL; `board_url` reports it without starting anything. The port follows the same precedence as `board serve` without a flag: `CODER_FLEET_BOARD_PORT`, then `default_port` in `.boards/config.yml`, then a random one. A busy configured port moves up one at a time until a port binds, and the result names the port bound and says the configured one was busy; with nothing free up to 65535 it fails naming the configured port, never falling back to a random one. `board_stop` stops it; otherwise it stops when the session's MCP server stops. Nothing about the board depends on it: the task tools and the hooks read and write the files directly. Never start `board serve` from Bash as a substitute for `/board` - a server outside the MCP process outlives the session.
