---
description: Preflight the fleet in this project - plugin, agents, settings, skeleton - check or set up the board and state its conventions, then take the first idea and start the spec pipeline on it
argument-hint: [the idea, in a sentence or a brain dump]
---

Kick off fleet work in this project. Run the preflight first, and start work only if it comes back green. This command is what `/coder-fleet:init` points at after its restart, so assume nothing - the point of the preflight is to catch a half-finished setup.

## Preflight

Check each of these, collecting results rather than stopping at the first failure:

1. **Plugin.** The coder-fleet agents are available (`scout`, `spec-writer`, `coder`, `reviewer`, `refuter`, `ui-designer`, `tech-writer`, `researcher`, `fleet-steward` and `lead` appear as `coder-fleet:` agent types). If they are missing, the plugin is not installed or the marketplace cache is stale.
2. **Lead.** `.claude/settings.json` exists and sets `agent` to `coder-fleet:lead`. Note, without failing, if the current session is visibly not running as the lead - that means the settings changed since the session started and a restart is needed. Then check that `TaskUpdate` is among this session's own tools. Without it no `[board:<id>]` task can be completed and no item ever reaches Done, and on current models Claude Code offers it only when `CLAUDE_CODE_ENABLE_TODO_TOOLS` is set. `TaskUpdate` missing fails this step: name that cause, offer to add `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` (`"1"`) to the project's `.claude/settings.json` and add it only on the human's yes, tell the human that user scope is set by re-running `claude/scripts/install-home.sh` from their coder-fleet checkout (you cannot write `~/.claude/settings.json`), and say a new session is needed, because env is read at startup. With `TaskUpdate` present, a project file that lacks the key is a note, not a failure: the user-scope setting is covering it.
3. **Skeleton.** `AGENTS.md` exists at the project root and contains no `<FILL: ...>` markers. A marker left in place is a line the session reads literally on every turn, so surviving markers are a failure, not a note. Then check for a shadow: a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the project root or any directory above it, up to `/` - Glob each of the three names in each directory, or run `d=$PWD; while :; do for f in CLAUDE.md .claude/CLAUDE.md CLAUDE.local.md; do [ -e "$d/$f" ] && [ "$d/$f" != "$HOME/.claude/CLAUDE.md" ] && echo "$d/$f"; done; [ "$d" = / ] && break; d=$(dirname "$d"); done` from the root, which prints every shadow and nothing else. `~/.claude/CLAUDE.md` does not count, even though the walk passes the home directory: it is the user's global file and loads alongside `AGENTS.md`. A `CLAUDE.md` directly in the home directory does count. If a shadow exists, the check fails and names the path, with the fix: rename that file to `AGENTS.md` (at the project root, where an `AGENTS.md` already exists, merge its content into that file and delete it), or set the project-instructions setting to `claude-md-and-agents-md` so Claude Code reads both (the `instructionFiles` option of the built-in `agents-md` plugin, reachable through `/config`); until then Claude Code reads the shadow and ignores `AGENTS.md` without a message.
4. **Glossary rule.** `.claude/rules/glossary.md` exists.
5. **Work directory.** `docs/specs/` exists.
6. **Board.** The full check-and-setup is its own step below; here just note whether the board binary answers at all - `${CLAUDE_PLUGIN_ROOT}/board/board.sh --version`. No binary means no board, which is fine and is not a failure.
7. **Worktree base.** Read `worktree.baseRef` from `.claude/settings.local.json`, then `.claude/settings.json`; the first that sets it wins. `"head"` passes. Absent or `"fresh"` is a note, not a failure: agent worktrees are cut from `origin/<default-branch>`, so a local main that is ahead of the remote leaves every coder behind it. Offer to set `"head"`, which cuts them from the local HEAD, and say that from a feature branch the worktrees stack on that branch. Ask with AskUserQuestion and change nothing except on the human's yes; only on the human's yes, merge `{"worktree": {"baseRef": "head"}}` into the project's `.claude/settings.json` without touching another key, and say a restart is needed. On a no, say the setting is left on the default and do not ask again this run. Then check that `AGENTS.md` has a `Worktree setup` section with no `<FILL: ...>` marker left in it; a missing section is a note, and the fix is to add it from `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md`.

If anything failed: report every failure with its one-line fix (`/coder-fleet:init` for missing skeleton pieces, restart-and-trust for a plugin or agent problem, edit the marker for a surviving `<FILL: ...>`, rename the shadowing file to `AGENTS.md` for a shadow), and stop. Do not start work on a red preflight.

## Board

Run this step only when `${CLAUDE_PLUGIN_ROOT}/board/board.sh --version` succeeds. On a machine where the binary has never been built it will not, and that is a legitimate outcome: say so and move on. Read the `board-conventions` skill first; it is the contract this step is verifying. No board is a legitimate outcome throughout - most work is not board work, and the human declining any part of this is a note in the report, never a failure.

**Check.** The board is this repository's, at `.boards/` in the main checkout, so everything here is a file read:

- `.boards/config.yml` exists. If it does not, say that `/init` creates it and stop the step; do not write it yourself.
- Its `statuses` are the five the fleet uses, spelled `To Do`, `In Progress`, `Blocked`, `Blocked by human`, `Done`. The hooks match them ignoring case, so a difference in case is not a failure. `Doing` in place of or beside `In Progress` is not a failure either - the hooks accept it - but it triggers the offer under Rename below. Any other word is a failure, and the fix is the config rather than a `BOARD_COL_*` override in `~/.config/coder-fleet/board.env` - the override leaves every other reader seeing the odd name.
- No `BOARD_COL_*` override in `~/.config/coder-fleet/board.env` names a column the config does not list. You cannot read that file, by design: permissions and the sandbox both hide the directory, so do not try. The `board-env-check.sh` hook reads it at session start, and each mismatch it found is a `board.env check:` line in this session's context, or in `grep -F '[BoardEnvCheck]' ~/.local/state/coder-fleet/log/hooks.log | tail -5` for a line naming this repository's path. Each one is a failure of this step, not of the preflight: report the variable and its value with the fix the line gives, and ask the human to fix it before the first `task_focus`, because until then every hook move to that column fails.
- Its `labels` carry `outcome/shipped`, `outcome/abandoned` and `outcome/superseded`.
- `.boards/.gitignore` ignores `.focus`. Without it, a focus lands in a commit and follows the branch around.
- `git check-ignore -q .boards` fails, or say that the board is gitignored here and so is per checkout and dies with the clone - allowed, and worth saying once.

**Setup.** Say what is missing and ask the human before changing anything. On a yes: add the missing `outcome/*` labels to `labels`, add the `.gitignore`, and leave the change for the binary's next commit or commit it yourself with `git add .boards && git commit -m "Add the board config"`.

**Rename.** When the `statuses` list still has `Doing`, offer to rename it to `In Progress`. The offer covers this checkout's board only; a human with several repositories runs it in each. Everything runs from the main checkout, and the commits land on whatever branch is checked out there, so say which branch that is before you ask.

1. List what would move: `${CLAUDE_PLUGIN_ROOT}/board/board.sh task list --status Doing --plain`. List before editing anything - once the config drops `Doing`, this command fails.
2. Show the config change and every id that would move, and ask with AskUserQuestion. On a no, change nothing and say the hooks keep writing `Doing` on this board.
3. On a yes:
   - First decide whether anything is committed. If `auto_commit` is not `true` in the config, the board is gitignored (the check above), or `CODER_FLEET_BOARD_NO_COMMIT=1` is set, make no git commit: edit the config and move the items as below, skip the config commit, and say the rename is left uncommitted. The binary makes no commit in those cases either.
   - In `.boards/config.yml`, replace the `Doing` entry in `statuses` with `In Progress`, in place; if both are listed, delete `Doing`. Do the same for `default_status` if it is `Doing`.
   - When the first bullet found commits on, commit that file alone: `git commit -m "Rename Doing to In Progress on the board" -m "Board-Writer: kickoff" -- .boards/config.yml`. It has to be committed before any item moves, because every commit the binary makes takes everything under `.boards`. If that commit fails, say why and carry on moving the listed items rather than leave the board half-renamed; the config edit then rides in the first move's commit. With no items to move there is no such commit, so the config stays uncommitted: tell the human to commit it with `git add .boards/config.yml && git commit -m "Rename the Doing column to In Progress"` rather than leave it for a hook, whose next write would sweep it into a `Move <id>` commit.
   - Move each listed id with `${CLAUDE_PLUGIN_ROOT}/board/board.sh task edit <id> -s "In Progress" --by kickoff`; the binary commits each move on its own when commits are on.
   - Check with `${CLAUDE_PLUGIN_ROOT}/board/board.sh task list --status "In Progress" --plain`.
4. Never edit an item file by hand.

Any other `statuses` repair is not yours to make here - renaming a status under live items is not a kickoff-sized change beyond this one.

**State the conventions.** End the board section by saying, concretely, what the fleet will use - so the session and the human agree before the first item is filed:

- that the board is `.boards/` in this repository and the items are the files under `.boards/tasks/`,
- the prefix from the config, so an item is `BD-12` and a sub-item `BD-12.1`,
- the five status names as the config spells them,
- labels: `outcome/shipped`, `outcome/abandoned` and `outcome/superseded` on an item at close, nothing else load-bearing,
- that every write the binary makes is a commit on the checked-out branch, `Move BD-12 to In Progress on the board` with a `Board-Writer: SubagentStart` trailer, never pushed,
- and the binding: call `task_focus BD-12` (or the human runs `/work BD-12`) before spawning against an item, and only a task subject carrying `[board:BD-12]` closes one.

**What this step cannot do, said out loud.** It can see the shim answer, but not whether the binary that shim found is the one this plugin version expects. The binary is built into `~/.local/bin/board` by `claude/scripts/install-home.sh` and never committed, so a plugin update reaches a machine long before a rebuild does. End with the one manual check: `~/.local/bin/board --version` against the `version` in `${CLAUDE_PLUGIN_ROOT}/board/package.json`. If they differ, re-run the installer. A `board shim missing at ...` line, a `no board here` line, or a `board <cmd> failed (exit N): ...` line in `~/.local/state/coder-fleet/log/hooks.log` after the first real spawn is the symptom of a board the hooks cannot reach. A card comment starting `Not moved.` is the symptom of a column the board refuses: the hook says it once per session, and names the override when one produced the column.

## The idea

The text after the command is the idea. If there is none, ask the human one open question - what are we building, in a sentence or a brain dump, messy is fine - and wait. Do not invent a task, and do not substitute a repo TODO for an answer.

## Start

With a green preflight and an idea in hand, start the fleet's intake as the lead's routing says: an unshaped idea goes to `spec-writer`, whose interview opens the problem out before the spec closes it down - the `spec-to-card` flow. Recall from the memory server and send `scout` ahead if the idea touches existing code, then spawn `spec-writer` with the idea verbatim, not paraphrased. From there the normal pipeline holds: the human edits and approves the spec, its acceptance criteria go on the card, and a `coder` runs only once the human orders the item.

Report the preflight result either way - one line per check when green, the failure list when not.
