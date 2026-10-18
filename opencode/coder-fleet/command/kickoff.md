---
description: Preflight the fleet in this project - agents, config, skeleton, preloads and model - then take the first idea and start the spec pipeline on it
model: trillian/qwen3-coder-next
---

Kick off fleet work in this project. Run the preflight first, and start work only if it comes back green. This command is what `/init` points at after its restart, so assume nothing - the point of the preflight is to catch a half-finished setup.

The idea, if the human gave one on the command line: $ARGUMENTS

## Preflight

Check each of these, collecting results rather than stopping at the first failure.

1. **Agents.** All nine fleet agents load: `lead`, `scout`, `spec-writer`, `coder`, `reviewer`, `refuter`, `ui-designer`, `tech-writer` and `researcher`. `scripter`, `fleet-steward` and the spec and tech editors are not ported, so their absence is correct rather than a failure. Read the list from `opencode debug agents` rather than from what you believe is in your own context, because that command reads the files on disk and your context is whatever they said when the process started. A missing name almost never means a missing file here: a frontmatter value that fails OpenCode's schema makes the whole agent decode to nothing and the agent simply does not appear, with no warning and no error. So the fix for a missing name is to look at that body's frontmatter, not to reinstall anything.
2. **Lead.** `opencode.json` sets `default_agent` to `lead`. Note, without failing, if the current session is visibly not running as the lead - that means the config changed since the process started and a restart is needed.
3. **Skeleton.** `AGENTS.md` exists at the project root and contains no `<FILL: ...>` markers. A marker left in place is a line the session reads literally on every turn, so surviving markers are a failure, not a note. If the project has a `CLAUDE.md` and no `AGENTS.md`, that is a failure: OpenCode 2.x reads `AGENTS.md` and never `CLAUDE.md`, so every session runs without the project's instructions. Say so, and name `/init` as the fix.
4. **Preloads.** `.opencode/plugin/fleet.ts` exists, and so do `.opencode/skill/handoff/SKILL.md` and `.opencode/skill/glossary/SKILL.md`. Say plainly what this check does not cover: whether the plugin actually loaded and actually appended both bodies to the system prompt is not observable from inside a session, and there is no equivalent of the fleet's glossary-rule file to look for. Three files being present is weaker evidence than the check it replaces, and reporting it as though it were equivalent would be worse than reporting it as what it is. The one thing that does prove it is a subagent emitting a conforming handoff without ever calling `skill`, which happens on the first real spawn rather than here.
5. **Work directories.** `docs/specs/` exists.
6. **The model pin answers.** Run one trivial completion against the pinned model and require non-empty text back. This is the check the fleet never needed and this platform cannot do without: LM Studio on trillian serves four slots out of one shared pool, and a saturated box returns exit 0 with an empty assistant message and nothing on stdout. An agent that fails that way has succeeded at nothing and reported success. Treat empty output as a failure, never as a pass. If it fails, the diagnosis is one command - `ssh trillian 'tail -1 ~/.lmstudio/server-logs/$(date +%Y-%m)/$(date +%Y-%m-%d).1.log'` - and busy slots mean contention rather than anything wrong with this project.

If anything failed: report every failure with its one-line fix (`/init` for missing skeleton pieces or a missing `default_agent`, a frontmatter fix for a missing agent, a restart for anything that looks stale, an edit for a surviving `<FILL: ...>`), and stop. Do not start work on a red preflight.

**No board.** The fleet checks and sets up a Notion board here, and this port does not have one - the board, its hooks and the vocabulary that goes with them are deferred whole rather than half-built. Say so in the report in one line, so a reader who knows the fleet does not assume the step was forgotten, and do not reason as though a board exists. Nothing in this project moves an item between columns and nothing reaches a human queue; a `Blocker:` line in a handoff reaches the human because you put it in front of them.

## The idea

The text after the command is the idea. If there is none, ask the human one open question - what are we building, in a sentence or a brain dump, messy is fine - and wait. Do not invent a task, and do not substitute a repo TODO for an answer.

## Start

With a green preflight and an idea in hand, start the fleet's intake as the lead's routing says: an unshaped idea goes to `spec-writer`, whose interview opens the problem out before the spec closes it down. Send `scout` ahead if the idea touches existing code, then spawn `spec-writer` with the idea verbatim, not paraphrased. From there the normal pipeline holds: the human edits and approves the spec, and a `coder` runs only on the human's order, with the spec's acceptance criteria in its brief.

Drive that by hand. The fleet runs this as the `spec-to-card` workflow, and the three workflows are deferred with the board, so there is no flow to invoke - the sequence above is the whole of it, and the two human gates in it, the approved spec and the order to build, are real stops rather than pauses you narrate past.

Report the preflight result either way - one line per check when green, the failure list when not.
