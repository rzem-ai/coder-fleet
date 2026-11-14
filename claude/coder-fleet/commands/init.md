---
description: Initialise the current project for the fleet - settings, AGENTS.md skeleton, glossary rule, the board, then a guided fill of every placeholder
---

Initialise this project for the fleet. Work through the five steps in order, report at the end, and never overwrite anything the project already has.

Templates live in this plugin at `${CLAUDE_PLUGIN_ROOT}/templates/`. Read each one from there; never reconstruct its content from memory.

## 0. Repository

Run `git rev-parse --is-inside-work-tree` at the project root before anything else.

If it prints `true`, compare `git rev-parse --show-toplevel` with the current directory. When they match, say nothing and continue. When they differ, this directory sits inside a repository rooted elsewhere; the fleet initialises a repository root, not a subdirectory. Say where the root is and ask, with AskUserQuestion, whether to run the remaining steps at that root or stop.

If it is not a repository, the fleet cannot work here: coder worktrees, review-round diffs, run articles and the `[board:...]` task markers all assume git. Ask, with AskUserQuestion, whether to initialise one - `git init -b main` - or stop. On yes, run exactly that and continue; the first commit stays the human's, made after this command has created the skeleton, which the report already reminds them to do. On no, stop here and say that every later step assumes a repository.

## 1. Settings

Merge the five keys from `${CLAUDE_PLUGIN_ROOT}/templates/project-settings.json` into the project's `.claude/settings.json`:

- `agent` (`coder-fleet:lead`)
- `worktree.baseRef` (`"head"`), added inside an existing `worktree` object when there is one. Claude Code's default, `"fresh"`, cuts every agent worktree from origin's default branch, whatever the fleet's base branch is, so a local base branch that is ahead of the remote leaves each coder behind it. `"head"` cuts from the local HEAD.
- `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` (`"1"`), added inside an existing `env` object when there is one. Claude Code turns `TaskCreate` and `TaskUpdate` off for current models without it, and a task whose subject carries the `[board:<id>]` marker, completed with `TaskUpdate`, is how the lead closes a card no coder's stop moved to Done.
- `permissions.allow` rules `Read(~/.config/boards/**)`, `Edit(~/.config/boards/*/specs/**)` and `Edit(~/.config/boards/*/runs/**)`, each added to an existing `allow` list when there is one, so agents read the board and write specs and run articles in its directory without a prompt; an `Edit` rule covers the Write tool too. Nothing gets `Edit` on the cards or the board's `config.yml`: those change only through the `boards` binary, its MCP tools, CLI and hooks, which permission rules do not govern. When `XDG_CONFIG_HOME` is set to an absolute path in this shell, the board lives under it instead, so write the same three rules with `//<XDG_CONFIG_HOME>/boards/` in place of `~/.config/boards/`, its value without its leading `/` after the `//`.
- `extraKnownMarketplaces.rzem`

If `.claude/settings.json` does not exist, copy the template as-is. If it exists, add only the keys that are missing and leave every existing key exactly as it is - including an existing `agent`, an existing `rzem` marketplace entry, and any other plugins. A key that is present but differs from the template is a conflict: report it and leave it alone rather than changing it.

Do not add `enabledPlugins`. The plugin is enabled at user scope on each machine, and a project-scope enable mints a separate install record for every path that carries it, including every agent worktree, each pinned to whatever version was current. If the project already enables `coder-fleet@rzem` in `.claude/settings.json` or `.claude/settings.local.json`, say so in the report and explain that cost; removing it is the human's call, because a project that runs on Claude Code on the web needs the committed enable to get the fleet there at all.

## 2. Skeleton

- `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md` -> `AGENTS.md` at the project root. If an `AGENTS.md` already exists, do not touch it - note the skip and, in the final report, list which sections of the template (stack, conventions, glossary pointer, where work lives, worktree setup, writing conventions) the existing file lacks, so the human can decide what to add. If a `CLAUDE.md` exists at the project root and no `AGENTS.md` does, offer with the AskUserQuestion tool to rename it to AGENTS.md (recommended: Claude Code reads only `CLAUDE.md` when both exist, so a new `AGENTS.md` beside it would never load) or to leave it and skip the skeleton; on rename, append the template sections the file lacks, marked, and continue to the marker walk.
- When an existing `AGENTS.md` was skipped and has no line starting `Requirements source: `, ask with AskUserQuestion whether the project has approved requirements. On a yes, and with the path from the human, name in the report the exact line to add under its `Where work lives` section, `Requirements source: <path>`, since this command does not touch that file; on a no, say nothing more.
- `${CLAUDE_PLUGIN_ROOT}/templates/rules/glossary.md` -> `.claude/rules/glossary.md`. If it exists but differs from the template, replace it - the file is generated and the plugin's copy is current; never hand-merge it.
- Make no spec or run-article directory: specs and run articles live in the board's directory under `~/.config/boards` (step 2b), outside the repository.

