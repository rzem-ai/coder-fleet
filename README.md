# coder-fleet

A personal subagent fleet: role-shaped agents delegated to from a coding session, the skills they share, and the checks that hold them to their roles. The coder-fleet repo holds one design, [`docs/fleet-design.md`](docs/fleet-design.md), and a port of it per harness.

| Harness | Directory | Status |
|---|---|---|
| Claude Code | [`claude/`](claude/README.md) | Released |
| OpenCode 2 | [`opencode/`](opencode/README.md) | Part-built: eleven role definitions, four skills, six commands and native board integration; deterministic workflows and automatic worktree isolation remain outstanding |

## Evals

The repo carries an eval suite for the Claude Code agents: each agent's prompts run through `claude -p` against fixture repositories, and a run is scored by mechanical gates and a rubric a second model grades, against a baseline recorded per agent. The deterministic checks run in CI and the model runs are manual; [`claude/evals/README.md`](claude/evals/README.md) has the details.

## Install

**Claude Code.** Install the plugin once per machine, at user scope:

```bash
claude plugin marketplace add rzem-ai/coder-fleet
claude plugin install coder-fleet@rzem
```

Then run `/coder-fleet:init` in a session in the project, or copy `claude/coder-fleet/templates/project-settings.json` into it as `.claude/settings.json`. [`claude/README.md`](claude/README.md) covers prerequisites, configuration, the board and staying current.

**OpenCode.** From a clone of the coder-fleet repo:

```bash
opencode/scripts/install-project.sh /path/to/your-project
```

Then restart OpenCode in the project and run `/init` and `/kickoff`. [`opencode/README.md`](opencode/README.md) has the details.

## Licence

MIT, see [`LICENSE`](LICENSE).
