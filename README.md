# coder-fleet

A personal subagent fleet: eleven role-shaped agents delegated to from a coding session, the skills they share, the hooks that keep the board honest, the board itself, and the evals that catch a regression before a model release does. The coder-fleet repo holds one design and a port of it per harness, and it is the single source of truth - every machine and cloud session that runs the fleet gets it from here.

The agents are roles, not personas: disposable by design, with fresh context on every spawn and their memory on a server rather than in their heads. The fleet also maintains itself: a `fleet-steward` agent watches model releases and files PRs against the coder-fleet repo.

## Three harnesses

| Harness | Directory | Status |
|---|---|---|
| Claude Code | `claude/coder-fleet/` | Released, v0.25.0 |
| OpenCode | `opencode/coder-fleet/` | In port: scout, the enforcement plugin, six skills and two commands; see `opencode/docs/divergence-register.md` |
| Codex | `codex/coder-fleet/` | Spec and hooks spike only, no code; see `codex/docs/specs/GPTA-1.md` |

The design in `docs/` is shared. Everything below this section describes the Claude Code plugin.

## The fleet

| Agent | Job |
|---|---|
| `lead` | Routes and gates, and builds what the human orders from the board card. Runs as the main session (the `agent` key in project settings), never spawned |
| `scout` | Cheap read-only reconnaissance: where is X, how does Y work. Locations and excerpts, never opinions |
| `spec-writer` | Turns a brain dump or a board item into a spec, interviewing first |
| `coder` | Implements one item or sub-issue the human ordered, tests first, in its own git worktree |
| `scripter` | Coder's cheaper sibling for small scripting and tooling items. Same worktree guard, smaller model |
| `reviewer` | Reviews a diff for correctness, design and security. Reports, never edits |
| `refuter` | Tries to break what was just built and reports what broke it. Never fixes |
| `ui-designer` | Screens, flows and HTML prototypes from a spec |
| `tech-writer` | READMEs, ADRs, runbooks and drafts from material that already exists |
| `researcher` | Fan-out reading and synthesis with citations |
| `fleet-steward` | Weekly model and tooling sweep. Files PRs, never merges |

Each agent spawns under the plugin's prefix, `coder-fleet:coder` for `coder`. Each body in [`claude/coder-fleet/agents/`](claude/coder-fleet/agents/) carries its model, effort, tool allowlist, preloaded skills and invariants; the reasoning behind every choice is in the fleet design, section 4.

## How it works

**Every agent ends with the same handoff.** Four headings - Done, Not done, Unverified, Decisions needed - with typed lines under the last (`Blocker:`, `Propose item:`, `Propose memory:`), so the lead can merge a stack of handoffs without re-reading a stack of transcripts. The format is the `handoff` skill, preloaded everywhere and enforced by a hook.

**Hooks write the board; agents never do.** `SubagentStart` moves a board item to In Progress, `SubagentStop` writes Blocked by human (a `Blocker:` line in the handoff is what lands in the human queue), and `TaskCompleted` gates on tests before writing Done. A fourth hook, `enforce-agent-scope.sh`, denies at `PreToolUse` the tool calls each agent's own invariants forbid - the per-agent boundary that session-scoped permissions cannot express, and `enforce-disabled-agents.sh` denies a spawn of any agent the project has switched off in `.claude/coder-fleet.json`.

**Workflows chain the roles.** `spec-to-card`, `review-round` and `deep-research` in [`claude/coder-fleet/workflows/`](claude/coder-fleet/workflows/) run the multi-agent shapes deterministically instead of hoping the model sequences them.

**Commands are the human's hands.** `/coder-fleet:init` sets a project up, `kickoff` preflights it and starts the first spec, `work` focuses the checkout on one board item so the hooks move that item, `board` opens or stops the board's web UI for this session, `agents` lists the fleet agents and switches one off or on for the project, and `prune-worktrees` removes agent worktrees git can show were merged. They live in [`claude/coder-fleet/commands/`](claude/coder-fleet/commands/).

