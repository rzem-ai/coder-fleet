# boards

The fleet's board: markdown cards kept under the home directory, one board per repo. This package is built in stages; what is here so far is its storage, board keying, card ids, locks and atomic writes, the event trail, the eight columns and their rules, focus binding, the hook-owned moves, a card's checklists, Actions for Human, sub-issues and dependencies, the two gates: the card gate into Done and the test gate into Released, the web UI, the MCP tools, the fleet's own rules and helper scripts, and the one compiled binary that carries them all. The board is not wired into the plugin's hooks yet; the fleet's tools are, through shims (The fleet's tools below). From source the board needs Bun and one locked package, the MCP SDK (`bun install --frozen-lockfile` here); the compiled binary needs nothing. The web UI's page, under `web/`, has its own packages, needed only to build it (The web UI below).

## Where a board lives

Every board is one directory under `$XDG_CONFIG_HOME/boards/` when `XDG_CONFIG_HOME` is set to an absolute path, else under `~/.config/boards/`. Nothing the board writes goes anywhere else, so `git status` in a repo and its worktrees never shows a board file.

A board's directory is named by its id prefix, which the human chooses when the board is made, so `~/.config/boards/FTH/` is the board whose cards are `FTH-1`, `FTH-2` and so on.

```
<boards root>/<PREFIX>/
  config.yml    the board's prefix and key, its project-wide checklist defaults and its test command
  ids.json      the highest number ever handed out, top level and per parent
  events.log    the append-only event log, one JSON object per line
  cards/        one <ID>.md per card: YAML frontmatter, then the markdown body
  specs/        one <issue>.md per spec
  runs/         run articles
  locks/        lock files
  test-runs/    one <run>.log per release test run
```

Agent memory is not here. It stays in each checkout's `.claude/agent-memory`, as Claude Code keeps it.

A card's frontmatter carries only the fields `CARD_FIELDS` in `src/cards.ts` names. A write that adds any other field to a card is refused; a field already on a card, written by hand, is kept by every write.

## Which board a checkout reaches

Each board records its key in `config.yml`. A repo with an `origin` remote is keyed by that remote's URL, normalised: host in lower case, no user, password or port, no trailing slash or `.git`, so `git@github.com:o/r.git`, `ssh://git@github.com/o/r` and `https://github.com/o/r` are one board. A host is keyed as written: an ssh alias from `~/.ssh/config` (`git@github-work:o/r.git`) is keyed `github-work/o/r`, so a clone made through an alias gets its own board, apart from the real host's. That cost is accepted; the board never runs ssh. Moving or re-cloning the repo reaches the same board; a fork, whose origin is its own URL, has a different key and needs its own board with its own prefix. A local-path or `file://` origin is keyed by that path.

A repo with no origin is keyed by the real path of its shared git directory (`git rev-parse --git-common-dir`), so its main checkout and every linked worktree share one board. That board stays the repo's for good: when the repo later gains an origin, it still resolves to its path-keyed board, and no config is ever rewritten. A checkout's board is the one under its URL key, else the one under its path key; if both somehow exist, the URL-keyed one wins.

Finding a checkout's board reads every `config.yml` under the boards root and picks the one whose key matches. There is no index to go stale. A directory counts as a board only when its config's prefix is the directory's own name.

## Prefixes and ids

A board's prefix is a letter, then up to nine letters or digits, asked of the human when the board is made, and kept in upper case. It is unique on the machine: creating a board with a prefix another board holds is refused, as is a second board for a repo that has one. It never changes once the board exists. Cards are `PREFIX-n` from 1; a sub-issue is its parent's id, a dot and a number (`XY-12.1`). `ids.json` keeps the highest number ever handed out, so a deleted card's number never comes back.

## Locks and atomic writes

Every writer of a card holds that card's lock, `locks/<ID>.lock`, and every new number is handed out under the board-wide `locks/ids.lock`. A lock file is created exclusively and holds its holder's pid, the time it was taken and, where known, the session or agent. A writer that finds a lock held waits 5 seconds, then fails with an error naming the card and the holder. A lock whose holder's process no longer runs, or which is older than 30 seconds, is broken and the writer proceeds. `src/lock.ts` has the numbers.

Cards and `ids.json` are written to a temporary file in the same directory, then renamed over the old file, so a reader sees the old file or the new one, never part of either. The card file is the source of truth: `updateCard` writes the card first and appends its event line after, so a crash between the two leaves the card changed and the log without that line.

## The event trail

`events.log` is one JSON object per line, appended with a single append-mode write and never rewritten, removed or rotated: it is kept forever. Every line has `time`, `event` and `source` (`hook`, `mcp`, `cli` or `web`); `actor` names the session or agent where known. The board logs `board-created`, `card-deleted`, `card-moved` and `move-skipped`, and the test gate's `release-started`, `test-run-started`, `test-run` and `release-finished` (The gates below). A move line carries `card`, `from` and `to`, and `gate` (`card` or `test`) when the move bypassed one. A `move-skipped` line is a hook's move that did not happen, an agent's start or the card gate: it carries `card`, the `column` the card stayed in, `to` and the `reason`.

