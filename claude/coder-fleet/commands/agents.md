---
description: List the fleet agents and whether each is enabled for this project, switch one off or on with `disable <agent>` or `enable <agent>`, show and set the build or harden phase with `phase`, or show, set and clear the base branch, push policy and release setting with `base`, `push` and `release`
argument-hint: [disable <agent> | enable <agent> | phase [build | harden] | base [<branch> | --unset] | push [all | base-only | --unset] | release [off | tag | github | --unset]]
---

List, disable or enable fleet agents for this project, or show and set its phase, base branch, push policy and release setting. All of them live in the project's `.claude/coder-fleet.json`. `disabledAgents`: the lead stops spawning a listed agent, `review-round` skips it, and a `PreToolUse` hook denies any spawn that still asks for one; `lead`, `coder` and `reviewer` cannot be disabled. `phase`: `build`, the default, makes `review-round` run one round, commission no fix round, report Low findings without fixing them, spawn a break-mode reviewer only on authentication or credential paths, and report proposals without filing them; `harden` runs the full loop. `baseBranch`: the local branch the fleet treats as the trunk; unset, the trunk is the branch the remote's HEAD names, else `main`. `push`: `all`, also what unset means, or `base-only`. `release`: `off`, `tag` or `github`; unset is not `off`, and leaves the project's shipping words to decide. An invalid `push` reads as `base-only` and an invalid `release` as `off`.

The arguments were: `$ARGUMENTS`

## Procedure

One script does all of it, and a contract test pins it. Run it and report what it printed; never edit `.claude/coder-fleet.json` yourself, not even to fix it, and never commit it.

1. Pick the form from the arguments:
   - nothing, or `list`: list every agent and its state.
   - `disable <agent>` or `enable <agent>`: one agent name, bare or `coder-fleet:`-prefixed.
   - `phase`: show the phase. `phase build` or `phase harden`: set it.
   - `base`, `push` or `release`: show that setting and where it came from. `base <branch>`, `push all`, `push base-only`, `release off`, `release tag` or `release github`: set it. Any of the three followed by `--unset`: clear it.
   - anything else: say that the forms are `/coder-fleet:agents`, `/coder-fleet:agents disable <agent>`, `/coder-fleet:agents enable <agent>`, `/coder-fleet:agents phase` and `/coder-fleet:agents phase build` or `phase harden`, and `/coder-fleet:agents base`, `push` or `release` with a value or `--unset` or none, and stop without running anything.
2. From the project's working directory, run the script with exactly those words as its arguments, for example:

   ```bash
   "${CLAUDE_PLUGIN_ROOT}/scripts/fleet-agents.sh" disable researcher
   ```

   With no arguments it lists. It edits the file in the repository's main checkout, even when it runs in a linked worktree, which is the file the spawn hook and `review-round` read.
3. Report the script's output as it printed it, then its exit code if that was not 0:
   - 0: it listed, showed a setting, changed the file, or found nothing to change (an agent already disabled or not disabled, a setting already as asked). A change applies from the next spawn or the next `review-round` run in this session, with no restart, and the output says so.
   - 1: it refused - a core agent, a name that is not a fleet agent, a base branch that is not a local branch, or a file that is invalid - or the list or a setting it showed was invalid or unread. The file was not touched. Pass on its reason; do not retry with a different name and do not fix the file unasked.
   - 2: a usage error. Give the forms above.
   - Missing script or any other exit: say so with its output, and stop. There is no manual fallback.

The file is written and not committed. Mention that the human commits it when the setting should hold for everyone working on the project.
