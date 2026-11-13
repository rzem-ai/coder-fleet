# boards

The fleet's board: markdown cards kept under the home directory, one board per repo. This package is built in stages; what is here so far is its storage, board keying and card ids. It is not wired into the plugin's hooks yet. It needs Bun and nothing else: no packages to install.

## Where a board lives

Every board is one directory under `$XDG_CONFIG_HOME/boards/` when `XDG_CONFIG_HOME` is set to an absolute path, else under `~/.config/boards/`. Nothing the board writes goes anywhere else, so `git status` in a repo and its worktrees never shows a board file.

```
<boards root>/<key dir>/
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

A repo with an `origin` remote is keyed by that remote's URL, normalised: host in lower case, no user, password or port, no trailing slash or `.git`, so `git@github.com:o/r.git`, `ssh://git@github.com/o/r` and `https://github.com/o/r` are one board. Moving or re-cloning the repo reaches the same board; a fork, whose origin is its own URL, gets its own. A local-path or `file://` origin is keyed by that path.

A repo with no origin is keyed by the real path of its shared git directory (`git rev-parse --git-common-dir`), so its main checkout and every linked worktree share one board. The first time the board sees such a repo with an origin, it renames the board's directory to the URL key, once, and logs a `board-rekeyed` line. If the URL key already has a board, that one is used and the path-keyed one is left untouched.

The key directory's name is a readable slug of the key followed by ten hex digits of its hash, so two keys whose slugs collide still get two directories.

## Ids

A board's prefix is a letter, then up to nine letters or digits, asked of the human when the board is made. Cards are `PREFIX-n` from 1; a sub-issue is its parent's id, a dot and a number (`XY-12.1`). `ids.json` keeps the highest number ever handed out, so a deleted card's number never comes back.

## CLI

Run as `bun src/cli.ts <command>` from inside the repo:

| Command | What it does |
|---|---|
| `init` | creates this repo's board; asks for its id prefix |
| `where` | prints the board's key and directory, and whether it exists |
| `new <title> [--parent <ID>]` | files a card or a sub-issue and prints its id |
| `list` | prints every card's id and title |
| `delete <ID>` | deletes a card and logs the deletion |

Without a board, every command but `init` and `where` fails with a message telling an agent to ask the human to create one.

## For hooks

`boardForHook({ cwd, sessionId })` in `src/hook-board.ts` is where every board hook starts. It returns the board, or no board and a message the first time in a session and none after, so a hook in a repo without a board, or in a session with no `~/.config/boards` at all, does nothing and says so once.

## Tests

`bun test` in this directory. Every test runs in a temporary `XDG_CONFIG_HOME`, `HOME` and `TMPDIR` with throwaway git repos.