`moveCard` in `src/moves.ts` writes every move, as the next section says. It writes the card first, with its new `column` and the move as `lastEvent`, the same object as the log line, then appends the line. The card file is the source of truth, so after a crash between the two the card is moved and the log lacks that line; otherwise a card's `lastEvent` is always the log's last move line for it.

`cardHistory(paths, id)` in `src/events.ts` returns a card's move lines, oldest first, and `history <ID>` prints them.

## Columns and moves

A board has eight columns, in this order: Draft, Backlog, Next, In Progress, Done, Released, Blocked, Blocked by Human (`src/columns.ts`). A card's column is the `column` field of its frontmatter, and every card is filed into Draft.

Every column change goes through one function, `moveCard(board, { card, to, source, actor? })` in `src/moves.ts`. Under the card's lock it reads the card's current column from the card itself, never from the caller, checks the move against the rules below, writes the card and appends the move to the trail, so the trail never names a column the card was not in. A column name outside the eight, or a move the rules refuse, throws `MoveRefused` with the reason and leaves the card and the log as they were. Any other write that would change a card's column is refused.

The rules, by `source`:

| Source | May move a card |
|---|---|
| any | out of Draft only into Backlog, and never out of Draft anywhere else |
| `mcp`, `cli` | from Draft to Backlog, and nothing else; filling Next is refused with "only the human fills Next, in the web UI" |
| `hook` | anywhere out of any column but Draft and Released, except: into Next only when returning a card to Next from Blocked or Blocked by Human that the trail shows was blocked from Next, out of Blocked by Human only once every Action for Human is ticked, into Done only with every checklist item ticked (the card gate), and into Released only from Done |
| `web` | anywhere out of any column but Draft, overriding the gates; a move into Done with any checklist item unticked logs `gate: card`, and every move into Released logs `gate: test` |

Adding an Action for Human moves the card into Blocked by Human whatever the source, except from Draft or Released, where the card keeps its action and stays. That is the one move the MCP tools make besides Draft to Backlog. Released is the final column: only the human, in the web UI, moves a card out of it.

`blockedFrom(board, id)` reads the column a card was in when it last went into Blocked or Blocked by Human from the trail, and `returnFromBlock(board, id, source)` moves it back there, or to Backlog when the trail has no such move. A card leaves Blocked when the human moves it in the web UI, or when a later release naming it passes (The gates below).

### Next

Next is the human's ordered queue. `orderNext(board, ids, "web")` sets its order, top first, naming every card in it once; any other source is refused. Each ordered card carries `rank`; any move drops it, so a card coming into Next joins the bottom until the human orders it. `nextQueue(board)` returns Next in order, and `takeNext(board)` returns the card an agent asking for work is given: the top of Next, else the first card in Backlog, else none, skipping any card with an unticked Action for Human.

### Actions for Human

A card's `actions` field is a list of `{ text, ticked }`, numbered from 0 by its place in the list. `addAction` in `src/actions.ts` adds an unticked one and moves the card to Blocked by Human; `tickAction` ticks one by its number and never moves a column. There is no remove: an action is cleared only by ticking it, so a card leaves Blocked by Human only once the human has ticked every action, at the next hook, or when the human moves it in the web UI.

## Checklists

A card carries two checklists, its acceptance criteria and its Definition of Done (`src/checklists.ts`). Each shows the card's own items first, as the card file lists them in `criteria` and `dod`, each a list of `{ text, ticked }`, then the board's defaults for that list. One number counts the whole list from 0, so a card's own item n is item n of its list in the card file, and the first default comes after the card's last own item. Every numbered list on a card, Actions for Human included, counts from 0 in the card file, the CLI and every later interface, and tick, untick, edit and remove take that number. `checklist(board, card, list)` returns a list as it shows; `addItem`, `tickItem`, `untickItem`, `editItem` and `removeItem` change it. An edit changes an own item's text and keeps its tick. Ticking, unticking and editing never move a column. Actions for Human only tick.

The defaults are set by hand in `config.yml`, read each time a list is shown, so a change shows on every card at once with no edit to any card file:

```yaml
defaults:
  criteria:
    - The docs say what changed
  dod:
    - The suite passes
```

A default item is never copied onto a card. Its tick is kept on the card by its text, in `defaultsTicked` (`{ criteria: [...], dod: [...] }`), so a default whose text is edited, or a new one, shows unticked on every card. Unticking a default drops its text from `defaultsTicked`. A default item cannot be removed from one card or have its text edited there; it changes in `config.yml`. A defaults change moves no card, so a card in Done or Released stays there.

## Sub-issues and dependencies

