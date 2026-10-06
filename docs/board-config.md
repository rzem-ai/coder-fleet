# Board config reference

The board reads one settings file, `.boards/config.yml` in the main checkout. This page says what each key in it means, what the default is when the key is absent, which code reads it, and whether the fleet depends on it. It exists because `parseConfig` is a switch with no comments, and several of its cases parse a value that nothing reads.

References are `file:line`, taken against main at commit a610853. Line numbers drift, so search for the named function if one has moved. Paths are relative to `claude/coder-fleet/`, with two shorthands: `operations.ts` is `board/src/file-system/operations.ts` and `backlog.ts` is `board/src/core/backlog.ts`. Where an entry says "no effect", a search of the board source, the hooks, the commands and the skills found no reader. That doesn't mean the key is harmless to delete.

## How the file is read

`Core` loads the file through `loadConfig` (`operations.ts:2046`). It finds the board with `resolveBoardRoot` (`board/src/board-root.ts:46`): `CODER_FLEET_BOARD_ROOT` if set, otherwise the main checkout of the repository containing the working directory, which must hold a `.boards/` directory. A missing file gives `null` (`operations.ts:2057`), and the MCP server refuses to start (`board/src/mcp/server.ts:367`).

`parseConfig` (`operations.ts:2111`) reads the file two ways.

- Six keys are lists: `statuses`, `labels`, `types`, `priorities`, `projects` and `default_assignee`. They go through a real YAML parse of the key's own block (`parseConfigListValue`, `operations.ts:193`), so quoting, flow lists and block lists all work. A value of the wrong shape is an error that names the file and the key (`operations.ts:125`, `operations.ts:160`) rather than a silent default. A key with no value reads as absent (`operations.ts:214`). Items are trimmed and empty ones dropped (`operations.ts:218`). `default_assignee` also accepts a single name (`operations.ts:221`).
- `definition_of_done` is a list too, with its own YAML path (`operations.ts:2285`).
- The other 20 keys are read line by line (`operations.ts:2122`). Each line is trimmed, so indentation is ignored. Lines starting with `#` are skipped. Everything after the first colon is the value, and the last occurrence of a key wins. Unknown keys are ignored.

Two consequences of the line reader follow from the code and have not been run. A comment on the same line as a scalar key is part of its value, so `auto_commit: true # note` isn't `true` and reads as false (`operations.ts:2171`). Most string values lose every quote character, not just the outer pair (`operations.ts:2136`). Put comments on their own lines, as `.boards/config.yml` does.

The live-reload watcher in `board/src/core/content-store.ts` re-parses the file when it changes. It keeps the last good config if a recognised key holds something unusable: a boolean that isn't `true` or `false`, an integer that isn't digits, an empty `project_name` or `date_format`, a port outside 1 to 65535, or a `task_prefix` with anything but letters (`content-store.ts:96` to `content-store.ts:126`, with the key sets at `content-store.ts:65` to `content-store.ts:94`). It is the only check on `task_prefix` after init.

Three keys are forced after parsing, whatever the file says: `filesystem_only` is true, and `check_active_branches` and `remote_operations` are false. `auto_commit` is normalised so that only exactly `true` counts (`forceFilesystemOnly`, `operations.ts:234`). It runs on every load and on every cached read (`operations.ts:2049`, `operations.ts:2067`).

The board rewrites the whole file in two places: the web UI's settings page (`board/src/server/index.ts:1685`) and the MCP tool that sets the Definition of Done defaults (`board/src/mcp/tools/definition-of-done/handlers.ts:54`). Both go through `serializeConfig` (`operations.ts:2238`), which writes only the keys it knows, in its own order, with lists inline. Comments and unknown keys are lost, and `on_status_change` comes back as `onStatusChange`. If you keep comments in the file, edit it by hand and avoid both.

To see what the board parsed, run `board config show`. It prints only the statuses and the Definition of Done defaults (`board/src/cli.ts:280` to `board/src/cli.ts:295`).

