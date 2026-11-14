# boards

The fleet's board: markdown cards kept under the home directory, one board per repo. This package is built in stages; what is here so far is its storage, board keying, card ids, locks and atomic writes, the event trail, the eight columns and their rules, focus binding, the hook-owned moves, a card's checklists, Actions for Human, sub-issues and dependencies, and the two gates: the card gate into Done and the test gate into Released. It is not wired into the plugin's hooks yet. It needs Bun and nothing else: no packages to install.

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

A card carries two checklists, its acceptance criteria and its Definition of Done (`src/checklists.ts`). Each shows the card's own items first, as the card file lists them in `criteria` and `dod`, each a list of `{ text, ticked }`, then the board's defaults for that list. One number counts the whole list from 0, so a card's own item n is item n of its list in the card file, and the first default comes after the card's last own item. Every numbered list on a card, Actions for Human included, counts from 0 in the card file, the CLI and every later interface, and tick and remove take that number. `checklist(board, card, list)` returns a list as it shows; `addItem`, `tickItem` and `removeItem` change it. Ticking never moves a column.

The defaults are set by hand in `config.yml`, read each time a list is shown, so a change shows on every card at once with no edit to any card file:

```yaml
defaults:
  criteria:
    - The docs say what changed
  dod:
    - The suite passes
```

A default item is never copied onto a card. Its tick is kept on the card by its text, in `defaultsTicked` (`{ criteria: [...], dod: [...] }`), so a default whose text is edited, or a new one, shows unticked on every card. A default item cannot be removed from one card; it changes in `config.yml`. A defaults change moves no card, so a card in Done or Released stays there.

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

A release names its cards on one line of its annotated tag's message, `Cards: XY-1, XY-2`. Only the ids on it that match this board's id pattern are read; anything else on the line is dropped before it reaches the trail or a session's context. A lightweight tag, or a tag with no such line or no id on it, moves nothing. `releaseCatchUp` in `src/releases.ts` runs after every successful Bash call that runs `git push` in a session, and at every session start but a compaction. It looks for annotated tags in the repo with a `Cards:` line that no release has claimed yet, and only when it finds one asks origin which tags it holds, with `git ls-remote --tags origin`, so a start with nothing to release never reaches the network. Each such tag that origin holds is claimed once, by its tag object, under the board-wide `locks/releases.lock`, so a push in a session and a session start never claim the same tag twice. A tag the repo does not hold locally, one made on another machine and never fetched, is not seen until it is fetched. At session start a tag also needs its commit on the local base branch (the branch origin's HEAD names, else `main`, else `master`): otherwise its gate does not start, the session is told so, and the tag stays unclaimed until a later start finds the commit there, so a tag fetched from the remote never makes the board run code nobody pulled. A push in the session tags the session's own commit, often a release branch's head before it merges, so the post-push hook skips this check. Without a test command, a release whose cards could move is not claimed, and the hook says to set one; the next session start tries again.

Then, for the release's named cards:

- When none is in Done or Blocked, nothing runs and nothing moves, and the result names each card and its column.
- When a green run is recorded in the trail for the tagged commit, the cards move at once.
- Otherwise the test command runs in the background against the tagged commit and the cards move when it finishes. The hook returns at once, so the push and the session's turn never wait for the suite.

On a pass, each named card in Done moves to Released, and each in Blocked goes back to the column it was blocked from, through the card gate, then on to Released if that is Done. On a failure, each named card in Done moves to Blocked, with a comment carrying the run's output, its last 200 lines. A named card in any other column, or not on the board, stays where it is, and the release's result says so: in the hook's line in the session's context and in the `stayed` field of `release-finished`.

The background run, `src/test-runner.ts`, is started detached, in its own session, so it outlives the hook and the session that started it. It cuts a temporary worktree at the tagged commit in the user's private state directory, `<state directory>/runs/<PREFIX>-<run>` (Focus binding below names the state directory: 0700, refused when it is a symlink or another user's), never in a shared temporary directory another user could create first, and never in the repo or its `.claude/worktrees`, runs the test command there with `sh -c`, and removes the worktree when it finishes, pass or fail. Its git commands and the test command never see a `GIT_DIR` or other repository variable the hook inherited. Its output goes to `test-runs/<run>.log` beside the board, which stays after the run and the session end; `runs` and `run-log <run>` in the CLI read it while it runs and after. It records its result in the trail, then applies it to the cards, holding each card's lock for each write.