A sub-issue is filed under its parent and carries a dotted id and a `parent` field (Prefixes and ids above). A card's `dependencies` field lists the ids of cards on the same board that it depends on; `addDependency` and `removeDependency` in `src/dependencies.ts` change it, refusing a card that does not exist or the card itself. `dependenciesDone(board)` returns exactly the cards whose dependencies are all in Done or Released, a card with none included; a dependency on a deleted card never counts as finished.

## Focus binding

As the old board does it. Each checkout, the main one and each linked worktree, has one focus file naming the card its sessions are working on, kept in the user's private state directory, never in the repo or the board's directory (`src/focus.ts`). The lead sets it, or a `Board-Item: XY-12` line in a spawn prompt does. A new, cleared or resumed session clears it and a compaction keeps it. Every hook sets, reads and clears the focus of one checkout, `focusBase` in `src/focus.ts`: the session's own, `CLAUDE_PROJECT_DIR`, when it is set and is a git checkout, else the event's cwd, because a `cd` moves the cwd but not `CLAUDE_PROJECT_DIR`, and an agent spawned into its own worktree starts with that worktree as its cwd. When a subagent starts it is bound to that focus for its whole run; its later hooks reach the card by its agent id, and a resume keeps the card it started on. A focus naming a card in Done or Released is left over and binds nothing.

The state directory is `$XDG_STATE_HOME/coder-fleet-boards`, or `~/.local/state/coder-fleet-boards`, made 0700. One that is a symlink, belongs to another user or is writable by group or others is refused: the hooks keep no focus or binding, and SessionStart says so. Every file in it is written to a temporary file and renamed into place, and a focus or binding that is not a card id of at most 64 characters is read as none, so nothing else in the file reaches a hook's output. The hooks move only an agent's bound card, so a checkout focused on one card never moves another's, and a start in a checkout with no focus binds and moves nothing.

## The gates

Two gates: ticks in, tests out.

### The card gate, into Done

A card goes into Done only when every acceptance criterion and Definition of Done item on it is ticked, the board's live defaults included: `untickedItems` in `src/checklists.ts` reads both lists through `checklist()`, so an unticked default holds the card. The rule is in `moveCard`, so no route into Done gets past it but the human's web UI override, and a refusal names each unticked item by its list, its number from 0 and its text. A card with no items at all has nothing unticked and passes.