## At a glance

| Key | Type | Read by | Fleet depends |
|---|---|---|---|
| `statuses` | list | board, hooks, web UI | Yes |
| `default_status` | string | board | Partly |
| `task_prefix` | string | board, hooks | Yes |
| `definition_of_done` | list | board, web UI | Yes |
| `require_acceptance_criteria` | boolean | board | Yes |
| `auto_commit` | boolean | board | Yes |
| `project_name` | string | board, web UI | No |
| `labels` | list | web UI | Partly |
| `types` | list | board | No |
| `priorities` | list | board, web UI | No |
| `projects` | list | board | No |
| `default_assignee` | list or name | board, web UI | No |
| `date_format` | string | web UI | No |
| `hide_empty_columns` | boolean | web UI | No |
| `default_port` | integer | web server | No |
| `zero_padded_ids` | integer | board | No |
| `on_status_change` | string | board | No |
| `filesystem_only` | boolean | forced true | No |
| `remote_operations` | boolean | forced false | No |
| `check_active_branches` | boolean | forced false | No |
| `backlog_directory` | string | root config file only | No |
| `default_reporter` | string | nothing | No |
| `max_column_width` | integer | nothing | No |
| `default_editor` | string | nothing | No |
| `auto_open_browser` | boolean | nothing | No |
| `bypass_git_hooks` | boolean | nothing | No |
| `active_branch_days` | integer | nothing | No |

## Keys the fleet depends on

### statuses

- **Type:** list of strings.
- **Default:** `To Do`, `In Progress`, `Done` (`board/src/constants/index.ts:46`, applied at `operations.ts:2211`). An empty list falls back to the same three where statuses are read (`board/src/utils/status.ts:12`).
- **Effect:** these are the board's columns, in order. A status given on create or edit must match one of them, ignoring case and whitespace (`board/src/utils/status.ts:26` to `status.ts:41`, `backlog.ts:636`, `board/src/cli.ts:43`), and the MCP `status` field is an enum of them (`board/src/mcp/utils/schema-generators.ts:29`). `task_list` groups by them in this order (`board/src/mcp/tools/tasks/handlers.ts:308` to `handlers.ts:328`), and the web UI's columns follow the list (`board/src/web/App.tsx:858`). The last entry is the terminal status (`board/src/utils/terminal-status.ts:1` to `terminal-status.ts:16`). `task_complete` refuses a card that isn't in it (`handlers.ts:529` to `handlers.ts:536`), `task_archive` refuses one that is (`handlers.ts:500` to `handlers.ts:507`), dependency readiness counts it as finished (`board/src/utils/readiness.ts:83`), and entering it clears a card's Actions for Human (`board/src/core/actions-for-human.ts:119` to `actions-for-human.ts:123`).
- **Fleet:** yes, and this is the key that must be right. The fleet uses six columns, spelled `To Do`, `Next`, `In Progress`, `Blocked`, `Blocked by human` and `Done`, with `Done` last. The hooks match the names ignoring case. Who writes what:
  - `To Do` is where a new item starts (see `default_status`). No hook writes it.
  - `Next` is the human's ordered queue. No hook writes it, and the fleet works without it (`commands/kickoff.md:29`).
  - `In Progress` is written by `SubagentStart` (`hooks/board-subagent-start.sh:92`). On a board that still lists `Doing` and not `In Progress`, the hook writes `Doing` (`hooks/lib/board.sh:730`).
  - `Blocked` is written by `TaskCompleted` when tests fail or the card gate refuses (`hooks/board-task-completed.sh:203`, `hooks/board-task-completed.sh:260`).
  - `Blocked by human` is written by `SubagentStop` on a `Blocker:` line (`hooks/board-subagent-stop.sh:457`).
  - `Done` is written by `TaskCompleted` (`hooks/board-task-completed.sh:319`).