**Everything is evalled.** Each agent has a smoke eval under [`claude/evals/`](claude/evals/) run with `claude -p`, and `claude/evals/lib/check-all.sh` runs every deterministic check - hook contracts, roster consistency, workflow logic - with no model, no network and no board.

## Installing

The coder-fleet repo is a Claude Code plugin marketplace named `rzem` with one plugin in it, `coder-fleet`, plus the user-scope files and install script for a machine that runs the fleet. There are three layers. The first is all you need to use the agents; the other two are for a machine you run the fleet from.

### Prerequisites

- **Claude Code** with plugin support. `claude plugin --help` should list `marketplace` and `install`; if it does not, update Claude Code first.
- **git**, 2.31 or later. The coder-fleet repo is public, so the clone, the marketplace add and background marketplace refreshes all work over plain HTTPS with no credentials. Only pushing changes back needs auth. The board root resolution uses `git rev-parse --path-format=relative`, which needs 2.31.
- **jq**. Every board hook and the eval runner use it.
- **python3**. The install script's settings merge and the scope hook's write-path check.
- **node**. Only for `claude/evals/lib/check-all.sh`, which syntax-checks the workflows and runs their logic tests.
- **1Password CLI (`op`)**. Only for rendering the fleet secrets in step 3. Skip it with `--home-only` until you need it.
- **bash 3.2 or later**. Everything is written for the bash macOS ships, so no Homebrew bash is required.

### 1. Use the fleet in a project

The plugin is installed once per machine, at user scope. Each project then says only which marketplace it comes from and which agent runs the session.

**On the machine.** Add the marketplace and install the plugin at user scope:

```bash
claude plugin marketplace add rzem-ai/coder-fleet
claude plugin install coder-fleet@rzem
```

Append `@<branch-or-tag>` to the coder-fleet repo reference (`rzem-ai/coder-fleet@main`) to pin the marketplace to a ref. Inside a session, `/plugin` opens the same marketplace and install flow interactively. Updating is `claude plugin update coder-fleet@rzem`, and because there is one install record there is one version: nothing else on the machine pins an older copy. Claude Code keeps a plugin cache dir for every version some record still references, so a project-scope or local-scope enable for the same plugin is the thing to avoid - every path that enables it, including every agent worktree cut under `.claude/worktrees/`, gets its own record at whatever version was current, and the old cache dirs stay until the last record naming them is gone.

**In the project.** From a clone of the coder-fleet repo, copy the settings template into the project you want the fleet in:

```bash
git clone https://github.com/rzem-ai/coder-fleet.git
mkdir -p /path/to/your-project/.claude
cp coder-fleet/claude/coder-fleet/templates/project-settings.json /path/to/your-project/.claude/settings.json
```

The template carries two keys: `extraKnownMarketplaces` (the `rzem` marketplace, sourced from the coder-fleet GitHub repo, with `autoUpdate` off so a project moves to a new fleet version when you say so) and `agent` (`coder-fleet:lead`, so the main session runs as the lead). It deliberately carries no `enabledPlugins`: that key is what the machine-level install provides. If the project already has a `.claude/settings.json`, merge those two keys into it rather than overwriting the file. Commit `.claude/settings.json` so every clone and every teammate runs the same lead against the same marketplace; each of them installs the plugin once on their own machine, as above.

What this gives up: Claude Code on the web has no machine-level install, and it reads only what the repo commits, so a cloud session no longer picks the fleet up on folder trust. A project that needs the fleet on the web adds `"enabledPlugins": {"coder-fleet@rzem": true}` to its committed `.claude/settings.json` and accepts the per-path records that come with it on every developer machine. That is a per-project choice, and the template does not make it for you.

**Verify.** `claude plugin list` shows `coder-fleet@rzem` as enabled. Inside a session, `/agents` lists the eleven fleet agents under the plugin. If the plugin installed but the agents are missing, the marketplace cache is stale - see *Staying current* below.

