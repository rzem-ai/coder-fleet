# How the board works underneath

The `help-boards` skill holds what an agent does with a card. This file holds how the board, the hooks and the binary do their part: the config's column spellings, the `Board-Item:` parser, how Actions for Human clear, how every write becomes a commit, the flush, the CLI's flags, the web UI and Cowork. Read it when you run the CLI by hand, debug a board write or a commit that did not happen, flush, change `.boards/config.yml`, or work in Cowork.

## The columns in the config

The columns are the `statuses` list in `.boards/config.yml`, spelled exactly as the skill's table has them, and the hooks match them ignoring case. A board not yet renamed still lists `Doing` in place of In Progress; the hooks accept it and write `Doing` there, and `/kickoff` offers the rename. A board made before Next lacks it; nothing in the fleet needs the column to work, and `/kickoff` and `/init` offer to add it after To Do. The hooks' column names are fixed, so any other spelling is fixed in the config, and a move the board refuses is noted on the card once per session.

Every key in `.boards/config.yml`, with its default and whether the fleet depends on it, is documented in `docs/board-config.md` in the coder-fleet repo.

The one column write a command makes is the rename from Doing to In Progress that `/kickoff` and `/init` offer on a board not yet renamed, which moves items only with the human's yes. Adding the Next column, which they also offer, edits the config on the human's yes and moves no item. Three hooks cover every other transition, each calling the `board` binary against this repository's `.boards/`.

## The `Board-Item:` parser

If a future runtime does send the spawn prompt to `SubagentStart`, the hook already reads it, and this is the format it accepts, as `hooks/lib/board.sh` parses it:

- The first matching line wins. Later ones are ignored, so one line per spawn.
- The label is case-insensitive and may be indented, and a leading `- ` is tolerated so the line survives being written as a list item. Nothing else may precede it on the line.
- The value is the first whitespace-separated token after the colon. Anything after it on that line is discarded, so do not append a title or a note.
- The value may be an item identifier in any case (`bd-12` resolves as `BD-12`), a sub-task id (`BD-12.3`), or the task file's path as the CLI or the web UI hands it back.
- A value in none of those shapes is not a ref. The line is then treated as absent, silently.

When a spawn carries no binding, `SubagentStart` logs that no board item was resolved, moves nothing, and exits 0. The only evidence is a `no board item` line in `~/.local/state/coder-fleet/log/hooks.log`.

## Actions for Human, underneath

`SubagentStop` adds one action per `Blocker:` line, the ask alone, through `task edit --action=<text>`, in a call of its own after the move. The binary flags an ask that does not end in `?` with the prefix `[not a question] `, whichever writer added it. A second `Blocker:` handoff appends, numbered after the rest, and ticks stay. A ticked action stays on the card, shown ticked. While any action is unticked, `SubagentStart` moves nothing on a card in blocked by human, on a first start or a resume, and logs `waiting on the human: <n> open action(s) on <id>`. Once every action is ticked, the next start moves the card as before.

The section clears in three ways, and every clear archives the actions, ticked or not, as one `@board` comment listing each number, its text and whether it was ticked. Any status change out of blocked by human clears it in the same write, whoever makes it: a hook, the CLI, MCP, or the human's drag or demote in the web UI. A move into done from any other column clears it too, so an action never rides into the completed folder. And the lead may clear it with `actionsClear` and a reason, moving no column. Ticking the last open action moves nothing; the human or a hook moves the card.

## Git

Every write the binary makes is a commit: `git add -- .boards` then `git commit -- .boards` in the state worktree, on `coder-fleet/state`, never on the default branch or a feature branch, with an imperative, unprefixed subject that names the change and then the card's title, such as `Move BD-12 to In Progress - Add a login page`, `Tick criterion 2 on BD-12 - Add a login page` or `Clear BD-12 from Done - Add a login page`, and who made the write in a `Board-Writer:` trailer (`Board-Writer: SubagentStart`), never in the subject. A title that would take the subject past 72 characters is cut with `...` and given whole in the body; a commit carrying several cards, such as `task_complete` given `ids`, lists each as `<id> - <title>` in the body; and a move into Blocked or Blocked by human carries the comment that explains it in the body too. The pathspec keeps the human's own staged work out: everything outside `.boards` is left alone; anything inside it, staged or not, goes with the next board commit. Each commit on the state branch is pushed behind it by `hooks/state-push.sh`, and board writes never reach the default branch. A commit that cannot be made - a locked index after three retries, a checkout mid-rebase, an ignored `.boards` - leaves the file write standing and puts a line in `~/.local/state/coder-fleet/log/hooks.log`, from the hooks and the MCP server alike: `commit failed` when git refused, `commit skipped` when something asked for no commit. Commits happen only when `auto_commit: true` is set in the config - an absent key means no commits - and `CODER_FLEET_BOARD_NO_COMMIT=1` turns them off for a shell.

