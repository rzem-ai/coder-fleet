# CF-9: rename the fleet's second column from Doing to In Progress

Status: approved by the human on 2026-09-27 with the recommended answers to every open question; runs after CF-8 merges. Board item: CF-9, stacked on CF-8 (branch `cf-8-align-design-hooks`, v0.25.1). The CF-9 branch is cut from local `main` after CF-8 merges; every line number below is on the CF-8 branch. Release: v0.26.0.

## Decisions already taken

1. The fleet's name for the column is "In Progress" everywhere it names it.
2. Hooks accept either: SubagentStart reads the board's statuses and writes whichever of "In Progress" or "Doing" the config lists, ignoring case. An explicit `BOARD_COL_DOING` still wins. Contract tests cover both, neither, and the override; failing test first.
3. `/kickoff` and `/init` detect a board still on Doing and offer the rename - config statuses and every live item in Doing, through the binary - one repository at a time, changing nothing without the human's yes. Nothing outside this repository changes.
4. This repo's `.boards/config.yml` moves to In Progress, and any item in Doing is migrated through the binary.
5. Release v0.26.0.

## Findings that shape the plan

- **SubagentStart is the only writer of the column.** `board-subagent-start.sh:76` writes `$BOARD_COL_DOING`, defaulted at `lib/board.sh:26`. TaskCompleted writes only Done and Blocked (`board-task-completed.sh:185-221`); SubagentStop only Blocked by human (`board-subagent-stop.sh:366-367`). No other hook, command or agent writes it.
- **Live writes are failing today.** In `~/.local/state/coder-fleet/log/hooks.log`, every SubagentStart since 2026-09-26T14:01Z (18 lines) logs `invalid status "In Progress". Configured statuses: To Do, Doing, ...` - CF-8 and BD-41 alike. The installed 0.25.0 still defaults to `Doing`, so `BOARD_COL_DOING="In Progress"` is set in `board.env` or the launching environment (not read here: the config directory is denied to agents). Under decision 2 that override keeps winning: it works on a renamed board and fails on every board still on Doing. The new log line (Phase 1) names the override so the failure reads from the log.
- **No item on this board is in Doing.** The 12 live items are To Do except CF-4 and CF-4.1 (Blocked by human); `.boards/completed` and `.boards/drafts` are empty; no Move commit exists in `git log -- .boards`. CF-9 will not reach Doing while it runs either, because its SubagentStart hits the same override.
- **The binary is already name-agnostic.** Status matching ignores case and spaces (`src/utils/status.ts`); `DEFAULT_STATUSES` is already `["To Do", "In Progress", "Done"]` (`src/constants/index.ts:46`). The commit subject is `Move <id> to <status as the config spells it> on the board`, so it follows the config with no code change. The web UI already treats both names as in progress (`TaskColumn.tsx:140`); `Statistics.tsx`, `TaskList.tsx`, `AcceptanceCriteriaProgress.tsx` and the plain-text icon recognise only "in progress", so renaming improves them. The MCP status enum comes from the config. **The board package gets no change**: its tests use "Doing" as an arbitrary config value and test name-independent behaviour, and leaving it alone means no binary rebuild on any machine.
- **Nothing parses the commit subject** except the board package's own tests and `board-hook-contract.sh:489`, which Phase 1 updates.
- **The config probe.** The hook asks the binary with `board task list --status "<name>" --limit 1 --plain`, which exits 1 with `invalid status "<name>". Configured statuses: ...` when the config does not list the name (`cli.ts:43-47`, `:207`). That code has been in the fork since the import (`c094a3d`), so every installed binary answers it. Rejected: parsing YAML in bash (duplicates `parseConfigListValue` and `resolveBoardRoot`), and a new `board statuses` subcommand (absent from `~/.local/bin/board` until a reinstall, and the shim prefers that binary).
- **CI has no bun.** `.github/workflows/checks.yml` runs `check-all.sh` on bare ubuntu, where the live pass and the board step skip. The new contract cases therefore use a stub shim via `BOARD_SHIM`, which the library honours, so they run in CI; one extra live case checks the stub's error wording against the real binary.
- **Two rules forbid decision 3.** `AGENTS.md:55` says "no agent body and no command writes a status"; `board-conventions/SKILL.md:43` ends "Moving one that already exists is the thing nobody but a hook does"; `docs/fleet-design.md:125` says "status writes are a hook, never an instruction". Each gains a one-clause exception for the human-approved rename. The MCP server's instruction (`server.ts:47`, "never move an item's status") stays: the rename goes through the CLI, not MCP.
- **The rename must list items before it edits the config.** Once the config drops Doing, `task list --status Doing` fails. And every binary commit is `git commit -- .boards`, so an uncommitted config edit would ride in the first Move commit. Order: list, edit config, commit the config alone, then move each item.
- **CF-8 leaves one stale line.** `README.md:39` still says "`SubagentStop` writes Blocked or Blocked by human" (CF-8's Phase 2 grep did not cover `README.md`). The lead folds that into CF-8's fix round; if it is still there when CF-9 starts, CF-9 drops "Blocked or" as part of its own edit of that line.
- **Pinned lines.** `instruction-file-contract.sh` pins `kickoff.md` preflight 3 (line 14) and the design and README lines describing kickoff ("its five statuses"); none names Doing and none is edited. Nothing in the roster or glossary contracts pins Doing; the glossary check compares only the skill to the generated rule.
- **Test environment leak.** `board-hook-contract.sh` points `CODER_FLEET_CONFIG_DIR` at a temp dir, so `board.env` is never read, but an exported `BOARD_COL_DOING` in the shell would leak into the live cases. Phase 1 unsets all five.
- **Ports.** OpenCode's `skill/glossary/SKILL.md:27` changes one word in this item: its register row (`opencode/docs/divergence-register.md:18`) promises "every term and every meaning verbatim", and vocabulary is the fleet's, so a register row would record a divergence nobody chose. Nothing else in OpenCode needs changing: its kickoff has no Board section (register row 192, Deferred), its init writes no board, and `codex/coder-fleet/` is empty. The same OpenCode glossary row already says "The Tasks database" where the source says "The tracked items" - older drift, filed separately.
- **Dated records stay as written**: `docs/plans/coder-fleet-migration-plan.md:496`, `docs/plans/CF-8.md`, `codex/docs/specs/GPTA-1.md:122`, `opencode/docs/specs/opencode-agents-port.md:11`.
- **Plain English, not the column**: `lead.md:25,34`, `scout.md:15`, `spec-writer.md:41`, `board-conventions/SKILL.md:21,79,81`, `humanize/references/style-em-dash.md:19`, `looping/SKILL.md:11`, `run-article/SKILL.md:42`, `review-round.js:1117`, the coder, lead, scout and spec-writer rubrics, `scope-hook-contract.sh:530`, `workflow-logic.mjs:1070`, `docs/agent-contract.md:72`, `docs/fleet-design.md:248`, the codex spike files, the OpenCode copies of those skills, and `enforce-agent-scope.sh:213` ("undoing").

## Agent routing

Phases 1-4 go to one `coder` run: one worktree, one branch, one commit per phase, as CF-8 did. `lead.md` step 2 routes hook code and any phase of a multi-phase plan to `coder`; `tech-writer` cannot reach `claude/`, and `scripter` is excluded by the same multi-phase rule. After the run, a review round over the branch (fix round if it has blocking findings), and `refuter` against Phase 1, since the reviewer cannot run the suite.

Before the spawn, the lead calls `task_focus CF-9`, expecting SubagentStart's move to fail while the human's override still names a column this board does not list. The first commit on the branch adds this plan as `docs/plans/CF-9.md`.

## Phase 1 - the hook resolves the column, test first

**Goal**: with no override, SubagentStart writes "In Progress" when the config lists it (or both), "Doing" when only that is listed, and nothing with a log line when neither is. An explicit `BOARD_COL_DOING` wins and is logged. Dry runs and a disabled board never start the CLI.

**Failing test first**, in `claude/evals/lib/board-hook-contract.sh`:

- After the exports at lines 45-50, add `unset BOARD_COL_TODO BOARD_COL_DOING BOARD_COL_BLOCKED BOARD_COL_BLOCKED_HUMAN BOARD_COL_DONE`.
- Insert a new block `R16` between the library block (ends 432) and `Live backend` (434): `printf '\nSubagentStart: the in-progress column follows the board config\n'`.
  - A stub at `$TMP/stub-board` appends every call to `$STUB_CALLS` and answers:
    - `focus --show`: prints `BD-1`.
    - `task view <id> --json`: prints `{"task":{"id":"<id>"}}`.
    - `task list --status <s> ...`: exits 0 if `<s>` matches an entry of `$STUB_STATUSES` (`|`-separated), ignoring case and spaces; otherwise prints `invalid status "<s>". Configured statuses: ...` to stderr and exits 1. With `STUB_LIST_FAIL=1` it prints `no board here: ...` and exits 1.
    - `task edit <id> -s <s> ...`: the same check, then records `edit <id> <canonical spelling>`.
  - Each case runs `board-subagent-start.sh` with `CODER_FLEET_BOARD=on`, `BOARD_SHIM=$TMP/stub-board`, `cwd:$TMP`, on a fresh `session_id`. Restore `CODER_FLEET_BOARD=off` and remove any `board.env` after the block.
- Cases ("red" = fails before the change):
  - `start-col-in-progress`: statuses `To Do|In Progress|Blocked|Blocked by human|Done`; calls contain `edit BD-1 In Progress`. Red.
  - `start-col-doing`: the same with `Doing`; calls contain `edit BD-1 Doing`. Green today; guards the old name.
  - `start-col-case`: `to do|in progress|done`; an edit is recorded. Red.
  - `start-col-both`: both names listed; `edit BD-1 In Progress` and exactly one `list` call. Red.
  - `start-col-neither`: `To Do|Active|Done`; no edit, `RC -eq 0`, log contains `neither "In Progress" nor "Doing"`. Red.
  - `start-col-override`: `$CODER_FLEET_CONFIG_DIR/board.env` holds `BOARD_COL_DOING=Active`, statuses `To Do|Active|In Progress|Done`; `edit BD-1 Active`, no `list` call, log contains `BOARD_COL_DOING is set`. Red on the log line.
  - `start-col-dry-run`: `BOARD_DRY_RUN=1`; no `list` or `edit` call, log contains `would move BD-1 to In Progress`. Red.
  - `start-col-probe-error`: `STUB_LIST_FAIL=1`, statuses including `Doing`; one `list` call, no edit, `RC -eq 0`. Red.
- Live pass:
  - Line 470: the config lists `"In Progress"`.
  - Lines 488-489 become `live-start-in-progress`: status `In Progress`, subject `Move $ID to In Progress on the board`.
  - Add `live-start-doing-board`: a second repository `$TMP/live-doing` whose config lists `Doing`; SubagentStart moves its item to `Doing` and the log has no `board task list failed` line. This checks the stub's wording against the real binary.

Run `bash claude/evals/lib/board-hook-contract.sh -v` and confirm the red cases fail before the hook is touched.

**Change** `claude/coder-fleet/hooks/lib/board.sh`:

- Lines 22-26: `BOARD_COL_DOING="${BOARD_COL_DOING:-}"`, empty meaning "resolve from the board". The comment says the other four match `/init`'s config and this one is resolved per board. `board.env` is still sourced afterwards (50-53), so a value there or in the environment is an explicit override.
- `board_cli` (299-337): a quiet mode. With `BOARD_CLI_QUIET_INVALID_STATUS=1`, a failure whose stderr starts with `invalid status` is not logged. Keep the `|| rc=$?` errexit discipline and bash 3.2.
- New, after `board_set_status` (373-378):
  - `board_status_listed HOOK NAME` runs `task list --status NAME --limit 1 --plain` with stdout discarded. Returns 0 if listed, 1 if not (the invalid-status failure, unlogged), 2 on any other failure (already logged by `board_cli`).
  - `board_in_progress_column HOOK` prints the column name:
    - `BOARD_COL_DOING` set: log `BOARD_COL_DOING is set to "<v>"; using it rather than the board's statuses` and print `<v>`.
    - Otherwise, if `! board_would_send`: print `In Progress` without starting the CLI.
    - Otherwise probe `In Progress`, then `Doing`; when both are listed, In Progress wins with no second probe.
    - A probe returning 2: return 1 without writing.
    - Neither listed: log `the board's statuses list neither "In Progress" nor "Doing"; nothing moved. Add "In Progress" to statuses in .boards/config.yml, or set BOARD_COL_DOING in board.env` and return 1.
- `claude/coder-fleet/hooks/board-subagent-start.sh`: header lines 2-4 say "into In Progress (or Doing, on a board not yet renamed)". Line 76 becomes `if col="$(board_in_progress_column "$HOOK")"; then board_write "$HOOK" "$page_id" "$col"; fi`.

**Verify**: `bash claude/evals/lib/board-hook-contract.sh -v` passes in full; `bash -n` on both files; `grep -n 'BOARD_COL_DOING' claude/coder-fleet/hooks/*.sh claude/coder-fleet/hooks/lib/board.sh` shows only the library default and the resolver; `bash claude/evals/lib/handoff-parity.sh` still passes.

## Phase 2 - the vocabulary and the prose

- `claude/coder-fleet/skills/glossary/SKILL.md:27` (body): "to do, in progress, blocked, blocked by human, done". Then run `bash claude/scripts/gen-glossary-rule.sh`, which rewrites `templates/rules/glossary.md:33`. Never hand-edit that file.
- `claude/coder-fleet/skills/board-conventions/SKILL.md`:
  - Line 3 (frontmatter): "(to do, in progress, blocked, blocked by human, done)".
  - Line 30: `| In Progress | ...`.
  - Line 35: the hooks accept `Doing` on a board not yet renamed, `/kickoff` offers the rename, and `board.env` overrides are for other spellings.
  - Line 43: the last sentence gains "except the rename `/kickoff` and `/init` make with the human's yes".
  - Line 47: "move an item to in progress".
  - Line 113: the example subject is `Move BD-12 to In Progress on the board`.
- `docs/fleet-design.md`: line 118 the In Progress row; line 125 "`SubagentStart` writes In Progress (Doing on a board not yet renamed)" plus one sentence for the rename exception; line 182 `SubagentStart -> In Progress`.
- `AGENTS.md:55`: "no agent body writes a status, and the only command that does is the human-approved rename in `/kickoff` and `/init`".
- `README.md:39`: "moves a board item to In Progress" (and "`SubagentStop` writes Blocked by human" if CF-8 left it). `README.md:141`: `BOARD_COL_DOING` is unset by default, and SubagentStart writes whichever of `In Progress` or `Doing` the config lists.
- `claude/coder-fleet/hooks/README.md`:
  - Line 7: **In Progress**.
  - Line 36: dependency 3 lists `In Progress` and says `Doing` is accepted.
  - Line 78: `# BOARD_COL_DOING="In Progress"   # unset: whichever of In Progress or Doing the config lists`.
  - Line 294: "moves the item to In Progress".
  - Line 344: an override in `board.env` naming a column the config does not list fails on every spawn, and the log names it.
  - Line 357: item 2 gains the resolution rule: both, neither, override.
  - Line 362: "leaves the item in In Progress".
  - Line 366: item 11 gains the `board task list --status <name> --limit 1` probe.
- `claude/coder-fleet/hooks/hooks.json:2` "moves the item to In Progress" and `:11` `"Moving the board item to In Progress"`; check with `jq . claude/coder-fleet/hooks/hooks.json`.
- `claude/coder-fleet/templates/board.config.yml:5`: `"In Progress"`.
- `opencode/coder-fleet/skill/glossary/SKILL.md:27`: "in progress". No register row, per the findings.

**Verify**: `bash claude/scripts/gen-glossary-rule.sh --check`; `bash claude/evals/lib/roster-contract.sh`; `bash claude/evals/lib/instruction-file-contract.sh`; `git grep -n -i 'to do, doing\|to doing\|in doing\|| Doing |'` returns nothing; `git grep -nw Doing -- . ':!claude/coder-fleet/board' ':!docs/plans' ':!*/docs/specs'` returns only the resolver, the contract's old-name cases, the rename paragraphs and the lines saying the old name is accepted.

## Phase 3 - the rename offer in /kickoff and /init

- `claude/coder-fleet/commands/kickoff.md:28`: the five statuses are `To Do`, `In Progress`, `Blocked`, `Blocked by human`, `Done`. `Doing` in place of or beside `In Progress` is not a failure (the hooks accept it) but triggers the rename offer; any other word is still a failure whose fix is the config.
- `kickoff.md:33`: the last sentence is replaced by a **Rename** paragraph, scoped to this checkout's board (a human with several repositories runs it in each):
  1. From the main checkout, list what moves: `${CLAUDE_PLUGIN_ROOT}/board/board.sh task list --status Doing --plain`.
  2. Show the config change and every id that would move, and ask. On a no, change nothing and say the hooks keep writing Doing here.
  3. On a yes:
     - In `.boards/config.yml`, replace the `Doing` entry with `In Progress` in place; if both are listed, delete `Doing`. The same for `default_status` if it is Doing.
     - Commit that file alone: `git commit -m "Rename Doing to In Progress on the board" -m "Board-Writer: kickoff" -- .boards/config.yml`.
     - Move each listed id with `board.sh task edit <id> -s "In Progress" --by kickoff`, one commit per item.
     - Check with `board.sh task list --status "In Progress" --plain`.
     - If `auto_commit` is not `true`, commit nothing and say so.
  4. Never edit an item file by hand.
- `kickoff.md:41`: `Move BD-12 to In Progress on the board`.
- `claude/coder-fleet/commands/init.md:38`: when `.boards/config.yml` exists and its statuses list `Doing`, offer the rename by following the Rename paragraph of `${CLAUDE_PLUGIN_ROOT}/commands/kickoff.md`, with AskUserQuestion and `--by init`, then skip the rest of the step. New boards get In Progress from the template.

**Verify** with a rehearsal in a scratch directory, using `bun` on the worktree's `src/cli.ts` as the live pass does:

- Set up a repository with the old template's config and two items, one moved to Doing.
- Run the paragraph's commands exactly as written.
- Check: the config lists In Progress; the item is In Progress; `git log --format='%s%x09%(trailers:key=Board-Writer,valueonly)'` shows the config commit and `Move BD-1 to In Progress on the board	kickoff`; `task list --status Doing` now exits 1 with `invalid status`; SubagentStart run against it writes In Progress.
- Paste the output into the handoff.

## Phase 4 - checklist, release, the one suite run

- The board-conventions frontmatter changed, so `coder` reads `claude/coder-fleet/skills/migration-checklist/SKILL.md` and runs the skill-frontmatter checks and the three mechanical commands over it (the dash and wrap scans cover `docs/**`, this plan included), with a findings table for the PR. The glossary frontmatter is unchanged: check with `git diff -U0 main -- claude/coder-fleet/skills/glossary/SKILL.md`.
- Bump `0.26.0` in `claude/coder-fleet/.claude-plugin/plugin.json:5` and `.claude-plugin/marketplace.json:17`. Commit subject: `v0.26.0: the second column is In Progress, and the hooks take either name`. Commits end with the `Co-Authored-By` trailer.
- Run the suite once, with a 300000 ms tool timeout. The worktree guard refuses `${VAR:-default}` expansions and a relative script path, so use an absolute script path and a literal output path:

```bash
bash <absolute worktree path>/claude/evals/lib/check-all.sh > <literal scratch path>/cf-9-check-all.txt 2>&1; echo "exit $?"
```

  Grep the captured file for `FAILED` and `Every deterministic check passes`. Never a second run.
- The lead pushes and opens the PR. The body carries the checklist table, the check-all summary and the Unverified list, and ends with the Claude Code attribution line.

## After merge - this repo's board (lead, with the human)

1. The human updates the plugin to 0.26.0. No binary rebuild is needed.
2. In the main checkout, `board.sh task list --status Doing --plain`, and record the ids (none expected).
3. The lead runs `/coder-fleet:kickoff` there and the human accepts the rename. That carries out decision 4 and tests decision 3 on a real board. If the human would rather not run kickoff, the lead follows the Rename paragraph by hand, through the CLI.
4. Verify: `.boards/config.yml:5` lists `"In Progress"`; `git log -3 --format='%s%x09%(trailers:key=Board-Writer,valueonly)' -- .boards` shows the rename; the next spawn logs `-> In Progress`.
5. The human removes `BOARD_COL_DOING` from `~/.config/coder-fleet/board.env` or their environment once their other boards are renamed. Outside the repository; the human's call.
6. Complete one task marked `[board:CF-9]`, and link the PR on the card.

## Risks

- **The override keeps winning**: until the human removes it, any board still on Doing fails on every spawn, as it does today. The new log line names the variable.
- **One more CLI call per spawn** (two on an old-name board): SubagentStart can make up to five 10-second calls under a 20-second hook timeout. Normal latency is far lower, and a timeout fails soft.
- **The stub's wording can drift from the binary's**: `live-start-doing-board` guards it, but only where bun is installed; CI has no bun.
- **The MCP status enum is built at server start** (`schema-generators.ts`): a session open across the rename may offer Doing until it restarts. Nothing writes a status through MCP.
- **The rename commits land on whatever branch the main checkout has checked out**: kickoff says which branch before it asks.
- **The branch carries board task files** committed to local main, as CF-8's did.
- **The instruction-file contract fails on any edit to a pinned line** and on any new mention of the other instruction-file name, this plan included.

## Resolved questions

1. This repo's rename happens after the merge, through `/kickoff`, as "After merge" says.
2. No `BOARD_COL_IN_PROGRESS`: the variable keeps its name, so the override in use now keeps working.
3. `codex/docs/specs/GPTA-1.md:122` stays as a dated record.
4. The board package's test fixtures stay on "Doing".