- **What breaks:** a hook that asks for a column the list doesn't contain is refused as an invalid status, nothing moves, and the hook leaves one comment on the card per session (`hooks/lib/board.sh:824` to `hooks/lib/board.sh:843`). Renaming a column doesn't rewrite items already on disk, so they keep the old name; `/kickoff` moves them itself when it renames `Doing` (`commands/kickoff.md:37` to `commands/kickoff.md:46`). Put `Done` anywhere but last and the board treats whatever is last as the terminal column, so `task_complete` and the Actions for Human clearing follow that column while the hooks still write `Done`. The fix for a wrong word is the config, not a `BOARD_COL_*` override in `board.env` (`commands/kickoff.md:29`).

### default_status

- **Type:** string.
- **Default:** `To Do` (`FALLBACK_STATUS`, `board/src/constants/index.ts:51`).
- **Effect:** the status of an item created without one (`backlog.ts:1442`, `backlog.ts:1573`) and of a draft when it is promoted (`operations.ts:1199`, `backlog.ts:3393`). The MCP `task_create` schema advertises the first entry of `statuses` as its default, not this key (`board/src/mcp/utils/schema-generators.ts:33`, `schema-generators.ts:43`), so a client that fills in the advertised default bypasses it.
- **Fleet:** partly. New items are meant to arrive in `To Do`, and the template and this repo both set it to that. `/kickoff` rewrites it when it renames `Doing` (`commands/kickoff.md:43`).
- **What breaks:** setting it to any column other than `To Do` makes new items skip the queue. Nothing at the lines above checks that the value is listed in `statuses`, and what the board does with a name that isn't is untraced.

### task_prefix

- **Type:** string, letters only.
- **Default:** `task` (`operations.ts:1186`, `board/src/utils/prefix-config.ts:6`).
- **Effect:** the prefix of every new item id, upper-cased, so `CF` gives `CF-151` (`prefix-config.ts:305` to `prefix-config.ts:327`, used at `operations.ts:1186` and `backlog.ts:1217`). Ids are allocated by counting the existing ids that start with this prefix (`prefix-config.ts:170`, `prefix-config.ts:310`), so numbering after a change starts again from 1 under the new prefix. `draft`, `doc` and `decision` are reserved (`prefix-config.ts:29` to `prefix-config.ts:36`). The letters-only rule is checked at init (`prefix-config.ts:44`) and by the watcher (`board/src/core/content-store.ts:123`), not when the file is loaded.
- **Fleet:** yes. The hooks recognise an item only as letters, a dash, digits and optional `.digits` (`hooks/lib/board.sh:439`, `hooks/lib/board.sh:442`), the same rule. `/init` offers `BD` (`commands/init.md:43`).
- **What breaks:** a prefix containing a digit or a dash means the hooks can't bind to the item. Changing the prefix on a live board leaves existing items under the old one, and the hooks still resolve those by shape. What else, such as dependency references, does with ids under a prefix that is no longer configured is untraced.

### definition_of_done

- **Type:** list of strings.
- **Default:** none. An absent key gives no Definition of Done items.
- **Effect:** each entry becomes an unticked Definition of Done item on every item created afterwards (`backlog.ts:1437` to `backlog.ts:1441`, `board/src/utils/task-builders.ts:302` to `task-builders.ts:314`). Items that already exist aren't touched. A create can add its own items or switch the defaults off (`backlog.ts:1439`, `backlog.ts:1440`). The MCP tools `definition_of_done_defaults_get` and `definition_of_done_defaults_upsert` read and replace the list (`board/src/mcp/tools/definition-of-done/index.ts:12`, `index.ts:23`). The replace rewrites the file (see How the file is read).
- **Fleet:** yes. The lead ticks these items on evidence (`skills/help-boards/SKILL.md:46`), and the `TaskCompleted` card gate counts every unticked criterion and Definition of Done item and moves the card to Blocked while any remain (`hooks/board-task-completed.sh:279` to `hooks/board-task-completed.sh:283`). The template carries a default list (`templates/board.config.yml:12`), and `scripts/board-backfill.sh` adds the current list to open items once (named in the comment at `.boards/config.yml:11`).
- **What breaks:** nothing in the board. A longer list means more to tick before the gate lets a card reach Done, and a change reaches only items created after it.