**The command route.** With the plugin installed, `/coder-fleet:init` inside a session does the whole per-project setup in one pass: it merges the three settings keys, copies the AGENTS.md skeleton and the glossary rule into the project, creates `docs/specs/`, then reads the repo and interviews you to fill every `<FILL: ...>` marker. If the project root has a `CLAUDE.md` and no `AGENTS.md`, init offers to rename it, because Claude Code ignores an `AGENTS.md` that a `CLAUDE.md` shadows. Re-running it is safe - it skips what already exists and only offers to fill markers still present.

Nothing init writes is live until the next session - settings, `AGENTS.md` and the plugin itself all load at startup - so init ends by telling you to restart, trust the folder, and run `/coder-fleet:kickoff`. Kickoff preflights the install (agents present, lead in charge, no markers left, skeleton and work directories in place), and fails if a `CLAUDE.md` or `CLAUDE.local.md` at the project root or above it shadows `AGENTS.md`. It then checks the board when the binary answers - `.boards/config.yml` here, its five statuses, the outcome labels, the `.gitignore` - and ends by stating the conventions: root, the `BD` prefix, status names, labels, and the item-ref binding. It cannot tell whether the binary on this machine is current, and says so. On a green preflight it takes the idea you typed after it - or asks for one - and starts the spec pipeline on it. On a red preflight it lists the fixes and stops; declining the board is never red.

**Optional: the project skeleton by hand.** `claude/coder-fleet/templates/AGENTS.md` is a project AGENTS.md with `<FILL: ...>` markers for the things that differ per project, and `claude/coder-fleet/templates/rules/glossary.md` is the generated glossary rule it refers to. Copy both into the project (`AGENTS.md` at the root, the rule under `.claude/rules/`) and fill the markers. Never edit the glossary rule by hand - it is generated from the `glossary` skill by `claude/scripts/gen-glossary-rule.sh`.

**Optional: switch agents off for a project.** A project that wants to go without a fleet agent lists it in `.claude/coder-fleet.json` in its main checkout, or runs `/coder-fleet:agents disable <agent>`, which edits that file:

```json
{ "disabledAgents": ["refuter"] }
```

Names are agent names, bare or `coder-fleet:`-prefixed. No file, or no `disabledAgents` key, is the whole fleet, so deleting the entry restores today's behaviour exactly. The file that counts is the main checkout's, read live: uncommitted edits count, and a linked worktree's copy never does, from whichever worktree the lead, the hook or the command runs. The lead stops spawning a listed agent, `review-round` reads the file itself, and a `PreToolUse` hook denies any spawn that still asks for one, with a message naming the file. The file is read on every spawn, so an edit takes effect on the next one with no restart. A branch cannot switch off its own refuter: a `review-round` whose reviewed range changes `.claude/coder-fleet.json` refutes as it would with no config, and logs why. `lead`, `coder` and `reviewer` cannot be disabled: listing one makes the file invalid, nothing in it is honoured, every spawn carries a warning saying why, and `check-all.sh` fails when the main checkout's copy is invalid. Outside a git repository, or when the main checkout is bare, no `.claude/coder-fleet.json` is read and nothing is disabled. A disabled refuter means no refuter round at all and nothing in its place - no substitute gate run - and `review-round` reports such a round as `refutation skipped by config`, never as a clean refutation.

Rather than edit the file by hand, run `/coder-fleet:agents`: with no argument it lists every fleet agent and whether it is enabled, `/coder-fleet:agents disable refuter` adds the agent to `disabledAgents` (creating the file if absent) and `/coder-fleet:agents enable refuter` takes it off again. A script does the edit with the same validation the hook uses, so it refuses a core agent, a name that is not a fleet agent or an invalid file and leaves the file untouched, and it stores names bare, sorted and deduplicated. The change applies from the next spawn with no restart. The command writes the file and does not commit it.

### 2. Set up a machine

The user-scope half: the hardened `~/.claude/settings.json`, the user CLAUDE.md, rules and any local agent copies that live in `claude/home/`. Run it on any machine that spawns fleet agents.

```bash
git clone https://github.com/rzem-ai/coder-fleet.git ~/Dev/coder-fleet
cd ~/Dev/coder-fleet
claude/scripts/install-home.sh --dry-run      # show what would change, change nothing
claude/scripts/install-home.sh --home-only    # install the files, skip the secrets
```

