---
description: Initialise the current project for the fleet - settings, AGENTS.md skeleton, glossary rule, spec directory, then a guided fill of every placeholder
---

Initialise this project for the fleet. Work through the five steps in order, report at the end, and never overwrite anything the project already has.

Templates live in this plugin at `${CLAUDE_PLUGIN_ROOT}/templates/`. Read each one from there; never reconstruct its content from memory.

## 0. Repository

Run `git rev-parse --is-inside-work-tree` at the project root before anything else.

If it prints `true`, compare `git rev-parse --show-toplevel` with the current directory. When they match, say nothing and continue. When they differ, this directory sits inside a repository rooted elsewhere; the fleet initialises a repository root, not a subdirectory. Say where the root is and ask, with AskUserQuestion, whether to run the remaining steps at that root or stop.

If it is not a repository, the fleet cannot work here: coder worktrees, review-round diffs, run articles and the `[board:...]` task markers all assume git. Ask, with AskUserQuestion, whether to initialise one - `git init -b main` - or stop. On yes, run exactly that and continue; the first commit stays the human's, made after this command has created the skeleton, which the report already reminds them to do. On no, stop here and say that every later step assumes a repository.

## 1. Settings

Merge the four keys from `${CLAUDE_PLUGIN_ROOT}/templates/project-settings.json` into the project's `.claude/settings.json`:

- `agent` (`coder-fleet:lead`)
- `worktree.baseRef` (`"head"`), added inside an existing `worktree` object when there is one. Claude Code's default, `"fresh"`, cuts every agent worktree from `origin/<default-branch>`, so a local main that is ahead of the remote leaves each coder behind it. `"head"` cuts from the local HEAD.
- `env.CLAUDE_CODE_ENABLE_TODO_TOOLS` (`"1"`), added inside an existing `env` object when there is one. Claude Code turns `TaskCreate` and `TaskUpdate` off for current models without it, and a `[board:<id>]` task completed with `TaskUpdate` is the only route to Done.
- `extraKnownMarketplaces.rzem`

If `.claude/settings.json` does not exist, copy the template as-is. If it exists, add only the keys that are missing and leave every existing key exactly as it is - including an existing `agent`, an existing `rzem` marketplace entry, and any other plugins. A key that is present but differs from the template is a conflict: report it and leave it alone rather than changing it.

Do not add `enabledPlugins`. The plugin is enabled at user scope on each machine, and a project-scope enable mints a separate install record for every path that carries it, including every agent worktree, each pinned to whatever version was current. If the project already enables `coder-fleet@rzem` in `.claude/settings.json` or `.claude/settings.local.json`, say so in the report and explain that cost; removing it is the human's call, because a project that runs on Claude Code on the web needs the committed enable to get the fleet there at all.

## 2. Skeleton

- `${CLAUDE_PLUGIN_ROOT}/templates/AGENTS.md` -> `AGENTS.md` at the project root. If an `AGENTS.md` already exists, do not touch it - note the skip and, in the final report, list which sections of the template (stack, conventions, glossary pointer, where work lives, worktree setup, writing conventions) the existing file lacks, so the human can decide what to add. If a `CLAUDE.md` exists at the project root and no `AGENTS.md` does, offer with the AskUserQuestion tool to rename it to AGENTS.md (recommended: Claude Code reads only `CLAUDE.md` when both exist, so a new `AGENTS.md` beside it would never load) or to leave it and skip the skeleton; on rename, append the template sections the file lacks, marked, and continue to the marker walk.
- When an existing `AGENTS.md` was skipped and has no line starting `Requirements source: `, ask with AskUserQuestion whether the project has approved requirements. On a yes, and with the path from the human, name in the report the exact line to add under its `Where work lives` section, `Requirements source: <path>`, since this command does not touch that file; on a no, say nothing more.
- `${CLAUDE_PLUGIN_ROOT}/templates/rules/glossary.md` -> `.claude/rules/glossary.md`. If it exists but differs from the template, replace it - the file is generated and the plugin's copy is current; never hand-merge it.
- Create `docs/specs/` if missing.

## 2b. Board

The board is this repository's, at `.boards/`, committed like any other project file, and the fleet's hooks and the board MCP server find it from the working directory through git. Create it here so the first `/kickoff` has one to check.

