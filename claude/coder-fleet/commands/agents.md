---
description: List the fleet agents and whether each is enabled for this project, or switch one off or on with `disable <agent>` or `enable <agent>`
argument-hint: [disable <agent> | enable <agent>]
---

List, disable or enable fleet agents for this project. The setting is `disabledAgents` in the project's `.claude/coder-fleet.json`: the lead stops spawning a listed agent, `review-round` skips it, and a `PreToolUse` hook denies any spawn that still asks for one. `lead`, `coder` and `reviewer` cannot be disabled.

The arguments were: `$ARGUMENTS`

## Procedure

One script does all of it, and a contract test pins it. Run it and report what it printed; never edit `.claude/coder-fleet.json` yourself, not even to fix it, and never commit it.

1. Pick the form from the arguments:
   - nothing, or `list`: list every agent and its state.
   - `disable <agent>` or `enable <agent>`: one agent name, bare or `coder-fleet:`-prefixed.
   - anything else: say that the forms are `/coder-fleet:agents`, `/coder-fleet:agents disable <agent>` and `/coder-fleet:agents enable <agent>`, and stop without running anything.
2. From the project's working directory, run the script with exactly those words as its arguments, for example:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/fleet-agents.sh" disable refuter
   ```

   With no arguments it lists. It edits the file in the repository's main checkout, even when it runs in a linked worktree, which is the file the spawn hook and `review-round` read.
3. Report the script's output as it printed it, then its exit code if that was not 0:
   - 0: it listed, changed the file, or found nothing to change (an agent already disabled, or not disabled). A change applies from the next spawn in this session, with no restart, and the output says so.
   - 1: it refused - a core agent, a name that is not a fleet agent, or a file that is invalid - or the list found the file invalid. The file was not touched. Pass on its reason; do not retry with a different name and do not fix the file unasked.
   - 2: a usage error. Give the three forms above.
   - Missing script or any other exit: say so with its output, and stop. There is no manual fallback.

The file is written and not committed. Mention that the human commits it when the setting should hold for everyone working on the project.
