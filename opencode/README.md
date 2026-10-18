# coder-fleet for OpenCode

The OpenCode port of [coder-fleet](../README.md), part-built. It carries nine agents (all but `scripter`, `fleet-steward` and the editor pairs), the enforcement plugin, seven skills and two commands, `init` and `kickoff`. The board, its hooks and the workflows are deferred. Every agent runs on a local model served by LM Studio.

## Install

You need OpenCode (the invariant tests are pinned to 1.18.30), a machine serving LM Studio, and a clone of the coder-fleet repo.

```bash
git clone https://github.com/rzem-ai/coder-fleet.git
coder-fleet/opencode/scripts/install-project.sh /path/to/your-project    # or --global for ~/.config/opencode/
```

The script copies `agent`, `command`, `skill`, `plugin`, `lib` and `template` from `opencode/coder-fleet/` into the project's `.opencode/`. It never overwrites a file without `--update`, names every file that differs, and never deletes anything; `--dry-run` shows what it would change. A project with no `opencode.json` gets the template's.

Then restart OpenCode in the project, run `/init` to merge the fleet's keys into `opencode.json` and write the `AGENTS.md` skeleton, and run `/kickoff` to preflight the install and start the first spec. The template's `baseURL` is `http://<lm-studio-host>:1234/v1`; replace the placeholder with the address of the machine serving LM Studio, or no agent can reach its model.

The port needs no credential. Memory is left to OpenCode.

## Where things are

- [`coder-fleet/`](coder-fleet/) - the payload: agents, commands, skills, the enforcement plugin and its rules in `lib/scope.ts`, and the templates.
- [`test/`](test/) - the invariant tests. `test/run.sh unit` runs the scope rules and the vendored-skill check (in `check-all.sh`); `test/run.sh live` runs the rulesets and one live denial against the pinned OpenCode binary (in `check-slow.sh`).
- [`docs/divergence-register.md`](docs/divergence-register.md) - what happened to every Claude Code artefact here, and why.
- [`docs/specs/opencode-agents-port.md`](docs/specs/opencode-agents-port.md) - the port's decisions and what OpenCode turned out to do.
