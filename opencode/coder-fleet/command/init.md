---
description: Initialise the current project for the fleet - payload, opencode.json, AGENTS.md skeleton, spec and plan directories, then a guided fill of every placeholder
model: trillian/qwen3-coder-next
---

Initialise this project for the opencode-agents fleet. Work through the five steps in order, report at the end, and never overwrite anything the project already has.

Templates live in this project at `.opencode/template/`. Read each one from there; never reconstruct its content from memory. That path is fixed rather than derived, because OpenCode has no counterpart to Claude Code's `${CLAUDE_PLUGIN_ROOT}` - a command is a markdown file loaded out of a directory and is never told which one.

## 1. The payload

The fleet is five directories under `.opencode/`: `agent/`, `command/`, `skill/`, `plugin/`, `lib/`, plus `template/`. You are reading a file out of `command/`, so at least one copy of the fleet is already reachable. Work out which, because it decides whether there is anything to copy.

- If `.opencode/agent/lead.md` exists in this project, the fleet is already local. Confirm all six directories are present, name any that are missing, and copy nothing.
- Otherwise the fleet is installed globally at `~/.config/opencode/`, and the project is borrowing it. Copy `agent/`, `command/`, `skill/`, `plugin/`, `lib/` and `template/` from there into `./.opencode/`, skipping any file that already exists. Pinning the fleet into the repository is the point: a global install serves only this machine, and a committed `.opencode/` gives every clone the same fleet.
- If neither copy is findable, stop. Say that the fleet payload cannot be located and that the fix is to run `scripts/install-project.sh` from the opencode-agents checkout against this directory.

Do not create `.opencode/.gitignore`, `.opencode/package.json` or `.opencode/node_modules`. OpenCode writes all three itself the next time it loads a config directory, and the `.gitignore` it writes already excludes the other two.

## 2. opencode.json

Merge `.opencode/template/opencode.json` into the project's `opencode.json` at the repository root.

If `opencode.json` does not exist, copy the template as-is. If it exists, add only the keys that are missing - at the top level, and inside `provider`, `permission` and `instructions` - and leave every existing key exactly as it is, including an existing `model`, an existing `default_agent` and any provider the project already declares. A key that is present but differs from the template is a conflict: report it and leave it alone rather than changing it.

Two of those keys are load-bearing and worth naming in the report if you had to add them. `default_agent` is what makes `lead` the agent a session opens as, and is the counterpart of the fleet's `agent` setting. `subagent_depth: 1` is what stops a subagent spawning subagents of its own.

The template names no machine either: the `trillian` provider's `baseURL` is `http://<lm-studio-host>:1234/v1`. If the project's `opencode.json` still holds that placeholder after the merge, leave it and tell the human in the report to replace `<lm-studio-host>` with the address of the machine serving LM Studio; until then no fleet agent can reach its model.

The template carries no credential and must never acquire one. The memory server's entry, with its token, lives in `~/.config/opencode/opencode.json` outside any repository and is rendered there by `scripts/install-home.sh`. If the project's `opencode.json` already holds an `mcp` block with a secret in it, say so in the report - that is a finding, not something to merge around.

## 3. Skeleton and directories

- `.opencode/template/AGENTS.md` -> `AGENTS.md` at the project root. Three cases, and the middle one is the one that goes wrong quietly.
  - Neither `AGENTS.md` nor `CLAUDE.md` exists: copy the template.
  - `CLAUDE.md` exists and `AGENTS.md` does not: do not write `AGENTS.md`. OpenCode reads the first instruction file it finds in the order `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md` and stops there (`packages/opencode/src/session/instruction.ts:64-68`, `:121-131`), so writing the skeleton would silently take the project's existing instructions out of every prompt. Report it, say which sections of the template the existing `CLAUDE.md` lacks - stack, conventions, glossary pointer, where work lives, writing conventions - and let the human decide whether to add them there or rename the file.
  - `AGENTS.md` already exists: do not touch it. Note the skip and list the same missing sections.
- Create `docs/specs/` and `docs/plans/` if missing.

There is no glossary rule to copy. The fleet's glossary is vendored at `.opencode/skill/glossary/SKILL.md` and pushed into every agent's system prompt by `.opencode/plugin/fleet.ts`, so it needs no file in the project and no entry in `instructions`.

## 4. Guided fill

Skip this step entirely if step 3 did not write `AGENTS.md`.

Read the project before asking anything: manifest and lockfiles (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod` or equivalent), build and test configuration, the directory layout, and the last dozen commit subjects. Draft an answer for every `<FILL: ...>` marker in the copied `AGENTS.md` from that evidence.

Then walk the markers with the human using the `question` tool, one topic per question. Put the inferred value first in the options list with `(Recommended)` at the end of its label, which is how OpenCode's own guidance says to mark a recommendation. Markers you could not infer get a question whose options are genuine alternatives rather than a guess dressed up as one. Write each confirmed value into `AGENTS.md` as you go, and delete the marker-explainer paragraph near the top once no markers remain.

If the human declines the interview, fill the markers you inferred with confidence, leave the rest as `<FILL: ...>`, and say which remain.

The `question` tool is only there in an interactive client. A non-interactive `opencode run` installs a blanket `question` deny before the session starts (`packages/opencode/src/cli/cmd/run.ts:426-434`), so the call will be refused rather than answered. If that happens, do not retry it and do not treat it as a failure: fall back to the same behaviour as a declined interview, and say in the report that the interview needs a second pass in the TUI.

## 5. Report

End with a short report: what was created, what was merged and which keys, what was skipped and why, any `opencode.json` conflicts, a `baseURL` still on the `<lm-studio-host>` placeholder, and any markers still unfilled. Remind the human to commit `opencode.json` and `.opencode/` so every clone gets the same fleet.

Then say what comes next, exactly: restart OpenCode. Config, agents, commands and skills are read once when the process first materialises its instance state and are never re-read - nothing watches those files and nothing invalidates that cache - so none of the above is live in a session that is already running. There is no folder to trust; OpenCode has no such step. In the new session run `/kickoff` to verify the install and start the first piece of work.

Re-running this command is safe: every step skips what already exists, and step 4 only offers markers still present.
