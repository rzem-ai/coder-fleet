# Working on the coder-fleet repo

This file is for any coding agent changing the coder-fleet repo itself, whatever harness it runs in. It says what the repo is, what to run before claiming a change works, how a release happens and which writing rules hold. It is short because the long answers live in `docs/`; when this file and a document under `docs/` disagree, `docs/fleet-design.md` wins and this file is the one that is wrong.

## What this is

One fleet, `coder-fleet`, on two harnesses. The Claude Code plugin is the working one: twelve role-shaped subagents, the skills they preload, the hooks that move a board as agents start and stop, the `boards` binary, three workflows that chain the roles, and the commands a human runs, published through a plugin marketplace named `rzem`. The OpenCode port of the same design is part-built. `README.md` is the front door and covers installing each port, and each port's own `README.md` under `<harness>/` covers the rest; `docs/fleet-design.md` is the design and the reason behind every choice, and "design section N" anywhere in the repo means that file.

```
coder-fleet/
├── .claude-plugin/marketplace.json    name "rzem"; one entry, coder-fleet -> ./claude/coder-fleet
├── .github/workflows/                 CI runs the deterministic suite
├── README.md                          the front door for both harnesses
├── AGENTS.md                          rules for any agent changing this repo
├── LICENSE
├── docs/                              fleet-design.md, agent-contract.md, limits.md, board-config.md,
│                                      and decisions/
│
├── claude/
│   ├── README.md                      the Claude Code plugin: agents, hooks, board, workflows, commands
│   ├── coder-fleet/                   the Claude Code plugin: plugin.json, .mcp.json, agents, skills,
│   │                                  hooks, workflows, commands, boards, templates
│   ├── evals/                         smoke evals and lib/, the deterministic suite
│   ├── home/                          user-scope files for a machine that runs the fleet
│   └── scripts/                       install-home.sh, gen-glossary-rule.sh
│
└── opencode/
    ├── README.md                      what the port carries and how to install it
    ├── coder-fleet/                   the OpenCode port: agents, skills, commands, the enforcement plugin
    ├── test/                          the invariant tests
    ├── scripts/                       install-project.sh: copies the port into a project
    └── docs/                          the port spec and the divergence register
```

`<harness>/coder-fleet/` is the installable unit for that harness, and everything beside it under `<harness>/` is tooling and notes for that port. `docs/` at the root holds `fleet-design.md`, the design every port implements, beside the Claude Code plugin's own contract and limits (`agent-contract.md`, `limits.md`, `board-config.md`), `decisions/`, one short document per reason that outlives the change it came from. The board, the specs for its open cards and the run articles are not in the repo: they live in the board's directory, `~/.config/boards/CF/`, with the specs in its `specs/` and the run articles in its `runs/`, on the human's machine only. A spec goes once its card is Released; anything in it still worth keeping moves into a document under `decisions/` first. A port's own design and register live under its `<harness>/docs/`.

## Before saying anything works

Run the deterministic suite once and read its output. The hook reads the `gates` block from the main checkout's `AGENTS.md`, never a branch's own, and a reviewer runs these from the root of a linked worktree and nothing else that executes code. `check-all.sh` is the whole suite and the other lines are single contract suites from it.

```gates
suite: bash claude/evals/lib/check-all.sh
scope-hook: bash claude/evals/lib/scope-hook-contract.sh
handoff-parity: bash claude/evals/lib/handoff-parity.sh
```

A release runs the suite too: the board's `config.yml` sets `test: bash claude/evals/lib/check-all.sh`, and the test gate runs it on the tagged commit of every release whose tag names cards on its `Cards:` line, so a card reaches Released only on a green suite; Done needs only its ticks. The suite covers the hook contracts, the roster (every agent named in the `claude/README.md` table, the SubagentStop matcher, the evals and the design must agree), the glossary rule being current, the handoff-check parity with the production hook, and the workflow logic tests. It needs `jq`, `python3` and `node`, no model, no network and no board. Under root the permission cases print `SKIP` lines instead of failing, since `chmod` binds nothing there (`docs/limits.md`, "The deterministic suite"); CI runs as an ordinary user and proves them. It also runs the OpenCode port's unit tests (`opencode-unit.sh`: its scope rules, and every vendored skill against its source), which need `bun` and skip without it outside CI.

