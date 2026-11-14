# boards

The fleet's board: markdown cards kept under the home directory, one board per repo. This package is built in stages; what is here so far is its storage, board keying, card ids, locks and atomic writes, the event trail, the eight columns and their rules, focus binding and the hook-owned moves. It is not wired into the plugin's hooks yet. It needs Bun and nothing else: no packages to install.

## Where a board lives

Every board is one directory under `$XDG_CONFIG_HOME/boards/` when `XDG_CONFIG_HOME` is set to an absolute path, else under `~/.config/boards/`. Nothing the board writes goes anywhere else, so `git status` in a repo and its worktrees never shows a board file.

A board's directory is named by its id prefix, which the human chooses when the board is made, so `~/.config/boards/FTH/` is the board whose cards are `FTH-1`, `FTH-2` and so on.

```
<boards root>/<PREFIX>/
  config.yml    the board's prefix and key, and later its project defaults
  ids.json      the highest number ever handed out, top level and per parent
  events.log    the append-only event log, one JSON object per line
  cards/        one <ID>.md per card: YAML frontmatter, then the markdown body
  specs/        one <issue>.md per spec
  runs/         run articles
  locks/        lock files
  test-runs/    test-run logs
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

`events.log` is one JSON object per line, appended with a single append-mode write and never rewritten, removed or rotated: it is kept forever. Every line has `time`, `event` and `source` (`hook`, `mcp`, `cli` or `web`); `actor` names the session or agent where known. The board logs `board-created`, `card-deleted`, `card-moved` and `move-skipped`. A move line carries `card`, `from` and `to`, and `gate` (`card` or `test`) when the move bypassed one. A `move-skipped` line is an agent's start that moved nothing: it carries `card`, the `column` the card stayed in, `to` and the `reason`.

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
| `hook` | anywhere out of any column but Draft, except: into Next only when returning a card to Next from Blocked or Blocked by Human that the trail shows was blocked from Next, and out of Blocked by Human only once every Action for Human is ticked |
| `web` | anywhere out of any column but Draft, overriding the gates; a move into Done logs `gate: card` and one into Released logs `gate: test` |

Adding an Action for Human moves the card into Blocked by Human whatever the source, except from Draft, where the card keeps its action and stays. That is the one move the MCP tools make besides Draft to Backlog.

`blockedFrom(board, id)` reads the column a card was in when it last went into Blocked or Blocked by Human from the trail, and `returnFromBlock(board, id, source)` moves it back there, or to Backlog when the trail has no such move. The card gate into Done and the test gate into Released, and what takes a card out of Blocked after a release, are group D's.

### Next

Next is the human's ordered queue. `orderNext(board, ids, "web")` sets its order, top first, naming every card in it once; any other source is refused. Each ordered card carries `rank`; any move drops it, so a card coming into Next joins the bottom until the human orders it. `nextQueue(board)` returns Next in order, and `takeNext(board)` returns the card an agent asking for work is given: the top of Next, else the first card in Backlog, else none.

### Actions for Human

Only what the hooks need so far: a card's `actions` field is a list of `{ text, ticked }`, numbered from 0. `addAction` in `src/actions.ts` adds an unticked one and moves the card to Blocked by Human; `tickAction` ticks one and never moves a column. Group E builds the rest of the field on this.

## Focus binding

As the old board does it. Each checkout, the main one and each linked worktree, has one focus file naming the card its sessions are working on, kept under the hooks' state directory in the system temporary directory, never in the repo or the board's directory (`src/focus.ts`). The lead sets it, or a `Board-Item: XY-12` line in a spawn prompt does. A new, cleared or resumed session clears it and a compaction keeps it. When a subagent starts it is bound to its spawning checkout's focus for its whole run, so its own hooks reach that card from its own worktree, and a resume keeps the card it started on. The hooks move only an agent's bound card, so a checkout focused on one card never moves another's, and a start in a checkout with no focus binds and moves nothing.

## The hook events

`src/hook-moves.ts` holds what each hook does; `src/hooks/` holds one entry point per event, each reading Claude Code's hook JSON on stdin. None is registered yet, none blocks anything, and none prints anything but SessionStart's context. `test/hooks.test.ts` drives each row through its entry point and checks the column.

| Event | Entry point | Card in | Card goes to |
|---|---|---|---|
| SessionStart, startup, clear or resume | `session-start.ts` | any | stays; the checkout's focus is cleared |
| SessionStart, compact | `session-start.ts` | any | stays; the focus is kept |
| PreToolUse on Agent, with a `Board-Item:` line | `pre-agent.ts` | any | stays; the spawning checkout is focused on that card |
| SubagentStart | `subagent-start.ts` | Backlog or Next | In Progress |
| SubagentStart | `subagent-start.ts` | Blocked by Human, every action ticked | the column it was blocked from, then In Progress if that is Backlog or Next |
| SubagentStart | `subagent-start.ts` | Blocked by Human with an unticked action, Draft, In Progress, Done, Released or Blocked | stays; a `move-skipped` line says why |
| SubagentStop, with a `Blocker:` line under Decisions needed | `subagent-stop.ts` | any but Draft | Blocked by Human, with an unticked action per Blocker line |
| SubagentStop, with no `Blocker:` line | `subagent-stop.ts` | any | stays; a `Propose item:` line never moves a card |

## CLI

Run as `bun '<this directory>/src/cli.ts' <command>` from inside the repo, with this package's absolute path in single quotes. That is also the command the no-board message names, with the path filled in and quoted so it pastes even from a path with a space; the compiled binary replaces it when the board ships as one.

| Command | What it does |
|---|---|
| `init` | creates this repo's board; asks for its id prefix |
| `where` | prints the repo's key and, when it has a board, its prefix and directory |
| `new <title> [--parent <ID>]` | files a card or a sub-issue and prints its id |
| `list` | prints every card's id and title |
| `move <ID> <column>` | moves a card; the CLI moves a card only from Draft to Backlog and says why it refuses anything else |
| `next` | prints the card to take: the top of Next, else the first card in Backlog |
| `delete <ID>` | deletes a card and logs the deletion |
| `history <ID>` | prints the card's column moves, oldest first: time, from and to, source, actor, and any gate bypassed |

Without a board, every command but `init` fails with a message telling an agent to ask the human to create one; `where` prints the repo's key first.

## For hooks

`boardForHook({ cwd, sessionId })` in `src/hook-board.ts` is where every board hook starts. It returns the board, or no board and a message the first time in a session and none after, so a hook in a repo without a board, or in a session with no `~/.config/boards` at all, does nothing and says so once.

`src/hooks/session-start.ts` is the SessionStart hook, not registered yet. It clears the checkout's focus as the table above says, and in a repo with a board it adds two reminders to the agent's context: check the board first, and reconcile it before stopping. SessionStart fires again after every compaction, so both come back. There is no Stop hook on purpose: anything a Stop hook says to the agent continues the turn, and the reconcile reminder must never hold up a stop.

## Tests

`bun test` in this directory. Every test runs in a temporary `XDG_CONFIG_HOME`, `HOME` and `TMPDIR` with throwaway git repos.