`cardGate` in `src/gates.ts` is what triggers it: the SubagentStop of a `coder` or `scripter` bound to the card (with or without the plugin's `coder-fleet:` prefix), and the TaskCompleted of a task whose subject carries `[board:<id>]`. No other agent's stop runs it. It moves a card into Done only from Backlog, Next or In Progress; a card anywhere else stays, and a card the gate holds stays where it is, each with a `move-skipped` line in the trail giving the reason. Neither hook blocks the stop or the task.

### The test gate, into Released

The project's test command is set by hand in the board's `config.yml`, never in the repo, and read each time a run starts:

```yaml
test: bash claude/evals/lib/check-all.sh
```

A release names its cards on one line of its annotated tag's message, `Cards: XY-1, XY-2`. Only the ids on it that match this board's id pattern are read; anything else on the line is dropped before it reaches the trail or a session's context. A tag's name is shown only when it is letters, digits, `.`, `_` and `-`, at most 64 characters; any other name is left out everywhere, and the tag is named `tag object <first 12 of its sha>` instead. A lightweight tag, or a tag with no such line or no id on it, moves nothing. `releaseCatchUp` in `src/releases.ts` runs after every successful Bash call that runs `git push` in a session, where it considers only the tags the command names among its refspecs (`git push origin v1.2.0`, `+v1.2.0`, `refs/tags/v1.2.0`, either side of `src:dst`, or `tag v1.2.0`; never the repository argument or the value of `-o`, `--push-option`, `--receive-pack`, `--repo` or `--exec`; a push naming no tag, `--tags` included, starts nothing), and at every session start but a compaction, where it considers every tag. It looks for annotated tags in the repo with a `Cards:` line that no release has claimed yet, and only when it finds one asks origin which tags it holds, with `git ls-remote --tags origin`, so a start with nothing to release never reaches the network. Each such tag that origin holds is claimed once, by its tag object, under the board-wide `locks/releases.lock`, so a push in a session and a session start never claim the same tag twice. A tag the repo does not hold locally, one made on another machine and never fetched, is not seen until it is fetched. At session start a tag also needs its commit on the local base branch (the branch origin's HEAD names, else `main`, else `master`): otherwise its gate does not start, the session is told so, and the tag stays unclaimed until a later start finds the commit there, so a tag fetched from the remote never makes the board run code nobody pulled. A tag a push in the session names is the session's own release, often a release branch's head before it merges, so the post-push hook skips this check; because it considers only the tags the push names, an unrelated push never starts a fetched tag the session start held back. Without a test command, a release whose cards could move is not claimed, and the hook says to set one; the next session start tries again.

Then, for the release's named cards:

- When none is in Done or Blocked, nothing runs and nothing moves, and the result names each card and its column.
- When a green run is recorded in the trail for the tagged commit, the cards move at once.
- Otherwise the test command runs in the background against the tagged commit and the cards move when it finishes. The hook returns at once, so the push and the session's turn never wait for the suite.

On a pass, each named card in Done moves to Released, and each in Blocked goes back to the column it was blocked from, through the card gate, then on to Released if that is Done. On a failure, each named card in Done moves to Blocked, with a comment carrying the run's output, its last 200 lines. When the run cannot start at all, because no test command is set when the runner starts or the tagged commit cannot be checked out in the temporary worktree, that is no test failure: the run is recorded as `not started` with the reason, every named card stays where it is, and the release's result gives the reason. Such a release gives its claim on the tag back, so a later session start tries the tag again. A named card in any other column, or not on the board, stays where it is, and the release's result says so: in the hook's line in the session's context and in the `stayed` field of `release-finished`.

The background run, the hidden `test-runner` subcommand (`src/test-runner.ts`), is started detached as this program again, the binary or Bun on `cli.ts` (`src/self.ts`), in its own session, so it outlives the hook and the session that started it. It cuts a temporary worktree at the tagged commit in the user's private state directory, `<state directory>/runs/<PREFIX>-<run>` (Focus binding below names the state directory: 0700, refused when it is a symlink or another user's), never in a shared temporary directory another user could create first, and never in the repo or its `.claude/worktrees`, runs the test command there with `sh -c`, and removes the worktree when it finishes, pass or fail. Its git commands and the test command never see a `GIT_DIR` or other repository variable the hook inherited. Its output goes to `test-runs/<run>.log` beside the board, which stays after the run and the session end; `runs` and `run-log <run>` in the CLI read it while it runs and after. It records its result in the trail, then applies it to the cards, holding each card's lock for each write.

A run whose process has gone without a result, killed or lost to a reboot, is started again at the next session start: `restartVanishedRuns` finds a release still waiting on its run whose last recorded pid no longer runs, and starts a new process for the same run, which appends to the same log. A run that recorded its result but stopped before moving the cards only applies the result.

Every release and run is in the trail:

| Event | Carries |
|---|---|
| `release-started` | `release` (its id), `tag`, `tagObject`, `commit`, `gitDir`, `cards`, and `run`, the run it waits on: its own id, or a recorded green run's; absent when nothing could move |
| `test-run-started` | `run`, `commit`, `pid`, `log`, and `restart` when it is a restart |
| `test-run` | `run`, `commit`, `result` (`passed` or `failed`, with `exit`; or `not started`, with `reason`) |
| `release-finished` | `release`, `tag`, `commit`, `result` (`passed`, `failed`, `not started`, with `reason`, or `nothing to move`), `released`, `blocked`, `returned` and `stayed`, each card that stayed with why |

### Comments

A card's `comments` field is a list of `{ time, by, text }`, oldest first (`src/comments.ts`). The test gate adds one when a run fails, the web UI adds the human's, by `human`, and the MCP tools add an agent's, by `agent`.

## The hook events

`src/hook-moves.ts` holds what each hook does; `src/hooks/` holds one entry point per event, each reading Claude Code's hook JSON on stdin. None is registered yet, none blocks anything but the Stop hook's one send-back (For hooks below), and none prints anything but SessionStart's and the post-push hook's context and that send-back. `test/hooks.test.ts`, `test/gates.test.ts` and `test/releases.test.ts` drive each row through its entry point and check the column.

| Event | Entry point | Card in | Card goes to |
|---|---|---|---|
| SessionStart, startup, clear or resume | `session-start.ts` | any | stays; the checkout's focus is cleared |
| SessionStart, compact | `session-start.ts` | any | stays; the focus is kept |
| PreToolUse on Agent, with a `Board-Item:` line | `pre-agent.ts` | any | stays; the spawning checkout is focused on that card |
| SubagentStart | `subagent-start.ts` | any, with an unticked Action for Human | stays; a `move-skipped` line says why |
| SubagentStart, the focus naming a card in Done or Released | `subagent-start.ts` | Done or Released | stays; the agent binds to no card, and a `move-skipped` line says why |
| SubagentStart | `subagent-start.ts` | Backlog or Next | In Progress |
| SubagentStart | `subagent-start.ts` | Blocked by Human, every action ticked | the column it was blocked from, then In Progress if that is Backlog or Next |
| SubagentStart | `subagent-start.ts` | Draft, In Progress, Done, Released or Blocked (a resumed agent's card) | stays; a `move-skipped` line says why |
| SubagentStop, with `Blocker:` lines under Decisions needed | `subagent-stop.ts` | any but Draft or Released | Blocked by Human, with an unticked action per Blocker line, all added before the one move |
| SubagentStop, with `Blocker:` lines under Decisions needed | `subagent-stop.ts` | Draft or Released | stays, with an unticked action per Blocker line |
| SubagentStop, with no `Blocker:` line, of any agent but a coder or scripter | `subagent-stop.ts` | any | stays; a `Propose item:` line never moves a card |
| SubagentStop of a coder or scripter, after any `Blocker:` lines | `subagent-stop.ts` | Backlog, Next or In Progress, every checklist item ticked | Done |
| SubagentStop of a coder or scripter | `subagent-stop.ts` | Backlog, Next or In Progress with an item unticked, or any other column but Done | stays; a `move-skipped` line names the unticked items or the column |
| TaskCompleted, the subject carrying `[board:<id>]` | `task-completed.ts` | Backlog, Next or In Progress, every checklist item ticked | Done |
| TaskCompleted, the subject carrying `[board:<id>]` | `task-completed.ts` | Backlog, Next or In Progress with an item unticked, or any other column but Done | stays; a `move-skipped` line names the unticked items or the column |
| PostToolUse on Bash running `git push` that names a new release tag now on origin, or SessionStart but compact finding one | `post-push.ts`, `session-start.ts` | Done, a green run recorded for the tagged commit | Released at once |
| the same, with no green run recorded | `post-push.ts`, `session-start.ts` | Done | stays until the background run finishes |
| the release's background run passes | `test-runner.ts` | Done | Released |
| the release's background run passes | `test-runner.ts` | Blocked | the column it was blocked from, then Released if that is Done |
| the release's background run fails | `test-runner.ts` | Done | Blocked, with the run's output as a comment |
| any of the release rows above | | any other column, or not on the board | stays, and the release's result says so |
| SessionStart but compact, a release's run gone without a result | `session-start.ts` | any | stays; the run starts again |

## CLI

Run the compiled binary as `boards <command>` from inside the repo (The binary below), or from source as `bun '<this directory>/src/cli.ts' <command>`, with this package's absolute path in single quotes. The no-board message names whichever of the two is running, by its quoted absolute path, so it pastes even from a path with a space.

| Command | What it does |
|---|---|
| `init` | creates this repo's board; asks for its id prefix |
| `where` | prints the repo's key and, when it has a board, its prefix and directory |
| `new <title> [--parent <ID>]` | files a card or a sub-issue and prints its id |
| `list [--ready]` | prints every card's id and title; with `--ready`, only the cards whose dependencies are all in Done or Released |
| `show <ID>` | prints a card: its column, parent, dependencies, its acceptance criteria and Definition of Done with the board's defaults, and its Actions for Human, each numbered from 0 |
| `move <ID> <column>` | moves a card; the CLI moves a card only from Draft to Backlog and says why it refuses anything else |
| `next` | prints the card to take: the top of Next, else the first card in Backlog |
| `delete <ID>` | deletes a card and logs the deletion |
| `history <ID>` | prints the card's column moves, oldest first: time, from and to, source, actor, and any gate bypassed |
| `add <list> <ID> <text>` | adds an item to `criteria`, `dod` or `actions`; an action moves the card to Blocked by Human |
| `tick <list> <ID> <n>` | ticks item n of `criteria`, `dod` or `actions`, counted from 0 |
| `untick <list> <ID> <n>` | unticks item n of `criteria` or `dod`, counted from 0 |
| `edit <list> <ID> <n> <text>` | changes the text of the card's own item n of `criteria` or `dod`, counted from 0 |
| `remove <list> <ID> <n>` | removes the card's own item n of `criteria` or `dod`, counted from 0 |
| `depend <ID> <on>` | records that the card depends on card `<on>` |
| `undepend <ID> <on>` | drops that dependency |
| `runs` | prints each release test run: its id, tag, commit, state (`running`, `passed`, `failed`, `not started` or `stopped`) and log |
| `run-log <run>` | prints a test run's log, while it runs or after |
| `web` | starts the board's web UI on this machine, or reuses the one running, and prints its address |
| `mcp` | serves the MCP tools over stdio, for Claude Code |

`COMMANDS` in `src/cli.ts` also lists three the usage leaves out. `fleet <tool> ...` runs the fleet's tools (The fleet's tools below). `test-runner <board directory> <release>` and `web-server <board directory> <holder pid>` are the board's own background processes, which it starts as this program again (`selfCommand` in `src/self.ts`): the compiled binary with the subcommand, or from source Bun on `cli.ts` with it, so both work from the binary, where no `.ts` file exists on disk. From source the child runs from this directory with `.env` loading off and is handed the caller's directory in `BOARDS_CALLER_CWD`, so a `bunfig.toml` or `.env` in the repository a hook runs in is never loaded; the binary is compiled with both autoloads off.

## MCP tools

Agents use the MCP tools for every card operation a session needs (CF-207 criterion 49). `boards mcp` serves them over stdio with the MCP SDK, against the board of the checkout the server starts in. They are `MCP_TOOLS` in `src/mcp.ts`, each a thin call into the functions above:

| Tool | Calls |
|---|---|
| `card_file` `{title, parent?, body?}` | `createCard`, into Draft |
| `card_read` `{id}` | `readCard`, `checklist`, `actionsOf`, `commentsOf`, `dependenciesOf` |
| `card_list` `{column?, parent?, ready?}` | `listCards`, filtered by column and parent; `ready` lists only `dependenciesDone` |
| `card_next` `{}` | `takeNext` |
| `card_edit` `{id, title?, body?}` | `editCard` |
| `card_to_backlog` `{id}` | `moveCard`, source `mcp`, to Backlog |
| `card_add` `{id, list, text}` | `addItem`, or `addAction` for `actions`, which moves the card to Blocked by Human |
| `card_tick` `{id, list, n}` | `tickItem` or `tickAction`, `n` counted from 0 |
| `card_untick` `{id, list, n}` | `untickItem`, criteria and Definition of Done only |
| `card_edit_item` `{id, list, n, text}` | `editItem` |
| `card_remove_item` `{id, list, n}` | `removeItem` |
| `card_comment` `{id, text}` | `addComment`, by `agent` |
| `card_depend`, `card_undepend` `{id, on}` | `addDependency`, `removeDependency` |
| `card_focus` `{id?}` | `setFocus` on the checkout `focusBase` names, or `clearFocus` with no id |
| `board_web` `{}` | `startWebUI`, held open by the Claude Code process that started the server |

A tool reads each argument it names and passes nothing else on, so a caller's extra fields never reach `createCard` or any other write. Every move a tool makes has source `mcp`, so the column rules allow only a move out of Draft into Backlog, and adding an Action for Human; filling Next stays the web UI's. A refused call answers as a tool error with the board's reason.

## The binary

`bun scripts/build.ts [<out dir>] [<platform>... | all]` builds the board into one file per platform, `<out dir>/boards-<platform>` (default `bin/`, kept out of git, and this machine's platform), for darwin-arm64, darwin-x64, linux-x64 and linux-arm64, any of them cross-compiled from any machine. It installs this package's and `web/`'s locked packages, builds the page into `web/dist`, then compiles `src/main.ts`, the binary's entry point, with every file of `web/dist` embedded, so an install serves the page with nothing beside it. `src/main.ts` hands the embedded page to `usePage` in `src/web.ts` and runs the CLI; from source the CLI starts at `cli.ts` and the page is read from `web/dist`.

`.github/workflows/boards-binaries.yml` builds all four on a pull request that touches this package, as a check, and on every `vX.Y.Z` tag, where it attaches them to that release gzipped, as `boards-<platform>.gz`, beside `boards-SHA256SUMS`. The suite builds only this machine's binary.

## The fleet's tools

`boards fleet <tool> ...` runs the fleet's own rules and helper scripts, which were bash and Python under the plugin's `hooks/lib/` and `scripts/` (CF-207 comments 29 to 34). They sit in `src/fleet/`, apart from the board's code, and `src/main.ts` dispatches `fleet` before it loads anything of the board, so a hook's call needs none of the board's packages.

| Tool | Source | Was |
|---|---|---|
| `config root`, `read`, `trunk`, `parse`, `roster`, `normalise`, `agent-disabled` | `config.ts` | `hooks/lib/fleet-config.sh` and `.py` |
| `trunk [dir]` | `config.ts` | `scripts/fleet-trunk.sh` |
| `remote-guard allowed-key`, `legacy-remote-files`, `url-kind`, `redact` | `remote-guard.ts` | `hooks/lib/remote-guard.sh` |
| `reviewer-modes <transcript> <agent id> <state dir>` | `reviewer-modes.ts` | `hooks/lib/reviewer-modes.sh` |
| `gates test-verdict`, `card-body` | `gates.ts` | `hooks/lib/gates.sh` |
| `challenge-gate run`, `check`, `close`, `lint` | `challenge-gate.ts` | `scripts/challenge-gate.py` |
| `agents ...` | `agents.ts` | `scripts/fleet-agents.sh` |
| `prune-worktrees [--dry-run]` | `prune-worktrees.ts` | `scripts/prune-worktrees.sh` |
| `exclude status`, `write`, `migrate` | `exclude.ts` | `scripts/fleet-exclude.py` |
| `editor-leftovers status`, `remove` | `editor-leftovers.ts` | `scripts/editor-leftovers.py` |
| `clock` | `clock.ts` | `hooks/agent-clock.sh` |
| `disabled-agents`, `disabled-agents --check [dir]` | `disabled-agents.ts` | `hooks/enforce-disabled-agents.sh` |

Each old file is now a shim that passes its arguments here, so every hook that sources it, every command that runs it and every contract test under `claude/evals/lib/` reaches the same code unchanged. The sourced ones keep their bash functions and variables and eval the `NAME='value'` lines the tool prints. `/init`, `/kickoff` and `lead-procedures` call the tools directly; `/coder-fleet:agents`, `/coder-fleet:prune-worktrees` and `lead.md` step 3 still name the scripts, which their contracts pin.

Every shim reaches the binary through `boards.sh` beside this file, which runs `bin/boards-<platform>` when it is built, else Bun on `src/main.ts`, and exits 127 otherwise. A hook runs with its cwd in whatever repository the human opened, so the source fallback runs Bun from this directory with `.env` loading off and hands it the caller's directory in `BOARDS_CALLER_CWD`, and the binary is compiled with both autoloads off: a `bunfig.toml` or `.env` there is never loaded. `boards.sh` also sets `CODER_FLEET_PLUGIN_ROOT`, from which the tools find the plugin's agents, rule templates and hook files.

When the binary will not run, every shim gives its refusing answer: no main checkout, a config that honours nothing, the phase harden, push base-only, release off and no trunk; no repository key allowed, legacy remote files taken as present and every URL unknown; a reviewer's brief unread; the test gate failed and the card unread; and every script exits 127 having changed nothing. A yes-or-no answer is printed as a word with exit 0, so a crash is never read as the permissive one.

`fleet config read` still parses the file as its own process, `python3 -I hooks/lib/fleet-config.py`, now a shim back onto `config parse`, so a python3 that is missing or cannot run reads as it did, which `disabled-agents-contract.sh` pins. `config parse` gives the same answers as `review-round.js`'s own copy of the reading (`asciiJson`, `phaseOf`, `fleetConfigFrom`), which `claude/evals/lib/workflow-logic.mjs` checks fixture by fixture.

## The web UI

`web` in the CLI calls `startWebUI(cwd, holder)` in `src/web.ts`, and the `board_web` MCP tool calls the same function. It serves the board on `127.0.0.1` only, on a free port, and prints `http://127.0.0.1:<port>/`. A board has one server: a second session's request finds it through its state file, `<state directory>/web/<PREFIX>.json` (Focus binding names the state directory), and gets the same address. The file names the server's pid, its port and its holders, each the pid of a process that lives as long as the session that asked: the CLI gives the Claude Code process it runs under (`CLAUDE_PID`), else the shell it was typed in, and the MCP tool gives the Claude Code process that started the MCP server. Once a second the server drops each holder whose process has ended, and it stops, removing the file, when none is left. The hidden `web-server` subcommand (`src/web-server.ts`) is that process, started detached as this program again.

The server trusts the local machine, as CF-207 criterion 20 says, and nothing more: it answers only a request whose `Host` names its own loopback address and port, so a page that rebinds a domain name to it is refused, and it takes a write only as JSON from its own origin, so another site's page cannot post a form to it.

Its API is a thin layer over the board's own functions, and every move it makes has source `web`: that is what lets the human fill and order Next and override the gates, which the MCP tools and the CLI are refused.

| Request | Calls |
|---|---|
| `GET /api/board` | `listCards`, `nextQueue` (Next in the human's order), `checklist`, `openActions`, `dependenciesDone` |
| `GET /api/cards/<ID>` | `readCard`, `checklist`, `actionsOf`, `commentsOf`, `cardHistory`, `testRuns` (the runs whose release named the card), `moveTargets` |
| `POST /api/cards` `{title}` | `createCard`, into Draft |
| `POST /api/cards/<ID>/edit` `{title?, body?}` | `editCard` |
| `POST /api/cards/<ID>/move` `{to, index?}` | `moveCard`, then `orderNext` when it lands at a place in Next |
| `POST /api/cards/<ID>/order` `{index}` | `orderNext`, for a card already in Next |
| `POST /api/cards/<ID>/add` `{list, text}` | `addItem`, or `addAction` for `actions`, which moves the card to Blocked by Human |
| `POST /api/cards/<ID>/tick` `{list, n}` | `tickItem` or `tickAction`, `n` counted from 0 |
| `POST /api/cards/<ID>/untick` `{list, n}` | `untickItem`, criteria and Definition of Done only |
| `POST /api/cards/<ID>/edititem` `{list, n, text}` | `editItem`, the card's own criteria and Definition of Done items only |
| `POST /api/cards/<ID>/remove` `{list, n}` | `removeItem`, the card's own criteria and Definition of Done items only |
| `POST /api/cards/<ID>/delete` `{}` | `deleteCard`, source `web`, so the event log keeps a `card-deleted` line |
| `POST /api/cards/<ID>/comment` `{text}` | `addComment`, by `human` |
| `GET /api/runs/<run>/log` | the run's log, `logPath` |

A refused move answers 409 with the column rules' reason. `moveTargets(board, id, source)` in `src/moves.ts` asks the same check `moveCard` makes of every column and moves nothing, so a dragged card's open and locked lanes, and the gate a drop would bypass, are the board's own rules.

The page is a separate package, `web/`, set up as the human's Fathom client is: Vue 3, Vite, shadcn-vue on reka-ui, Tailwind 4 and `@lucide/vue`, each pinned. Its look is the human's Ledger design: the laptop board (below 1100 pixels wide), the desktop board with its navigation rail, the ultrawide board (2000 and wider) with every column and the open card beside it, the card detail, dark mode following the system's setting, and the empty, dragging and loading states. The design's six columns become the board's eight, in the board's order. At every width a column can show as the narrow rail the design draws for Done: Draft, Done and Released start as rails, and so does any column with no card. Clicking a rail expands it, and an expanded column's header collapses it. The human's choice for a column wins over both defaults, so a column he expands stays expanded while empty, and it is kept in the page's `localStorage` (`web/src/folds.ts`), never on the board. Since the server takes a free port each time it starts, the choices last as long as its address does. A dragged card drops on a rail under the same column rules as on a lane. What the design draws and the board has no data for (milestones, documents, decisions, a card's type, priority and agent) is left out. A card's detail shows its move history from the trail beside its comments and test runs, and there is no board-wide feed. A ticked criterion or Definition of Done item unticks from its box, and a click on a card's own item edits its text in place. A card's detail deletes the card after a confirm step. The page asks for the board again every 5 seconds, so a hook's moves show.

The built page, `web/dist`, is kept out of git like `web/node_modules`, and the compiled binary carries its own copy (The binary above). From source, build it with `bun install --frozen-lockfile && bun run build` in `web/`; until then the server answers the page with those steps, and `web` says so. vue-tsc runs under Node, since it cannot hook TypeScript under Bun.

Without a board, every command but `init` fails with a message telling an agent to ask the human to create one; `where` prints the repo's key first.

## For hooks

`boardForHook({ cwd, sessionId })` in `src/hook-board.ts` is where every board hook starts. It returns the board, or no board and a message the first time in a session and none after, so a hook in a repo without a board, or in a session with no `~/.config/boards` at all, does nothing and says so once.

`src/hooks/session-start.ts` is the SessionStart hook, not registered yet. It clears the checkout's focus as the table above says, and in a repo with a board it adds two reminders to the agent's context: check the board first, and reconcile it before stopping. SessionStart fires again after every compaction, so both come back. On every start but a compaction it also runs the test gate's catch-up, as The gates says, and adds a line per release it started or restarted. The reconcile reminder is given there, not at a stop, because anything a Stop hook says to the agent continues the turn and the reminder must never hold up a stop.

`src/hooks/stop.ts` is the Stop hook, not registered yet; it goes under `Stop`, which takes no matcher. It is the one exception to that rule, overridden for it alone by the human (CF-4): when the main session stops with the checkout focused on a card that has an unticked acceptance criterion, it sends the lead back once with `decision: "block"` and a reason naming the card and each open criterion, telling it to finish them or reconcile the board as the SessionStart reminder says. It lets the stop through, printing nothing, when `stop_hook_active` is true, so one stop costs at most one extra turn; when there is no board or no focus; when every criterion is ticked; when the card has an unticked Action for Human or is in Blocked or Blocked by Human; when a line of the lead's last message ends in a question mark; and when `background_tasks` holds any task, a subagent or a background command. It reads the focus and the card through the same reader as SessionStart, `boardForHook`, `readFocus`, `readCard`, `checklist` and `openActions`, and writes nothing to the board. An error reading either lets the stop through and is logged on stderr. Set `sendBackAtStop: false` in the board's `config.yml` to switch it off for that board's repo; nothing sets it on or off for you.

## Tests

`bun install --frozen-lockfile`, then `bun test`, in this directory. Every test runs in a temporary `XDG_CONFIG_HOME`, `HOME` and `TMPDIR` with throwaway git repos; the release tests also set `XDG_STATE_HOME` and push to a throwaway bare remote, and so do the web UI's, which start real servers on loopback. The web UI's tests drive its API and need no built page. `test/binary.test.ts` compiles this machine's binary with a stand-in page and starts the CLI, the MCP tools, the web server and the test runner from it; `test/mcp.test.ts` drives every MCP tool.

`test/scope.test.ts` is the scope guard (CF-207 criterion 67). It reads the CLI's commands (`COMMANDS` in `src/cli.ts`, the only words the CLI runs), the web API's operations (`WEB_OPERATIONS` in `src/web.ts`, the only ones it takes) and the paths `src/web.ts` writes, the card fields (`CARD_FIELDS`) and the columns, and fails on any name with a part that is one of the spec's non-goals: milestone, document, attachment, link, claim, submit, oracle, import, export or backup. It reads the MCP tools' names from `MCP_TOOLS` in `src/mcp.ts` too.