## 2a. The fleet's files out of history

The fleet keeps its own files in the project out of the project's history, always, with no question about it: the fleet's agent memory (`.claude/agent-memory/coder-fleet-*/`), each rule file this plugin installs under `.claude/rules/`, and `.claude/coder-fleet.json`. They are listed in the common git dir's `info/exclude`, which every linked worktree shares and which is never committed. Memory stays in the checkout that wrote it, so memory an agent writes in its own worktree goes when that worktree is removed. `.claude/settings.json` and `AGENTS.md` are not listed and stay committed. Never write a `.gitignore` line for any of them, and never edit `info/exclude` by hand: one script does it.

Run `"${CLAUDE_PLUGIN_ROOT}/boards/boards.sh" fleet exclude status` from the project root. Its last line is the state:

- `state: excluded`: nothing to do. Say so.
- `state: not-excluded`: run `"${CLAUDE_PLUGIN_ROOT}/boards/boards.sh" fleet exclude write`, which adds each missing entry once, and keep its `added` lines for the report.
- `state: needs-migration`: an earlier `/init` left some of these files tracked, or left its old `.gitignore` lines (`docs/runs/`, `.boards/`, `.claude/agent-memory/`). The `tracked` and `gitignore` lines name them. Say what will be untracked and which lines removed, then ask once, with AskUserQuestion. Question: "Untrack the fleet's files in one commit on the current branch? They stay on disk here, but another clone that pulls the commit has them removed from its working tree, and gets the rules and config back by re-running /init." Options: **Migrate (Recommended)**, "`git rm --cached` every path listed, remove the old `.gitignore` lines, write the exclude, and commit the removals and the `.gitignore` change as one commit"; **Not now**, "Change nothing; the project stays half set up". On migrate, run `"${CLAUDE_PLUGIN_ROOT}/boards/boards.sh" fleet exclude migrate` and keep its lines for the report. Exit 1 is a refusal that changed nothing: something else is staged, or this is a linked worktree; pass its reason on and ask the human to deal with it, then re-run `/init`. Exit 3 means a git step failed and what it changed was put back; pass the message on. On not now, change nothing and say plainly in the report that the project is half set up: the fleet's files are still tracked, and re-running `/init` asks again.

## 2b. Board

The board lives outside the repository, in `~/.config/boards/<PREFIX>/` (`$XDG_CONFIG_HOME/boards/<PREFIX>/` when that is set), one board per repository, shared by its main checkout and every worktree. It holds the cards, the board's config, its event trail, the specs in `specs/` and the run articles in `runs/`, on this machine only. Run `"${CLAUDE_PLUGIN_ROOT}/boards/boards.sh" where` from the project root.

- Exit 0: it prints the board's key, prefix and directory. Say them, and skip the next bullet.
- Any other exit but 127: this repository has no board. A board is made only by the human, who chooses its id prefix, so make none yourself. Say that the human makes it by running `boards.sh init` from the project root in their own terminal, giving the full path of the plugin's `boards/boards.sh`, or from the web UI; it asks for a prefix, a letter then up to nine letters or digits, unique on the machine, which never changes. Then skip the rest of this step and of step 3a, and say in the report that the board is still to be made.
- Exit 127: the `boards` binary will not run here. Say so, and that the session-start fetch puts the release build in place for the next session; skip the rest of this step and step 3a.

With a board, read its `config.yml`. When it has no `test:` line, offer one with AskUserQuestion: the project's test command, which the test gate runs on the tagged commit of every release that names cards on its `Cards:` line before it moves them from Done to Released. Offer the whole-suite command from the `gates` block of `AGENTS.md` as the recommended option. On an answer, add `test: <command>` to that `config.yml` by hand, changing nothing else; the board reads it each time a run starts. On a skip, say that no release moves a card to Released until the line is there.

Renumber nothing: step 3 below stays step 3. Nothing of the board's is ever in the repository, so there is nothing to commit for it.

## 3. Guided fill## 3. Guided fill

Skip this step entirely if step 2 skipped `AGENTS.md`.

