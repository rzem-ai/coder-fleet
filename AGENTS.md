# Working on the coder-fleet repo

This file is for any coding agent changing the coder-fleet repo itself, whatever harness it runs in. It says what the repo is, what to run before claiming a change works, how a release happens and which writing rules hold. It is short because the long answers live in `docs/`; when this file and a document under `docs/` disagree, `docs/fleet-design.md` wins and this file is the one that is wrong.

## What this is

One fleet, `coder-fleet`, on three harnesses. The Claude Code plugin is the working one: eleven role-shaped subagents, the skills they preload, the hooks that move a board as agents start and stop, the board binary, three workflows that chain the roles, and the commands a human runs, published through a plugin marketplace named `rzem`. The OpenCode port of the same design is part-built, and the Codex port is a spec and a hooks spike. `README.md` is the front door and covers installing; `docs/fleet-design.md` is the design and the reason behind every choice, and "design section N" anywhere in the repo means that file.

```
coder-fleet/
├── .claude-plugin/marketplace.json    name "rzem"; one entry, coder-fleet -> ./claude/coder-fleet
├── .github/workflows/                 CI runs the deterministic suite
├── .boards/                           one board for the repo, project name coder-fleet
├── README.md                          the front door for all three harnesses
├── AGENTS.md                          rules for any agent changing this repo
├── LICENSE
├── docs/                              fleet-design.md, agent-contract.md, limits.md, plans/, runs/, findings/
│
├── claude/
│   ├── coder-fleet/                   the Claude Code plugin: plugin.json, .mcp.json, agents, skills,
│   │                                  hooks, workflows, commands, board, templates
│   ├── evals/                         smoke evals and lib/, the deterministic suite
│   ├── home/                          user-scope files for a machine that runs the fleet
│   └── scripts/                       install-home.sh, gen-glossary-rule.sh
│
├── opencode/
│   ├── coder-fleet/                   the OpenCode port: agents, skills, commands, the enforcement plugin
│   ├── test/                          the invariant tests
│   ├── scripts/                       install-home.sh: the port's user-scope config and memory token
│   └── docs/                          divergence register, measurements, findings, port plan and spec
│
└── codex/
    ├── coder-fleet/                   empty; the port's config, agents and skills land here
    ├── docs/                          the GPTA-1 spec, plan and findings
    └── scripts/spike/codex-hooks/     the hooks spike harness behind the findings
```

`<harness>/coder-fleet/` is the installable unit for that harness, and everything beside it under `<harness>/` is tooling and notes for that port. `docs/` at the root is the design every port implements.

## Before saying anything works

Run the deterministic suite once, from the repo root, and read its output:

```bash
bash claude/evals/lib/check-all.sh
```

It covers the hook contracts, the roster (every agent named in the README table, the SubagentStop matcher, the evals and the design must agree), the glossary rule being current, the handoff-check parity with the production hook, and the workflow logic tests. It needs `jq`, `python3` and `node`, no model, no network and no board. Run it once per command: a doubled run blows the two-minute shell timeout, so capture the output and grep that rather than running it again. The smoke evals under `claude/evals/` call `claude -p` and cost money; `claude/evals/run.sh --list` shows them, `claude/evals/run.sh <agent>` runs one, and they are not part of CI on purpose.

A change to an agent body or a skill's frontmatter also runs the `migration-checklist` skill over it before a PR opens. Most of its failures are silent in production: an agent loses a tool or a skill and never says so.

## Where a change goes

- **An agent's behaviour** changes in its body under `claude/coder-fleet/agents/`. The frontmatter carries model, effort, tools and preloaded skills; `docs/agent-contract.md` is the shape it must keep. Every agent ends with the same four-heading handoff, defined by the `handoff` skill and enforced by the SubagentStop hook, so a change to the handoff format touches the skill, the hook, `claude/evals/lib/handoff-check.sh` and the parity test together.
- **The board** moves only through hooks; no agent body and no command writes a status. The per-agent tool boundaries that session permissions cannot express live in `enforce-agent-scope.sh`. Both have contract tests under `claude/evals/lib/`, and a new rule goes in with its failing test first.
- **Vocabulary** changes in the `glossary` skill, then `claude/scripts/gen-glossary-rule.sh` regenerates `claude/coder-fleet/templates/rules/glossary.md`. Never edit the generated rule by hand; the suite fails if it is stale.
- **A deliberate gap** is recorded in `docs/limits.md` with its reason. Anything there that becomes a rule, a hook or a test leaves the file the same day.
- **The board binary** is a fork at a pin, not a dependency. Trim it by deletion, port upstream changes by hand if wanted, and keep `LICENSE` and `NOTICE.md` under `claude/coder-fleet/board/` intact.

## The ports

A port does not invent. Every artefact under `opencode/coder-fleet/` or `codex/coder-fleet/` traces to its counterpart under `claude/coder-fleet/`. Where the harnesses differ, the harness wins on file layout and frontmatter, and the fleet wins on behaviour and vocabulary. A deliberate divergence is a row in that port's `docs/divergence-register.md`, with the reason. Port work reads the Claude Code tree as reference and never writes to it; a fix the port needs upstream is its own change to `claude/coder-fleet/`.

## Releasing

A release is a version bump in `claude/coder-fleet/.claude-plugin/plugin.json`, mirrored in `.claude-plugin/marketplace.json`, on a commit whose subject starts with the version (`v0.23.2: close the lead half of issue 14`). The version is the Claude Code plugin's; the ports carry none yet. Clients keep the cached copy until the number changes, so a change without a bump is invisible to every install. There is no changelog and none should be added: git history is the record. Work happens on a branch and lands through a pull request; CI runs the deterministic suite on every push and pull request.

## Writing conventions

Australian English: organise, behaviour, colour, recognise, analyse.

Standard hyphens for asides - like this. Never an em dash, never an en dash.

No emojis anywhere: code, comments, commits or prose.

Never hard-wrap prose. One line per paragraph; code fences, tables and ASCII trees are structure and stay as they are.

Prose says "the human", never a name. Author and metadata fields are the exception. The repo refers to itself as "the coder-fleet repo".

Say the thing once. Prefer the shorter sentence.