### require_acceptance_criteria

- **Type:** boolean.
- **Default:** off. Only exactly `true` turns it on (`backlog.ts:265`).
- **Effect:** the board refuses to create an item with no acceptance criteria, from the CLI, MCP `task_create` and the web UI, drafts included (`backlog.ts:263` to `backlog.ts:268`, `backlog.ts:1436`). It also refuses to promote a draft that has none (`backlog.ts:3389`).
- **Fleet:** yes. `/init` switches it on and tells the human how to turn it off (`commands/init.md:45`), and the `spec-to-card` workflow files criteria onto the card.
- **What breaks:** turning it off lets a card exist with no criteria, but the `TaskCompleted` card gate still refuses to finish a `[board:<id>]` task whose card has none (`hooks/board-task-completed.sh:280`, `hooks/board-task-completed.sh:285`). The item then stalls in Blocked at the end instead of being refused at the start.

### auto_commit

- **Type:** boolean.
- **Default:** false. Only exactly `true` turns it on (`operations.ts:238`).
- **Effect:** after each write the binary stages and commits `.boards` on the checked-out branch, never pushing (`shouldAutoCommit`, `backlog.ts:1101` to `backlog.ts:1105`; the update path is `backlog.ts:1606`). The git layer also skips the commit when `CODER_FLEET_BOARD_NO_COMMIT=1` is set or `.boards` is gitignored (`board/src/git/operations.ts:119`, `operations.ts:122` in that file).
- **Fleet:** yes. The skill describes a board whose every write is a commit with a `Board-Writer:` trailer (`skills/help-boards/SKILL.md:122`), and `/kickoff` decides whether to commit its own config edits by reading this key (`commands/kickoff.md:42`). The template sets it to true.
- **What breaks:** with it off the files are still written but nothing is committed, so `git log -- .boards/tasks/<id>*` shows no history and the writes pile up uncommitted in the main checkout.

## Other keys the board reads

### project_name

- **Type:** string.
- **Default:** empty (`operations.ts:2208`). The web server then titles itself "Untitled Project" (`board/src/server/index.ts:483`).
- **Effect:** names the project in the web UI (`board/src/web/App.tsx:393`, `board/src/server/index.ts:483`) and in the heading of `board export` (`board/src/cli.ts:277`). The watcher rejects a config where it is empty (`board/src/core/content-store.ts:115`, `content-store.ts:130`).
- **Fleet:** no. `/init` sets it to the repository's directory name (`commands/init.md:43`). No hook reads it.
- **What breaks:** nothing beyond the heading and title.

### labels

- **Type:** list of strings.
- **Default:** empty (`operations.ts:2212`).
- **Effect:** feeds the label filter in the web UI (`board/src/web/App.tsx:394`), merged with the labels already on items. Nothing checks that a label given on create or edit is in this list, so the CLI and MCP accept any label (`backlog.ts:1393`, `backlog.ts:1751`).
- **Fleet:** partly. The fleet records an item's outcome as `outcome/shipped`, `outcome/abandoned` or `outcome/superseded`, and `/kickoff` checks the list names them and offers to add any that are missing (`commands/kickoff.md:31`, `commands/kickoff.md:35`).
- **What breaks:** nothing in the board. Dropping the outcome labels makes the next `/kickoff` report them missing, and the web filter stops offering them until an item carries one.

### types