Read the project before asking anything: manifest and lockfiles (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` or equivalent), build and test configuration, the directory layout, and the last dozen commit subjects (none, in a repository step 0 just created). Draft an answer for every `<FILL: ...>` marker in the copied `AGENTS.md` from that evidence.

Then walk the markers with the human using the AskUserQuestion tool, one topic per question, offering the inferred value as the recommended option. Markers you could not infer get an open question, not a guess. The `Worktree setup` section is always asked, never inferred silently: a fresh agent worktree holds only tracked files, so ask how it gets its dependencies (an install command, symlinks to the main checkout's `node_modules`, a script) or whether none are needed, and offer what the lockfiles suggest as the recommended option. `none needed` is a complete answer. The `Requirements source` line in `Where work lives` is also always asked, never inferred, because the line alone skips `spec-writer` for every item: ask whether the project has approved requirements and where they are, write the path on a yes, and on a no delete the line and the paragraph after it. The `App start` and `App url` lines are inferred from a `start` or `dev` script or the README's run instructions and confirmed like any other marker; on a project with nothing a user drives, such as a library, delete both lines and the paragraph after them, and the reviewer never runs in use mode. On a project with a client UI - a web front end, a desktop or mobile app, any screen a user drives - an `App start` line the human declines or leaves unfilled means the reviewer's use mode will not run, so no acceptance criterion on that UI is checked in the running product and a UI change rests on a screenshot the lead compares by hand: say so, recommend the line, and put that in the report. Write each confirmed value into `AGENTS.md` as you go, and delete the marker-explainer paragraph near the top once no markers remain.

If the human declines the interview, fill the markers you inferred with confidence, leave the rest as `<FILL: ...>`, and say which remain. Always leave the `Worktree setup` marker: it is never inferred, and an unfilled one is what tells kickoff and coders the setup is unknown. Leave the `Requirements source` marker too, for the same reason: kickoff fails on it until the human fills the line or deletes it.

## 3a. Definition of Done

This step runs whether or not step 3 did, after it, so it reads the gates block as the walk left it, and only when step 2b found a board. Read the `defaults` in the board's `config.yml`: its project-wide acceptance criteria and Definition of Done, under `criteria:` and `dod:`, which every open card shows live, unticked until ticked on that card, and which a change in the file changes on every card at once.

When there is no `dod:` list, offer one with AskUserQuestion. Question: "Give this board a project-wide Definition of Done?" Options: **Add it (Recommended)**, a list of three items: `The reviewer approved, with a break round where the lead's step 4 calls for one`; `The gates declared in AGENTS.md (<names>) are green on the branch`, with every gate's name in block order, the last two joined by `and`, or `The gates declared in AGENTS.md are green on the branch` when the block has only markers or is missing; and `The spec is linked, where there is one`; **Leave it**, "Add nothing". On add, write the list under `defaults:` in `config.yml` by hand and change nothing else. A card carries every item, so the card gate holds a card in In Progress until each one is ticked. Either way, say in the report what this step changed, or that it changed nothing.

## 4. Report## 4. Report

End with a short report: whether step 0 created a repository, what was created, what was merged and which keys, what was skipped and why, any settings conflicts, and any markers still unfilled. Say what step 2a did - the entries it added to `info/exclude`, the migration commit and what it untracked, or that the project is half set up - and what step 2b found: the board's prefix and directory, its `test:` line, or that the board is still the human's to make. Remind the human to commit `.claude/settings.json` and `AGENTS.md`, so every clone and every Claude Code on the web session gets the same fleet; the board, the specs, the run articles and the agents' memory stay on this machine and reach no other clone. Then tell them where the three optional settings live: The base branch, push policy and release setting are `baseBranch`, `push` and `release` in `.claude/coder-fleet.json` in the main checkout, which the fleet keeps out of the project's history; `/coder-fleet:agents base`, `push` and `release` show each and set it. None of them goes in `AGENTS.md`, so a project whose `AGENTS.md` is not the human's to edit needs nothing in it for these. When this repository has a board under `~/.config/boards` (`$XDG_CONFIG_HOME/boards` when that is set), say that the board's Stop hook is on for it: when the main session stops with the focused card's acceptance criteria still unticked and nothing waiting on the human, it sends the lead back once, and `sendBackAtStop: false` in that board's `config.yml` turns it off.

Then say what comes next, exactly: restart Claude Code and trust the folder - the new settings, `AGENTS.md` and (if it was not already installed) the plugin all load at session start, so nothing done here is live until then - and in the new session run `/coder-fleet:kickoff` to verify the install and start the first piece of work.

Re-running this command is safe: every step skips what already exists, step 0 is silent in a repository, step 3 only offers markers still present, and steps 2b and 3a ask only while the board lacks a `test:` line or a `dod:` list.
