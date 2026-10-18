# coder-fleet for OpenCode

The OpenCode port of [coder-fleet](../README.md), part-built. It carries nine agents (all but `scripter`, `fleet-steward` and the editor pairs), the enforcement plugin, seven skills and two commands, `init` and `kickoff`. The board, its hooks and the workflows are deferred. Every agent runs on a local model served by LM Studio.

## Install

You need OpenCode 2.x (the port targets 2.0.32 and the invariant tests are pinned to it; 1.x does not load its plugin or read its config shape), `git`, and a machine serving LM Studio. Install from a release tag, `vX.Y.Z` (`git ls-remote --tags https://github.com/rzem-ai/coder-fleet.git` lists them):

```bash
TAG=vX.Y.Z
curl -fsSL "https://raw.githubusercontent.com/rzem-ai/coder-fleet/$TAG/opencode/scripts/install-project.sh" \
  | bash -s -- --ref "$TAG" /path/to/your-project    # or --global in place of the path, for ~/.config/opencode/
```

`--ref` makes the script clone the repo at that tag and install the tag's payload, whatever copy of the script runs it. It copies `agent`, `command`, `skill`, `plugin`, `lib` and `template` from `opencode/coder-fleet/` into the project's `.opencode/`, and writes `.opencode/.coder-fleet-version` with the tag, its commit and, when it kept any differing file, how many. It never overwrites a file without `--update`, names every file that differs, and never deletes anything; `--dry-run` shows what it would change. A project with no `opencode.json` gets the template's. To move to a later release, rerun with the new tag and `--update`. From a clone, `opencode/scripts/install-project.sh <dir>` without `--ref` installs the working tree instead and stamps it `working-tree`.

The enforcement plugin is also a package, for a machine that wants it in every project without the rest of the payload:

```bash
opencode plugin add "github:rzem-ai/coder-fleet#$TAG::path:opencode/coder-fleet"
```

That adds it to the global config only. A tag is not pinned there: `opencode plugin check` resolves the tag again and offers an update if it ever moves, and only a full commit hash in place of the tag stays fixed. The 2.x managed service activates a package plugin asynchronously, so the first `opencode plugin list` or `opencode plugin check` after it starts may show nothing for a few seconds. A project install already carries the plugin; with both, OpenCode loads both and the preload appears once.

Then restart OpenCode in the project, run `/init` to merge the fleet's keys into `opencode.json` and write the `AGENTS.md` skeleton, and run `/kickoff` to preflight the install and start the first spec. The template's `baseURL` is `http://<lm-studio-host>:1234/v1`; replace the placeholder with the address of the machine serving LM Studio, or no agent can reach its model.

The port needs no credential. Memory is left to OpenCode.

## Where things are

- [`coder-fleet/`](coder-fleet/) - the payload: agents, commands, skills, the enforcement plugin and its rules in `lib/scope.ts`, and the templates.
- [`test/`](test/) - the invariant tests. `test/run.sh unit` runs the scope rules, the vendored-skill check and the config-shape check (in `check-all.sh`); `test/run.sh live` runs the rulesets and every scope denial live against the pinned OpenCode binary (in `check-slow.sh`).
- [`docs/divergence-register.md`](docs/divergence-register.md) - what happened to every Claude Code artefact here, and why.
- [`docs/specs/opencode-agents-port.md`](docs/specs/opencode-agents-port.md) - the port's decisions and what OpenCode turned out to do.