- **Type:** list of strings.
- **Default:** `bug`, `feature`, `enhancement`, `task`, `chore`, `docs`, `spike` (`board/src/constants/index.ts:56`, `board/src/utils/task-type-config.ts:30`). This repo doesn't set it.
- **Effect:** the allowed values of an item's `type`, matched ignoring case. A value outside the list is an error naming the valid ones (`backlog.ts:657` to `backlog.ts:666`), and the MCP `type` field is an enum of them (`board/src/mcp/utils/schema-generators.ts:52`).
- **Fleet:** no. No hook, command or skill reads it.
- **What breaks:** a type you remove can no longer be set on an item.

### priorities

- **Type:** list of strings, highest first.
- **Default:** `High`, `Medium`, `Low` (`board/src/utils/priority-config.ts:3` to `priority-config.ts:7`, `priority-config.ts:43`).
- **Effect:** the allowed values of an item's `priority`, matched ignoring case, with an error naming the valid ones (`backlog.ts:645` to `backlog.ts:655`). The configured spelling is what gets written to the file (`priority-config.ts:93`, applied at `operations.ts:821`). Position sets rank, so earlier entries sort first (`priority-config.ts:104` to `priority-config.ts:115`). The MCP enum and the web UI use the list too.
- **Fleet:** no. This repo and the template both list the defaults.
- **What breaks:** reordering changes sort order. A value you remove ranks as 0 on items that still carry it (`priority-config.ts:114`).

### projects

- **Type:** list of strings.
- **Default:** none, which doesn't mean "any value". With no list, setting an item's `project` throws "No projects are configured" (`backlog.ts:669` to `backlog.ts:683`, `board/src/utils/project-config.ts:90`), and the MCP schemas leave the `project` field out (`board/src/mcp/utils/schema-generators.ts:91`, `schema-generators.ts:187`).
- **Effect:** the allowed values of an item's `project`, for a monorepo that wants to name which part.
- **Fleet:** no. The `help-boards` skill says there is no list to be on. That describes the fleet's practice; the board itself refuses the field until a list exists.
- **What breaks:** setting a value you have removed is refused.

### default_assignee

- **Type:** list of strings. A single name is accepted as a one-entry list (`operations.ts:221`).
- **Default:** none, which means an unassigned item.
- **Effect:** the assignees given to a new item when the create names none. An explicit assignee replaces it, and an explicit empty list means unassigned (`backlog.ts:1443` to `backlog.ts:1446`). The web UI's create form uses it too (`board/src/web/App.tsx:1002`).
- **Fleet:** no.
- **What breaks:** nothing.

### date_format

- **Type:** string.
- **Default:** `yyyy-mm-dd` (`operations.ts:2219`).
- **Effect:** how the web UI displays dates (`board/src/web/App.tsx:866`, `board/src/utils/utc-date-display.ts:127` to `utc-date-display.ts:130`). The CLI and MCP don't pass it (`board/src/mcp/tools/tasks/handlers.ts:142`), and no code writes dates through it. The watcher rejects an empty value (`board/src/core/content-store.ts:115`, `content-store.ts:133`).
- **Fleet:** no.
- **What breaks:** web display only.

### hide_empty_columns

- **Type:** boolean.
- **Default:** false (`board/src/web/App.tsx:865`).
- **Effect:** the web board hides columns with no cards, and shows them again during a drag so they stay valid drop targets (`board/src/types/index.ts:353`).
- **Fleet:** no.
- **What breaks:** nothing.

### default_port

- **Type:** integer, 1 to 65535. 0 asks for a random port.
- **Default:** absent means a random port each time the UI starts (`board/src/server/port.ts:72`). The 6420 in the web settings form is a display fallback only (`board/src/web/components/Settings.tsx:312`).
- **Effect:** the port the web UI binds when neither `--port` nor `CODER_FLEET_BOARD_PORT` is given (`port.ts:61` to `port.ts:73`, read at `board/src/server/index.ts:478` to `server/index.ts:482`). A busy port moves up until one binds, and the result says so. The `/board` command and `board_serve` use it (`commands/board.md:14`, `board/src/mcp/server.ts:141`).
- **Fleet:** no. The hooks and the MCP task tools read the files directly and never touch the UI.
- **What breaks:** only the URL the UI comes up on. A malformed value stops the watcher reloading the config (`board/src/core/content-store.ts:117` to `content-store.ts:122`), and an out-of-range one makes the server refuse to start with a port error (`port.ts:43` to `port.ts:53`).