What it does, and does not do:

- `claude/home/settings.json` is **merged** into `~/.claude/settings.json`, never copied over it. Your model, enabled plugins, status line and hand-added deny rules survive; the fleet's deny list, sandbox and network allowlist are added. `claude/scripts/merge-settings.py` is the policy.
- Everything else in `claude/home/` is copied, not symlinked, because Cowork ignores a symlinked `~/.claude/CLAUDE.md`. An existing symlink is replaced with a real file.
- Anything it is about to overwrite is backed up first under `~/.local/state/coder-fleet/backups/<timestamp>/` (override with `CODER_FLEET_BACKUP_DIR`).
- It never touches `~/.claude/projects/`, sessions, history, todos, logs or `plugins/cache`. The guard is enforced in the script, not just documented.
- Per-box differences go in `claude/home/hosts/<short-hostname>/`, copied over the base tree after it.
- `CLAUDE_CONFIG_DIR` is respected if you keep Claude Code's config somewhere other than `~/.claude`.

It is safe to re-run. Unchanged files are left alone and the summary at the end says what was created, updated and skipped.

### 3. Secrets and the board

The board needs no secret at all. It is a directory of markdown files at `.boards/` in the repository's own main checkout, created by `/coder-fleet:init` and committed by the plugin's own `board` binary after every write, which the installer builds into `~/.local/bin/board`. The hooks make no network call and read no token; without the binary they log a `board shim missing` or a `board <cmd> failed` line and leave the board alone, and the agents themselves work fine, so a machine that has never built it is a working install. Two workflow steps need the board: `review-round` with `fix: true` reads the card before it commissions a fix, and `spec-to-card`'s second run files the spec's criteria onto it. Without the binary both stop as `could not read the board` and file nothing.

A clone without the plugin has the `.boards/` files and no hooks to move them - a readable board nobody moves. That is acceptable.

The installer renders no secrets unless a machine lists some. The list is a local file, `~/.config/coder-fleet/secrets.spec` (or wherever `CODER_FLEET_SECRET_SPEC` points), never committed, so vault and item names stay off the repository. One secret per line:

```
# <destination filename>|op://<vault>/<item>/<field>
example-credential|op://<vault>/<item>/<field>
```

Then render them from 1Password:

```bash
eval "$(op signin)"                       # interactive; an unattended box exports OP_SERVICE_ACCOUNT_TOKEN instead
claude/scripts/install-home.sh --secrets-only    # or drop the flag to do files and secrets together
```

Each lands in `~/.config/coder-fleet/` at mode 600. With no spec the step is skipped and `op` is never needed. A malformed spec line, or a destination that is not a plain filename, stops the run before 1Password is touched. A secret that cannot be read is reported by reference, never by value, and the script exits non-zero so a missing one is not missed.

Knobs, all optional:

- `CODER_FLEET_BOARD_ROOT` points the hooks and the binary at a tree other than `$HOME/.memory`.
- `~/.config/coder-fleet/board.env` overrides the column names (`BOARD_COL_TODO`, `BOARD_COL_DOING`, `BOARD_COL_BLOCKED`, `BOARD_COL_BLOCKED_HUMAN`, `BOARD_COL_DONE`) if a repository's `.boards/config.yml` spells a status differently from the fleet's. `BOARD_COL_DOING` is unset by default, and `SubagentStart` writes whichever of `In Progress` or `Doing` the config lists; set, it wins on every board.
- `CODER_FLEET_BOARD=off`, or an empty file at `~/.local/state/coder-fleet/disabled`, switches board writes off without uninstalling anything. `BOARD_DRY_RUN=1` logs what would be written instead of writing it.
- The three board hooks log to `~/.local/state/coder-fleet/log/hooks.log` (and to stderr, so it shows in the transcript). Read that first when the board does not move. The scope hook logs to stderr only.

### Staying current

The plugin is semver'd and the version in `claude/coder-fleet/.claude-plugin/plugin.json` (mirrored in `.claude-plugin/marketplace.json`) is load-bearing: clients keep the cached copy until the number changes, so a release without a version bump is invisible. To pick up a new release:

```bash
claude plugin marketplace update rzem
```

The project template sets `autoUpdate: false` deliberately, so a project moves to a new fleet version when you run that and not when a background refresh decides to. The git history is the record of what changed between versions. For the machine half, `git pull` in the clone and re-run `claude/scripts/install-home.sh`.

### Checking the install, and working on the coder-fleet repo

From the root of the clone:

```bash
bash claude/evals/lib/check-all.sh    # every deterministic check: hook contracts, roster, workflow logic. No model, no network, no board
claude/evals/run.sh --list            # the eleven smoke evals and each agent's baseline
claude/evals/run.sh scout             # one agent's eval, model in the loop, via claude -p
```

Run `check-all.sh` before anything else after a change; `claude/evals/README.md` covers the runner's flags and environment. To test a local checkout as a plugin rather than the GitHub release, register the clone as a marketplace and install from it - it has the same marketplace name, so remove the GitHub one on that machine first:

```bash
claude plugin marketplace remove rzem
claude plugin marketplace add ./path/to/coder-fleet
claude plugin install coder-fleet@rzem
```

Put the GitHub marketplace back with `claude plugin marketplace add rzem-ai/coder-fleet` when you are done.

## Migrating from claudecode-agents

The plugin was called `claudecode-agents` until v0.25.0. On a machine that ran it:

1. Pull the coder-fleet repo and run `claude/scripts/install-home.sh`. It repoints the `rzem` marketplace at `rzem-ai/coder-fleet`.
2. Run `claude plugin install coder-fleet@rzem` once. The renamed plugin reports "not cached" until you do.
3. In each project's `.claude/settings.json`, change `agent` to `coder-fleet:lead`. Kickoff's lead check fails until you do.
4. Secrets moved from `~/.config/claudecode-agents` to `~/.config/coder-fleet`. The installer moves them; if both directories exist it leaves both and tells you to merge by hand.
5. Environment variables are now `CODER_FLEET_*`, with the same suffixes. An old `CLAUDECODE_AGENTS_*` name is ignored.

## Repo map

```
coder-fleet/
├── .claude-plugin/marketplace.json    name "rzem"; one entry, coder-fleet -> ./claude/coder-fleet
├── .github/workflows/checks.yml       CI: the deterministic suite on every push and pull request
├── .boards/                           one board for the repo, project name coder-fleet
├── README.md                          the front door for all three harnesses
├── AGENTS.md                          how to work on the coder-fleet repo, for any coding agent
├── LICENSE                            MIT
├── docs/                              fleet-design.md, agent-contract.md, limits.md, specs/, runs/
│
├── claude/
│   ├── coder-fleet/                   the Claude Code plugin: plugin.json, .mcp.json, agents, skills,
│   │                                  hooks, workflows, commands, board, templates
│   ├── agent-pairs/                   one source per editor role, rendered into its two agents
│   ├── evals/                         one smoke eval per agent, plus lib/ with the deterministic suite
│   ├── home/                          user-scope files the install script places
│   └── scripts/                       install-home.sh, gen-glossary-rule.sh, gen-agent-pairs.sh,
│                                      merge-settings.py, migrate-memory-board.sh
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

## Where things are decided

The design, [`docs/fleet-design.md`](docs/fleet-design.md), is the canonical document - "design section N" anywhere in the coder-fleet repo means that file. [`docs/agent-contract.md`](docs/agent-contract.md) is what the migration checklist checks agent bodies against. [`docs/limits.md`](docs/limits.md) is what the fleet deliberately does not enforce or cover, with the reason, so a gap is not mistaken for an oversight. [`AGENTS.md`](AGENTS.md) is the working agreement for changing the coder-fleet repo: the checks to run, the port rule, the release rule and the writing conventions.

## Licence

MIT, see [`LICENSE`](LICENSE). The board binary under `claude/coder-fleet/board/` is a pinned fork of [Backlog.md](https://github.com/MrLesk/Backlog.md), also MIT; its own `LICENSE` and `NOTICE.md` record the pin and what was kept.
