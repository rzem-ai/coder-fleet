# boards

The fleet's board: markdown cards kept under the home directory, one board per repo. This package is built in stages; what is here so far is its storage, board keying and card ids. It is not wired into the plugin's hooks yet. It needs Bun and nothing else: no packages to install.

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

Each board records its key in `config.yml`. A repo with an `origin` remote is keyed by that remote's URL, normalised: host in lower case, no user, password or port, no trailing slash or `.git`, so `git@github.com:o/r.git`, `ssh://git@github.com/o/r` and `https://github.com/o/r` are one board. The host of an SSH remote goes through `ssh -G` first, so an alias from `~/.ssh/config` (`git@github-work:o/r.git`) reaches the board of the host it stands for; when ssh is missing, fails or takes over two seconds, the host is kept as written. Moving or re-cloning the repo reaches the same board; a fork, whose origin is its own URL, has a different key and needs its own board with its own prefix. A local-path or `file://` origin is keyed by that path.

A repo with no origin is keyed by the real path of its shared git directory (`git rev-parse --git-common-dir`), so its main checkout and every linked worktree share one board. The first time the board sees such a repo with an origin, it changes the recorded key to the URL, once, and logs a `board-rekeyed` line; the directory stays where it is. If the URL key already has a board, that one is used and the path-keyed one is left untouched.

Finding a checkout's board reads every `config.yml` under the boards root and picks the one whose key matches. There is no index to go stale. A directory counts as a board only when its config's prefix is the directory's own name.

## Prefixes and ids

A board's prefix is a letter, then up to nine letters or digits, asked of the human when the board is made, and kept in upper case. It is unique on the machine: creating a board with a prefix another board holds is refused, as is a second board for a repo that has one. It never changes once the board exists. Cards are `PREFIX-n` from 1; a sub-issue is its parent's id, a dot and a number (`XY-12.1`). `ids.json` keeps the highest number ever handed out, so a deleted card's number never comes back.

## CLI

Run as `bun <this directory>/src/cli.ts <command>` from inside the repo, with this package's absolute path. That is also the command the no-board message names, with the path filled in; the compiled binary replaces it when the board ships as one.

| Command | What it does |
|---|---|
| `init` | creates this repo's board; asks for its id prefix |
| `where` | prints the repo's key and, when it has a board, its prefix and directory |
| `new <title> [--parent <ID>]` | files a card or a sub-issue and prints its id |
| `list` | prints every card's id and title |
| `delete <ID>` | deletes a card and logs the deletion |

Without a board, every command but `init` fails with a message telling an agent to ask the human to create one; `where` prints the repo's key first.

## For hooks

`boardForHook({ cwd, sessionId })` in `src/hook-board.ts` is where every board hook starts. It returns the board, or no board and a message the first time in a session and none after, so a hook in a repo without a board, or in a session with no `~/.config/boards` at all, does nothing and says so once.

## Tests

`bun test` in this directory. Every test runs in a temporary `XDG_CONFIG_HOME`, `HOME` and `TMPDIR` with throwaway git repos.