### zero_padded_ids

- **Type:** integer.
- **Default:** absent means no padding.
- **Effect:** pads the number in new ids to that width, so 3 gives `CF-007` (`board/src/utils/prefix-config.ts:326`, `prefix-config.ts:327`). It applies to tasks, drafts, docs and decisions (`operations.ts:1195`, `operations.ts:1248`, `board/src/utils/id-generators.ts:30` to `id-generators.ts:33`, `id-generators.ts:67` to `id-generators.ts:70`). A value of 0 turns it off. With padding on, a sub-item suffix is padded to two digits whatever the width (`prefix-config.ts:385`, `prefix-config.ts:386`).
- **Fleet:** no. The hooks accept any number of digits (`hooks/lib/board.sh:439`).
- **What breaks:** nothing, and only new ids are affected. This repo's file says `zero_padded_ids: 00`, which parses to 0 (`operations.ts:2178`) and so pads nothing.

### on_status_change

- **Type:** string, a shell command. The camelCase `onStatusChange` is accepted too (`operations.ts:2192`).
- **Default:** none, so no callback.
- **Effect:** after the board saves a status change, it runs the command with `sh -c` in the board root, with `TASK_ID`, `OLD_STATUS`, `NEW_STATUS` and `TASK_TITLE` in the environment (`backlog.ts:1611` to `backlog.ts:1613`, `backlog.ts:2690` to `backlog.ts:2719`, `board/src/utils/status-callback.ts:34` to `status-callback.ts:48`). An item's own `onStatusChange` front matter overrides it (`backlog.ts:2694`). A failure is logged to stderr and doesn't block the change. An edit to a card in the completed folder doesn't fire it (`board/NOTICE.md:66`). Which CLI and MCP paths reach `updateTask` is untraced, so whether every hook-driven move fires it is unknown.
- **Fleet:** no.
- **What breaks:** nothing, unless the command itself misbehaves, since every status change would run it.

## Keys the board forces

### filesystem_only

- **Type:** boolean. The camelCase `filesystemOnly` is accepted too (`operations.ts:2173`).
- **Default:** forced true (`operations.ts:235`).
- **Effect:** whatever the file says, the loaded value is true. It makes `getGitCommonDir` skip its `git rev-parse --git-common-dir` call (`operations.ts:584` to `operations.ts:588`). What depends on that result is untraced.
- **Fleet:** no. Setting it false has no effect.

### remote_operations

- **Type:** boolean.
- **Default:** forced false (`operations.ts:237`).
- **Effect:** none. `board/NOTICE.md:26` lists remote operations as removed. The web settings page still shows a checkbox for it (`board/src/web/components/Settings.tsx:219` to `Settings.tsx:233`), and ticking it changes nothing.
- **Fleet:** no. Setting it true has no effect.

### check_active_branches

- **Type:** boolean.
- **Default:** forced false (`operations.ts:236`).
- **Effect:** none. `board/NOTICE.md:26` lists cross-branch task loading as out, and no other reader of the key exists. Id allocation across branches is a separate file, `board/src/git/branch-ids.ts` (`board/NOTICE.md:26`).
- **Fleet:** no. Setting it true has no effect.

## Keys with no effect

Each of these parses into the config object (the line cited is its `case` in `parseConfig`) and is written back by `serializeConfig`, but nothing reads the value.

### backlog_directory