One run has a budget of 180 seconds on the human's machine with no other suite running. Its sections run at once and each prints its own duration, so a slow section names itself. Because a run keeps every core busy, `check-all.sh` holds a machine-wide lock and a second run waits for the first (`CHECK_ALL_LOCK=0` turns it off, `CHECK_ALL_LOCK_WAIT` bounds the wait, 240 s by default). [`docs/decisions/check-all-budget.md`](docs/decisions/check-all-budget.md) has the measurements behind each number. Give the Bash call an eight-minute timeout (480000 ms, under the tool's 600000 ms limit), so a run that waits for the lock still fits, and run it once per command: capture the output and grep that rather than running it again. A check that is slow and guards nothing a close depends on goes in `claude/evals/lib/check-slow.sh` instead, which CI runs after `check-all.sh`: the steward eval's gate self-test, `board-hook-no-bun.sh` (the sharded board-hook contract with bun hidden, CI's shape), `board-hook-unsharded.sh` (the same contract in one process) and `opencode-live.sh` (the OpenCode port's ruleset and live-denial tests, which need the pinned OpenCode binary CI installs), and `suite-coverage.sh` fails if a check is in neither suite or in both, counting only uncommented `run` lines. The smoke evals under `claude/evals/` call `claude -p` and cost money; `claude/evals/run.sh --list` shows them, `claude/evals/run.sh <agent>` runs one, and they are not part of CI on purpose.

A change to an agent body or a skill's frontmatter also runs the `migration-checklist` skill over it before a PR opens. Most of its failures are silent in production: an agent loses a tool or a skill and never says so.

## Where a change goes

- **An agent's behaviour** changes in its body under `claude/coder-fleet/agents/`. The frontmatter carries model, effort, tools and preloaded skills; `docs/agent-contract.md` is the shape it must keep. Every agent ends with the same four-heading handoff, defined by the `handoff` skill and enforced by the SubagentStop hook, so a change to the handoff format touches the skill, the hook, `claude/evals/lib/handoff-check.sh` and the parity test together.
- **The board** is `claude/coder-fleet/boards/`, one compiled `boards` binary serving the MCP tools, the CLI, every hook (`boards hook <event>`) and the fleet's own tools (`boards fleet <tool>`); its `README.md` says how. Its columns move only through hooks and gates; no agent body and no command writes a column. The per-agent tool boundaries that session permissions cannot express live in `enforce-agent-scope.sh`, and the break-mode reviewer's wall-clock cap in `agent-clock.sh`, both shims onto the binary. The board has its own tests under `boards/test/`, the hooks contract tests under `claude/evals/lib/`, and a new rule goes in with one test that pins it.
- **Vocabulary** changes in the `glossary` skill, then `claude/scripts/gen-glossary-rule.sh` regenerates `claude/coder-fleet/templates/rules/glossary.md`. This repo's own installed copy at `.claude/rules/glossary.md` is kept out of history and lives only in the main checkout, so the generator skips it in a linked worktree; after a glossary change merges, run the generator in the main checkout to refresh it, or the suite fails there. Never edit the generated rule by hand; the suite fails if it is stale.
- **An editor's behaviour** changes in its one definition, `claude/coder-fleet/agents/spec-editor.md` or `tech-editor.md`, on Opus like the rest. There is no Fable copy to keep in step.
- **A deliberate gap** is recorded in `docs/limits.md` with its reason. Anything there that becomes a rule, a hook or a test leaves the file the same day.

## The ports

A port does not invent. Every artefact under `opencode/coder-fleet/` traces to its counterpart under `claude/coder-fleet/`. Where the harnesses differ, the harness wins on file layout and frontmatter, and the fleet wins on behaviour and vocabulary. A deliberate divergence is a row in that port's `docs/divergence-register.md`, with the reason. Port work reads the Claude Code tree as reference and never writes to it; a fix the port needs upstream is its own change to `claude/coder-fleet/`.

## Where work lives

Work is built from the board card, and the human's order on a card is the approval to build it. The repo's board is `~/.config/boards/CF/`, outside the repo: the cards are under its `cards/`, the specs for open cards at `specs/<issue>.md` and the run articles in `runs/`, on the human's machine only, never committed. Agent memory stays in each checkout's `.claude/agent-memory`, out of history. A card is taken from the top of Next, then Backlog; a task closes one only when its subject carries the `[board:<id>]` marker; a card waiting on the human carries an Action for Human; and a release names the cards it ships on its tag's `Cards:` line.

Shipping: commit and push the branch, open the pull request as a draft, give it its review, mark it ready, and merge it on GitHub once the review approved it, CI is green and GitHub reports it mergeable, remove the merged worktree and its branch, then cut a release that carries the merge, as Releasing below says.

That line is the lead's whole authority to ship here: it takes those steps without asking, the release included, and stops once the tag is pushed and the release branch is gone. A merge that changes nothing under `claude/coder-fleet/` or `.claude-plugin/`, which is all an install receives, cuts no release.

## Releasing

A release is a version bump in `claude/coder-fleet/.claude-plugin/plugin.json`, mirrored in `.claude-plugin/marketplace.json`, on a commit whose subject starts with the version (`v0.23.2: close the lead half of issue 14`). The version is the Claude Code plugin's; the OpenCode port carries none yet. Clients keep the cached copy until the number changes, so a change without a bump is invisible to every install. There is no changelog and none should be added: git history is the record. Work happens on a branch and lands through a pull request, which the lead may merge, and then remove its worktree and branch, as the `Shipping:` line above grants; CI runs the deterministic suite on every push and pull request. The lead cuts the release too: it bumps the version on a `release-vX.Y.Z` branch cut from the default branch, a minor bump for an added or removed feature and a patch bump otherwise, opens the release pull request, merges it with a merge commit once CI is green and GitHub reports it mergeable, with no review of its own since it changes only the version, so the release commit stays on the default branch, then tags and pushes as below and deletes the release branch. Feature pull requests squash; only the release pull request keeps a merge commit. The `release` setting in `.claude/coder-fleet.json`, `off`, `tag` or `github`, decides whether any project releases, and unset leaves that to its shipping words, except under `push: base-only`, where unset is `off`; it never contradicts them, since the words decide how far the lead goes.

Every release is also tagged `vX.Y.Z` and the tag is pushed. The tag is annotated and its message carries one `Cards:` line naming every card the release ships (`git tag -a vX.Y.Z <commit> -m "vX.Y.Z: <what it releases>" -m "Cards: CF-12, CF-14"`), which the board's test gate reads to move those cards from Done to Released once the suite passes on that commit. It goes on the release commit CI proved: the branch head that carries the version bump, which the pull request then merges. It does not go on the merge commit. Push it with `git push origin vX.Y.Z` once the pull request has merged; a tag made and never pushed is invisible to everyone else. Nothing follows the tag: the board, the specs, the run articles and memory never land on any branch.

## Worktree setup

A fresh worktree has no dependencies. The suite needs `bun` on the machine (without it the board sections skip locally and fail in CI) and the board's packages, so the coder runs `bun install --frozen-lockfile` in `claude/coder-fleet/boards` first. Reviews run in the coder's worktree, so the suite installs nothing there; in a worktree without `node_modules`, `check-all.sh` installs it into the ignored `node_modules` and bun's cache. The fixtures under `claude/evals/fixtures/` need nothing.

## Writing conventions

Australian English: organise, behaviour, colour, recognise, analyse.

Standard hyphens for asides - like this. Never an em dash, never an en dash.

No emojis anywhere: code, comments, commits or prose.

Never hard-wrap prose. One line per paragraph; code fences, tables and ASCII trees are structure and stay as they are.

Prose says "the human", never a name. Author and metadata fields are the exception. The repo refers to itself as "the coder-fleet repo".

Say the thing once. Prefer the shorter sentence.

Instruction prose - agent bodies and skills - is reviewed by reading, not proven by grep. A contract check over it covers structure only: frontmatter fields, section order and count, step count, line limit, no dashes, no hard wraps. A phrase-presence check passes while contradicting text sits beside it, and a negation check invites the next mutant.