A hook fired inside a coder's worktree, or in the main checkout on any branch, resolves to the state worktree, so neither the default branch nor a feature branch ever carries a board change unless a person put one there. The first board use in a project without a state worktree makes one, moving the board into it with every uncommitted and unpushed change; `/coder-fleet:init` and `/coder-fleet:kickoff` make it up front. A move that fails leaves the board in the main checkout as before and says why in `~/.local/state/coder-fleet/log/hooks.log`, and `board.sh state` tries again. A session still on the previous plugin version keeps its old binary, which goes on writing the main checkout's `.boards/` and committing on its branch where no board shows it, so every other session in the project ends before the first session on the new version starts; `scripts/board-git-check.sh`, which `/coder-fleet:kickoff` runs, names anything written there since the move. Ids are allocated above the highest id in every branch the clone knows, so two contributors do not mint the same one; a clone that has not fetched cannot know, and that is the limit.

**The flush.** `board.sh flush` lands nothing on the default branch, in any project and on any clone: it prints one line saying so and pushes `coder-fleet/state`, which the board binary and the memory hook already push after every commit. When the default branch's tip still tracks `.boards/` or a fleet agent's memory, the line says the project is not migrated yet and names `/coder-fleet:init`. `docs/board-config.md` has the detail.

Agent memory goes the same way. `hooks/memory-state.sh` merges every change an agent makes under `.claude/agent-memory/<agent>/` into the state worktree and commits it on `coder-fleet/state`, with a `Record <agent> memory` subject and a `Board-Writer: memory` trailer. An agent worktree's memory is kept out of the agent's own commits, the main checkout's copy is put back as the default branch has it when its agent stops, and review-round blocks a feature diff that changes `.boards` or `.claude/agent-memory`. The index an agent loads at its start is whatever copy its checkout holds, often none, and the hook hands it the state branch's newer one as context. `scripts/board-git-check.sh` names memory the hook did not commit or never carried. Deletions are not carried: a note deleted in an agent's own directory stays on the state branch, and to forget one, delete it in the state worktree and commit it there, where it stays deleted. In a project that excludes `docs/specs/`, the same hook commits the main checkout's specs on `coder-fleet/state`, `Record specs: <names>` with a `Board-Writer: specs` trailer, a spec removed there included, and a clone that adopts the branch gets each one back where it has none.

The item-history command in the skill also reads the refs under `refs/coder-fleet/flushed`, which a flush before CF-201 left to keep each write's own commit when it started the state branch again.

## The CLI

Every write goes through the `board` binary, reached by the shim at `${CLAUDE_PLUGIN_ROOT}/board/board.sh`, against the state worktree of the repository containing the working directory (`CODER_FLEET_BOARD_ROOT` overrides that when set). `board.sh root` prints the live board's directory. The flags are listed here because a machine that has not built the binary cannot ask it for `--help`.

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
| `board flush` | `--tag t`, `--by <name>`, both accepted and unused - land nothing, say so in one line, and push the state branch, run from the main checkout |
| `board mcp` | none - the MCP server on stdio |
| `board serve` | `--port n`, `--host h` - random port on `127.0.0.1` unless overridden by the flag, `CODER_FLEET_BOARD_PORT`/`_HOST`, or `default_port` in the config; a busy port from any of them moves up until one binds, and the output says so |

`--dep`, `--ac`, `--check-ac`, `--uncheck-ac`, `--remove-ac`, `--dod`, `--ref`, `--add-label`, `--remove-label`, `--append-plan`, `--append-notes`, `--comment`, `--action`, `--check-action` and `--uncheck-action` repeat, as do `list --status` and `search --type`; `-a` and `-l` take a comma-separated list or repeat. `-s` on `create` and `edit` takes one status, not a list. `--json` returns a versioned document whose `kind` is `task-view`, `task-list`, `search` or `config`, and a comment's text is its `body` field. There is no `--cwd`: the board is found from the working directory through git, to the state worktree, never to another checkout's copy.

## The web UI

The `/board` command calls the MCP server's `board_serve` tool, which starts the UI inside that session's own MCP process on a loopback port and returns the URL; `board_url` reports it without starting anything. The port follows the same precedence as `board serve` without a flag: `CODER_FLEET_BOARD_PORT`, then `default_port` in `.boards/config.yml`, then a random one. A busy configured port moves up one at a time until a port binds, and the result names the port bound and says the configured one was busy; with nothing free up to 65535 it fails naming the configured port, never falling back to a random one. `board_stop` stops it; otherwise it stops when the session's MCP server stops. Nothing about the board depends on it: the task tools and the hooks read and write the files directly.

## In Cowork

In Cowork there are no hooks, so the assistant layer writes the board by instruction. The assistant moves items itself, and the discipline the hooks provide has to come from three rules instead. First, move an item to in progress when you actually start it and to done when it is finished and verified, in the turn it happens, never batched up at the end of a day. Second, the only thing that goes into blocked by human is something genuinely waiting on the human, with the reason as a comment on the issue. Third, never file an item for a step you are about to take in the same turn - that is a task.