A run whose process has gone without a result, killed or lost to a reboot, is started again at the next session start: `restartVanishedRuns` finds a release still waiting on its run whose last recorded pid no longer runs, and starts a new process for the same run, which appends to the same log. A run that recorded its result but stopped before moving the cards only applies the result.

Every release and run is in the trail:

| Event | Carries |
|---|---|
| `release-started` | `release` (its id), `tag`, `tagObject`, `commit`, `gitDir`, `cards`, and `run`, the run it waits on: its own id, or a recorded green run's; absent when nothing could move |
| `test-run-started` | `run`, `commit`, `pid`, `log`, and `restart` when it is a restart |
| `test-run` | `run`, `commit`, `result` (`passed` or `failed`) and `exit` |
| `release-finished` | `release`, `tag`, `commit`, `result` (`passed`, `failed` or `nothing to move`), `released`, `blocked`, `returned` and `stayed`, each card that stayed with why |

### Comments

A card's `comments` field is a list of `{ time, by, text }`, oldest first (`src/comments.ts`). The test gate adds one when a run fails; the MCP tools and the web UI add theirs later.

## The hook events

`src/hook-moves.ts` holds what each hook does; `src/hooks/` holds one entry point per event, each reading Claude Code's hook JSON on stdin. None is registered yet, none blocks anything, and none prints anything but SessionStart's and the post-push hook's context. `test/hooks.test.ts`, `test/gates.test.ts` and `test/releases.test.ts` drive each row through its entry point and check the column.

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
| PostToolUse on Bash running `git push`, a new release tag on origin, or SessionStart but compact finding one | `post-push.ts`, `session-start.ts` | Done, a green run recorded for the tagged commit | Released at once |
| the same, with no green run recorded | `post-push.ts`, `session-start.ts` | Done | stays until the background run finishes |
| the release's background run passes | `test-runner.ts` | Done | Released |
| the release's background run passes | `test-runner.ts` | Blocked | the column it was blocked from, then Released if that is Done |
| the release's background run fails | `test-runner.ts` | Done | Blocked, with the run's output as a comment |
| any of the release rows above | | any other column, or not on the board | stays, and the release's result says so |
| SessionStart but compact, a release's run gone without a result | `session-start.ts` | any | stays; the run starts again |

## CLI

Run as `bun '<this directory>/src/cli.ts' <command>` from inside the repo, with this package's absolute path in single quotes. That is also the command the no-board message names, with the path filled in and quoted so it pastes even from a path with a space; the compiled binary replaces it when the board ships as one.

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
| `remove <list> <ID> <n>` | removes the card's own item n of `criteria` or `dod`, counted from 0 |
| `depend <ID> <on>` | records that the card depends on card `<on>` |
| `undepend <ID> <on>` | drops that dependency |
| `runs` | prints each release test run: its id, tag, commit, state (`running`, `passed`, `failed` or `stopped`) and log |
| `run-log <run>` | prints a test run's log, while it runs or after |

The MCP tools over the same functions are group G's (CF-207 criterion 49) and the web UI is group H's; neither exists yet.

Without a board, every command but `init` fails with a message telling an agent to ask the human to create one; `where` prints the repo's key first.

## For hooks

`boardForHook({ cwd, sessionId })` in `src/hook-board.ts` is where every board hook starts. It returns the board, or no board and a message the first time in a session and none after, so a hook in a repo without a board, or in a session with no `~/.config/boards` at all, does nothing and says so once.

`src/hooks/session-start.ts` is the SessionStart hook, not registered yet. It clears the checkout's focus as the table above says, and in a repo with a board it adds two reminders to the agent's context: check the board first, and reconcile it before stopping. SessionStart fires again after every compaction, so both come back. On every start but a compaction it also runs the test gate's catch-up, as The gates says, and adds a line per release it started or restarted. There is no Stop hook on purpose: anything a Stop hook says to the agent continues the turn, and the reconcile reminder must never hold up a stop.

## Tests

`bun test` in this directory. Every test runs in a temporary `XDG_CONFIG_HOME`, `HOME` and `TMPDIR` with throwaway git repos; the release tests also set `XDG_STATE_HOME` and push to a throwaway bare remote.