- **Type:** string, a project-relative path. The camelCase `backlogDirectory` is accepted too (`operations.ts:2200`).
- **Default:** none.
- **Effect:** read only from a `backlog.config.yml` at the repository root, where it names the board folder (`board/src/utils/backlog-directory.ts:58` to `backlog-directory.ts:64`, `backlog-directory.ts:212` to `backlog-directory.ts:216`, `operations.ts:413` to `operations.ts:423`). In `.boards/config.yml` it parses and nothing reads it, and `saveConfig` deletes it when the config lives in the folder (`operations.ts:2079` to `operations.ts:2081`).
- **Fleet:** no effect. The fleet's board is always `.boards` (`board/src/board-root.ts:7`). If a `backlog.config.yml` ever appears at the repository root, the board resolves its config from there instead (`backlog-directory.ts:210` to `backlog-directory.ts:216`).

### default_reporter

- **Type:** string.
- **Default:** none.
- **Effect:** none. Parsed at `operations.ts:2138`. The only other mentions are its own serialisation (`operations.ts:2245`) and tests.
- **Fleet:** no.

### max_column_width

- **Type:** integer.
- **Default:** none.
- **Effect:** none. Parsed at `operations.ts:2152`. The web settings page has an input for it (`board/src/web/components/Settings.tsx:352` to `Settings.tsx:361`) that stores the number, and nothing consumes it. The watcher still requires it to be at least 1 (`board/src/core/content-store.ts:120`). `board/NOTICE.md:27` lists the terminal UI as removed.
- **Fleet:** no.

### default_editor

- **Type:** string.
- **Default:** none.
- **Effect:** none. Parsed at `operations.ts:2155`. `board/NOTICE.md:34` lists the editor helper as removed.
- **Fleet:** no.

### auto_open_browser

- **Type:** boolean.
- **Default:** none.
- **Effect:** none. Parsed at `operations.ts:2158`. `board/NOTICE.md:34` lists the browser-launch helper as removed.
- **Fleet:** no.

### bypass_git_hooks

- **Type:** boolean.
- **Default:** none.
- **Effect:** none. Parsed at `operations.ts:2180`. The restored git layer in `board/src/git/operations.ts` doesn't read it.
- **Fleet:** no.

### active_branch_days

- **Type:** integer.
- **Default:** none.
- **Effect:** none. Parsed at `operations.ts:2189`. `board/NOTICE.md:26` says cross-branch task loading is out, and nothing reads it.
- **Fleet:** no.

## Keys the type declares that parseConfig doesn't read

`BacklogConfig` (`board/src/types/index.ts:329`) also declares `milestones` (marked deprecated, since milestones come from milestone files, `types/index.ts:342`), `includeDateTimeInDates` (`types/index.ts:360`) and an `mcp` block (`types/index.ts:370`). `parseConfig` has no case for any of them, so a value for them in `config.yml` is ignored. So is any other key not named on this page.

## Example

A fleet project's `.boards/config.yml`, with the same keys as this repo's own and the project-specific values changed. `/init` writes the first nine keys from `templates/board.config.yml`. Comments sit on their own lines because the line reader doesn't strip trailing ones.

```yaml
project_name: "my-project"
task_prefix: "MP"
statuses: ["To Do", "Next", "In Progress", "Blocked", "Blocked by human", "Done"]
default_status: "To Do"
labels: ["outcome/shipped", "outcome/abandoned", "outcome/superseded"]
priorities: ["High", "Medium", "Low"]
# Every new item starts with these, unticked. A change reaches items created afterwards.
definition_of_done:
  - "The project's checks pass on the branch"
  - "A reviewer approved the change"
  - "Docs that describe the changed behaviour are updated"
  - "The spec, where there is one, is linked as a reference"
# The board refuses to create an item with no acceptance criterion.
require_acceptance_criteria: true
# Commit every board write on the checked-out branch. Never pushed.
auto_commit: true
# Any free port. Leave it out for a random one each session.
default_port: 42024
date_format: yyyy-mm-dd
# The next three are forced to these values by the board. They are here so the file matches this repo's.
remote_operations: false
filesystem_only: true
check_active_branches: false
# 00 reads as 0, which is no padding. Use 3 for MP-007.
zero_padded_ids: 00
```