- If `.boards/config.yml` exists, say so and skip the rest of this step. If its `statuses` list `Doing`, first offer the rename by following the Rename paragraph of `${CLAUDE_PLUGIN_ROOT}/commands/kickoff.md`, with AskUserQuestion and `--by init` in place of `--by kickoff` (and `Board-Writer: init` on the config commit). If its `statuses` lack `Next`, then offer to add it by following the Next paragraph of `${CLAUDE_PLUGIN_ROOT}/commands/kickoff.md`, with AskUserQuestion and `Board-Writer: init` on the config commit. A new board gets `In Progress` and `Next` from the template.
- Otherwise copy `${CLAUDE_PLUGIN_ROOT}/templates/board.config.yml` to `.boards/config.yml` and `${CLAUDE_PLUGIN_ROOT}/templates/board.gitignore` to `.boards/.gitignore`, and create `.boards/tasks/`, `.boards/docs/` and `.boards/milestones/`, each holding a `.gitkeep` so an empty directory survives a clone.
- Set `project_name` in the copied config to the repository's directory name. Then offer the prefix with AskUserQuestion: `BD` (recommended) or a short upper-case one derived from the repository name, two to four letters. Write the answer as `task_prefix`.
- Say that the config carries a default Definition of Done under `definition_of_done:` - checks pass, a reviewer approved, docs updated, the spec linked where there is one - which every new item starts with, unticked, and that the human changes it by editing that list in `.boards/config.yml`, which reaches items created afterwards.
- Say that the config switches on `require_acceptance_criteria: true`, so the board refuses to create an item with no acceptance criteria from the CLI, MCP `task_create` or the web UI, Drafts included, and that the human turns it off by setting `require_acceptance_criteria: false` in `.boards/config.yml`.
- Say that every write the binary makes will be committed on the checked-out branch, and that `auto_commit: false` in the config or `CODER_FLEET_BOARD_NO_COMMIT=1` in a shell turns that off.
- Say that the first commit here may end up being the board's own, if a hook fires before the human commits; that is harmless.

Renumber nothing: step 3 below stays step 3. Add `.boards/` to the reminder in step 4's report, alongside `.claude/settings.json`, as something to commit.

## 3. Guided fill

Skip this step entirely if step 2 skipped `AGENTS.md`.

Read the project before asking anything: manifest and lockfiles (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` or equivalent), build and test configuration, the directory layout, and the last dozen commit subjects (none, in a repository step 0 just created). Draft an answer for every `<FILL: ...>` marker in the copied `AGENTS.md` from that evidence.

Then walk the markers with the human using the AskUserQuestion tool, one topic per question, offering the inferred value as the recommended option. Markers you could not infer get an open question, not a guess. The `Worktree setup` section is always asked, never inferred silently: a fresh agent worktree holds only tracked files, so ask how it gets its dependencies (an install command, symlinks to the main checkout's `node_modules`, a script) or whether none are needed, and offer what the lockfiles suggest as the recommended option. `none needed` is a complete answer. The `Requirements source` line in `Where work lives` is also always asked, never inferred, because the line alone skips `spec-writer` for every item: ask whether the project has approved requirements and where they are, write the path on a yes, and on a no delete the line and the paragraph after it. Write each confirmed value into `AGENTS.md` as you go, and delete the marker-explainer paragraph near the top once no markers remain.

If the human declines the interview, fill the markers you inferred with confidence, leave the rest as `<FILL: ...>`, and say which remain. Always leave the `Worktree setup` marker: it is never inferred, and an unfilled one is what tells kickoff and coders the setup is unknown. Leave the `Requirements source` marker too, for the same reason: kickoff fails on it until the human fills the line or deletes it.

## 4. Report

End with a short report: whether step 0 created a repository, what was created, what was merged and which keys, what was skipped and why, any settings conflicts, and any markers still unfilled. Remind the human to commit `.claude/settings.json` and `.boards/` (and the rest) so every clone and every Claude Code on the web session gets the same fleet.

Then say what comes next, exactly: restart Claude Code and trust the folder - the new settings, `AGENTS.md` and (if it was not already installed) the plugin all load at session start, so nothing done here is live until then - and in the new session run `/coder-fleet:kickoff` to verify the install and start the first piece of work.

Re-running this command is safe: every step skips what already exists, step 0 is silent in a repository, and step 3 only offers markers still present.
