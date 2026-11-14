# coder-fleet for Claude Code

The Claude Code port of [coder-fleet](../README.md), and the one that is released: twelve role-shaped subagents delegated to from a coding session, the skills they share, the hooks that keep the board honest, the board itself, three workflows that chain the roles, the commands a human runs, and the evals that catch a regression before a model release does. It is published through the plugin marketplace `rzem`, from `.claude-plugin/marketplace.json` at the repo root.

The agents are roles, not personas: disposable by design, with fresh context on every spawn and their memory in the project's repository rather than in their heads. The fleet also maintains itself: a `fleet-steward` agent watches model releases and files PRs against the coder-fleet repo.

## The fleet

| Agent | Job |
|---|---|
| `lead` | Routes and gates, and builds what the human orders from the board card. Runs as the main session (the `agent` key in project settings), never spawned. Its body is six decisions; how it carries each out is the `lead-procedures` skill it preloads |
| `scout` | Cheap read-only reconnaissance: where is X, how does Y work. Locations and excerpts, never opinions |
| `spec-writer` | Turns a brain dump or a board item into a spec, preparing the questions the lead interviews you with first. Not used in a project whose `AGENTS.md` names its approved requirements with a `Requirements source: <path>` line |
| `spec-editor` | Challenges a spec draft once, after the interview and before the human edits it, in a Challenges section with inline markers. Never rewrites the prose. Runs on Opus |
| `coder` | Implements one item or sub-issue the human ordered, in its own git worktree, with a test for each bug fix or changed rule |
| `scripter` | Coder's cheaper sibling for small scripting and tooling items. Same worktree guard, smaller model |
| `reviewer` | The one checking agent. Reviews the diff and runs the declared gates on every spawn; in the modes the lead's brief names on its `Modes:` line, also tries to break the change with mutations (break, on an authentication or credential path or in the harden phase) and uses the running product to grade each acceptance criterion (use, where `AGENTS.md` has an `App start:` line). Logs each step's time to a progress log. Never edits the project |
| `ui-designer` | Screens, flows and HTML prototypes from a spec |
| `tech-writer` | READMEs, ADRs, runbooks and drafts from material that already exists |
| `tech-editor` | Edits every `tech-writer` document once, in place, before it ships. Checks each claim against the sources and adds none; what it cannot support goes in its handoff. Runs on Opus |
| `researcher` | Fan-out reading and synthesis with citations |
| `fleet-steward` | Weekly model and tooling sweep. Files PRs, never merges |

Each agent spawns under the plugin's prefix, `coder-fleet:coder` for `coder`. Each body in [`claude/coder-fleet/agents/`](coder-fleet/agents/) carries its model, effort, tool allowlist, preloaded skills and invariants; the reasoning behind every choice is in the fleet design, section 4.

## How it works

**Every agent ends with the same handoff.** Four headings - Done, Not done, Unverified, Decisions needed - with typed lines under the last (`Blocker:`, `Propose item:`), so the lead can merge a stack of handoffs without re-reading a stack of transcripts. The format is the `handoff` skill, preloaded everywhere and enforced by a hook.

**Hooks write the board; agents never do.** `SubagentStart` moves a board item to In Progress, `SubagentStop` writes Blocked by human (a `Blocker:` line in the handoff is what lands in the human queue), and `TaskCompleted` gates on tests before writing Done. The one column no hook writes is Next, between To Do and In Progress: the human's ordered queue, where only the human puts a card, and the lead takes it as an order and works the column top first before anything else queued. A fourth hook, `enforce-agent-scope.sh`, denies at `PreToolUse` the tool calls each agent's own invariants forbid - the per-agent boundary that session-scoped permissions cannot express, and `enforce-disabled-agents.sh` denies a spawn of any agent the project has switched off in `.claude/coder-fleet.json`.

**Workflows chain the roles.** `spec-to-card`, `review-round` and `deep-research` in [`claude/coder-fleet/workflows/`](coder-fleet/workflows/) run the multi-agent shapes deterministically instead of hoping the model sequences them. `review-round` grades the change in a worktree at the pinned head, never the main checkout or the one the lead's shell is in: the coder's clean worktree, read in place, or a detached one it cuts and removes when the run ends, and every lane that grades the tree reports the worktree and HEAD it ran in.

**Commands are the human's hands.** `/coder-fleet:init` sets a project up, `kickoff` preflights it and starts the first spec, `work` focuses the checkout on one board item so the hooks move that item, `board` opens or stops the board's web UI for this session, `agents` lists the fleet agents and switches one off or on for the project, `prune-worktrees` removes agent worktrees git can show were merged, `flush` lands nothing on the default branch, where the board and memory never go, says so in one line, and pushes the state branch, `drain` finishes the cards In Progress the human ordered, skipping the rest, and then works the Next column card after card without stopping to ask, parking a card on its question rather than waiting, and runs unattended under `/goal`, `triage` closes the In Progress cards that are fully ticked and merged, reports where the rest stand, and asks multiple-choice questions to unblock the Blocked and Blocked by human cards and answer their open Actions for Human, `ask` puts every open Actions for Human question on the board, in any column short of Done, to the human as a prompt to pick from and records each answer on its card, `sweep` reviews what merged lately for drift and files each finding as a card proposing the check that stops it returning, and `springclean` clears every Done card to completed that no open card depends on and that has no open child, in one board commit, and reports each card it held. They live in [`claude/coder-fleet/commands/`](coder-fleet/commands/).

**Everything is evalled.** Each agent has a smoke eval under [`claude/evals/`](evals/) run with `claude -p`, and `claude/evals/lib/check-all.sh` runs every deterministic check - hook contracts, roster consistency, workflow logic - with no model, no network and no board.

## Installing

The coder-fleet repo is a Claude Code plugin marketplace named `rzem` with one plugin in it, `coder-fleet`, plus optional user-scope settings for a machine that runs the fleet. The first layer below is all you need: the plugin needs no credentials on the machine and no install script. The second hardens the machine as a whole.

### Prerequisites

- **Claude Code** with plugin support. `claude plugin --help` should list `marketplace` and `install`; if it does not, update Claude Code first.
- **git**, 2.31 or later. The coder-fleet repo is public, so the clone, the marketplace add and background marketplace refreshes all work over plain HTTPS with no credentials. Only pushing changes back needs auth. The board root resolution uses `git rev-parse --path-format=relative`, which needs 2.31.
- **jq**. Every board hook and the eval runner use it.
- **python3**. The install script's settings merge and the scope hook's write-path check.
- **node**. Only for `claude/evals/lib/check-all.sh`, which syntax-checks the workflows and runs their logic tests.
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

What this gives up: Claude Code on the web has no machine-level install, and it reads only what the repo commits, so a cloud session does not pick the fleet up on folder trust. A project that needs the fleet on the web adds `"enabledPlugins": {"coder-fleet@rzem": true}` to its committed `.claude/settings.json` and accepts the per-path records that come with it on every developer machine. That is a per-project choice, and the template does not make it for you.

**Verify.** `claude plugin list` shows `coder-fleet@rzem` as enabled. Inside a session, `/agents` lists the twelve fleet agents under the plugin. If the plugin installed but the agents are missing, the marketplace cache is stale - see *Staying current* below.

**The command route.** With the plugin installed, `/coder-fleet:init` inside a session does the whole per-project setup in one pass: it merges the three settings keys, copies the AGENTS.md skeleton and the glossary rule into the project, creates `docs/specs/`, then reads the repo and interviews you to fill every `<FILL: ...>` marker. If the project root has a `CLAUDE.md` and no `AGENTS.md`, init offers to rename it, because Claude Code ignores an `AGENTS.md` that a `CLAUDE.md` shadows. Re-running it is safe - it skips what already exists and only offers to fill markers still present.

**Editors.** `spec-editor` and `tech-editor` run in every project, like every other agent, and `/coder-fleet:agents disable` is the one way to switch either off. What an earlier `/init` wrote for the editors - `Spec editor:` and `Tech editor:` lines in `AGENTS.md`, and editor deny rules in `.claude/settings.json` or `settings.local.json`, the removed `-fable` forms included - is a leftover. Kickoff lists them and offers once to remove them through `claude/coder-fleet/scripts/editor-leftovers.py`, which deletes exactly those and leaves every other byte; on a no it changes nothing and says a deny rule keeps its editor from running. The challenge gate reads `disabledAgents` and not permission rules, so a project that keeps a `spec-editor` deny rule should disable the editor through `/coder-fleet:agents` too, or the gate refuses its specs. A spawn of a denied definition by its `coder-fleet:` name fails with "has been denied by permission rule". A spawn by the bare name, such as `spec-editor`, reads "not found" whether or not a rule exists, because a plugin agent never resolves by its bare name; that is expected and not a sign the rule failed.

Nothing init writes is live until the next session - settings, `AGENTS.md` and the plugin itself all load at startup - so init ends by telling you to restart, trust the folder, and run `/coder-fleet:kickoff`. Kickoff preflights the install (agents present, lead in charge, no markers left, skeleton and work directories in place), and fails if a `CLAUDE.md` or `CLAUDE.local.md` at the project root or above it shadows `AGENTS.md`. It then checks the board when the binary answers - `.boards/config.yml` here, its six statuses, the outcome labels, the `.gitignore` - and ends by stating the conventions: root, the `BD` prefix, status names, labels, and the item-ref binding. It cannot tell whether the binary on this machine is current, and says so. On a green preflight it takes the idea you typed after it - or asks for one - and starts the spec pipeline on it. On a red preflight it lists the fixes and stops; declining the board is never red.

**Optional: the project skeleton by hand.** `claude/coder-fleet/templates/AGENTS.md` is a project AGENTS.md with `<FILL: ...>` markers for the things that differ per project, and `claude/coder-fleet/templates/rules/glossary.md` is the generated glossary rule it refers to. Copy both into the project (`AGENTS.md` at the root, the rule under `.claude/rules/`) and fill the markers. Never edit the glossary rule by hand - it is generated from the `glossary` skill by `claude/scripts/gen-glossary-rule.sh`.

**Optional: switch agents off for a project.** A project that wants to go without a fleet agent lists it in `.claude/coder-fleet.json` in its main checkout, or runs `/coder-fleet:agents disable <agent>`, which edits that file:

```json
{ "disabledAgents": ["researcher"] }
```

Names are agent names, bare or `coder-fleet:`-prefixed. No file, or no `disabledAgents` key, is the whole fleet, so deleting the entry restores today's behaviour exactly. The file that counts is the main checkout's, read live: uncommitted edits count, and a linked worktree's copy never does, from whichever worktree the lead, the hook or the command runs. The lead stops spawning a listed agent, `review-round` reads the file itself, and a `PreToolUse` hook denies any spawn that still asks for one, with a message naming the file. The file is read on every spawn, so an edit takes effect on the next one with no restart. `lead`, `coder` and `reviewer` cannot be disabled: listing one makes the file invalid, nothing in it is honoured, every spawn carries a warning saying why, and `check-all.sh` fails when the main checkout's copy is invalid. Outside a git repository, or when the main checkout is bare, no `.claude/coder-fleet.json` is read and nothing is disabled. The `refuter` and `evaluator` agents are gone, folded into the reviewer's break and use modes: a project that still lists either keeps a valid file, `--check` warns that the entry matches no fleet agent, and it disables nothing.

Rather than edit the file by hand, run `/coder-fleet:agents`: with no argument it lists every fleet agent and whether it is enabled, `/coder-fleet:agents disable researcher` adds the agent to `disabledAgents` (creating the file if absent) and `/coder-fleet:agents enable researcher` takes it off again. A script does the edit with the same validation the hook uses, so it refuses a core agent, a name that is not a fleet agent or an invalid file and leaves the file untouched, and it stores names bare, sorted and deduplicated. The change applies from the next spawn with no restart. The command writes the file and does not commit it.

**The build and harden phases.** The same file sets how hard `review-round` works an item: `{ "phase": "build" }` or `{ "phase": "harden" }`. Build is the default - no file, no key, or any other value, which is reported and read as build. A read that fails - no main checkout, a file that cannot be read, or a file that does not parse, such as one with a trailing comma - is harden, with the reason logged, because it says nothing about what was chosen and must never remove a break lane or a fix round. In build a run reviews one round and commissions no fix round itself, even under `fix: true`, so blocking findings come back to the lead; reports every Low finding without fixing it; spawns a break-mode reviewer only when the diff touches an authentication or credential path; and reports follow-ups and proposals without filing them. Harden is the full loop of fix rounds, Low fixes and refutation. A branch cannot put itself in build to skip its break lane: a round whose reviewed range changes `.claude/coder-fleet.json` refutes as harden would. `/coder-fleet:agents phase` shows the phase, and `/coder-fleet:agents phase build` or `phase harden` sets it, with the same rules as the disabled list; it applies from the next `review-round` run with no restart.

**The base branch, push policy and release setting.** Three more keys in the same file, each independent of the other two and of the rest. `baseBranch` names the local branch the fleet treats as the trunk; unset, the trunk is the branch the remote's HEAD names, the remote being `origin` or the only one, else `main`. A `baseBranch` that is not a branch name or names no local branch in the main checkout is invalid, and the trunk is then not resolved at all rather than guessed. `push` is `all`, which is also what unset means, or `base-only`. `release` is `off`, `tag` or `github`; unset is its own state, not `off`, and leaves the project's shipping words to decide. `push` and `release` each guard something that reaches a remote, so an invalid value, or a file that cannot be read, resolves as the strict one: `base-only` for `push`, `off` for `release`. `hooks/lib/fleet-config.sh` reads all three, and its `fleet_trunk`, also run as `scripts/fleet-trunk.sh`, is the one resolver of the trunk. `/coder-fleet:agents base`, `push` or `release` shows each and where it came from, the setting or the fallback, and sets one with a value or clears it with `--unset`, under the same write rules as the phase; `/coder-fleet:agents` with no argument shows all three after the agents. Every hook, script and command that reads the trunk uses the base branch; `push: base-only` lands each card on it as one squashed commit with no pull request, and the scope hook refuses every other push. A `Shipping:` line and `release` never contradict: the setting decides whether a release is cut, `off`, a `tag` or a `github` release, and the shipping words decide how far the lead goes. `lead-procedures` has the rules under Shipping and Worktrees and memory.

### 2. Harden the machine (optional)

The user-scope half: the hardened `~/.claude/settings.json`, the user CLAUDE.md, rules and any local agent copies that live in `claude/home/`. The fleet runs without it - the task-tools flag it needs comes from the project settings `/init` writes - so this is for protection that covers every Claude Code session on the machine, fleet project or not: the credential deny list, the bash sandbox and its network allowlist.

```bash
git clone https://github.com/rzem-ai/coder-fleet.git ~/Dev/coder-fleet
cd ~/Dev/coder-fleet
claude/scripts/install-home.sh --dry-run      # show what would change, change nothing
claude/scripts/install-home.sh                # merge the settings
```

What it does, and does not do:

- `claude/home/settings.json` is **merged** into `~/.claude/settings.json`, never copied over it. Your model, enabled plugins, status line and hand-added deny rules survive; the fleet's deny list, sandbox and network allowlist are added. `claude/scripts/merge-settings.py` is the policy.
- Everything else in `claude/home/` is copied, not symlinked, because Cowork ignores a symlinked `~/.claude/CLAUDE.md`. An existing symlink is replaced with a real file.
- Anything it is about to overwrite is backed up first under `~/.local/state/coder-fleet/backups/<timestamp>/` (override with `CODER_FLEET_BACKUP_DIR`).
- It never touches `~/.claude/projects/`, sessions, history, todos, logs or `plugins/cache`. The guard is enforced in the script, not just documented.
- Per-box differences go in `claude/home/hosts/<short-hostname>/`, copied over the base tree after it.
- `CLAUDE_CONFIG_DIR` is respected if you keep Claude Code's config somewhere other than `~/.claude`.

It is safe to re-run. Unchanged files are left alone and the summary at the end says what was created, updated and skipped.

### The board

The board needs no secret at all. It is a directory of markdown files at `.boards/`, created by `/coder-fleet:init` and committed by the plugin's own `board` binary after every write, in a state worktree of its own at `.claude/worktrees/coder-fleet-state` on the `coder-fleet/state` branch, so no board write commits on the default branch or a feature branch (`docs/board-config.md`, Where the board lives). `/coder-fleet:init` keeps the board, the fleet's memory and specs out of the project's history with `.git/info/exclude`, the memory hook commits specs on the state branch too, and `hooks/state-push.sh` pushes the state branch after each board, memory and spec commit, so a clone gets the board and its specs back. CI builds that binary for macOS on Apple silicon, Linux x64 and arm64, and Windows x64 and arm64 on every release, and the plugin fetches the one for its platform and version at session start into its own data directory, checked against the release's `SHA256SUMS`; nothing is built on the machine. `CODER_FLEET_BOARD_DOWNLOAD=off` turns the fetch off, for a machine that builds its own with `claude/coder-fleet/board/build.sh`. Apart from that one fetch, the session-start fast-forward and the push of the state branch, the hooks make no network call and read no token; without the binary they log a `board shim missing` or a `board <cmd> failed` line and leave the board alone, and the agents themselves work fine, so a machine where the fetch has not happened yet is a working install. Two workflow steps need the board: `review-round` with `fix: true` reads the card before it commissions a fix, and `spec-to-card` files criteria onto it: the approved spec's on its second run, or, in a project whose `AGENTS.md` has a `Requirements source: <path>` line, the requirement clauses the item answers, in clause order, with no spec at all. Without the binary both stop as `could not read the board` and file nothing.

What each key in the board's `.boards/config.yml` does, its default, and whether the fleet depends on it is in [`docs/board-config.md`](../docs/board-config.md).

A clone without the plugin has the `.boards/` files and no hooks to move them - a readable board nobody moves. That is acceptable.

Knobs, all optional and all environment variables (the project's `.claude/settings.json` `env` block is the usual place); the column names are fixed, so a repository whose `.boards/config.yml` spells a status differently fixes the config:

- `CODER_FLEET_BOARD_ROOT` points the hooks and the binary at a tree other than the repository's own `.boards/`.
- `CODER_FLEET_BOARD=off`, or an empty file at `~/.local/state/coder-fleet/disabled`, switches board writes off without uninstalling anything. `BOARD_DRY_RUN=1` logs what would be written instead of writing it.
- The three board hooks log to `~/.local/state/coder-fleet/log/hooks.log` (and to stderr, so it shows in the transcript). Read that first when the board does not move. The board binary writes there too, from the hooks and the MCP server alike, whenever a write's commit did not happen: `commit failed` when git refused it, such as a stale `index.lock`, and `commit skipped` when something asked for no commit, such as `auto_commit` off. The scope hook logs to stderr only.

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
claude/evals/run.sh --list            # the fourteen smoke evals and each agent's baseline
claude/evals/run.sh scout             # one agent's eval, model in the loop, via claude -p
```

Run `check-all.sh` before anything else after a change; `claude/evals/README.md` covers the runner's flags and environment. To test a local checkout as a plugin rather than the GitHub release, register the clone as a marketplace and install from it - it has the same marketplace name, so remove the GitHub one on that machine first:

```bash
claude plugin marketplace remove rzem
claude plugin marketplace add ./path/to/coder-fleet
claude plugin install coder-fleet@rzem
```

Put the GitHub marketplace back with `claude plugin marketplace add rzem-ai/coder-fleet` when you are done.

## Layout

```
claude/
├── README.md                          this file
├── coder-fleet/                       the plugin: .claude-plugin/plugin.json, .mcp.json, agents, skills,
│                                      hooks, workflows, commands, scripts, board, templates
├── evals/                             one smoke eval per agent, plus lib/ with the deterministic suite
├── home/                              user-scope files the install script places
└── scripts/                           install-home.sh, gen-glossary-rule.sh, merge-settings.py
```

## Where things are decided

The design, [`docs/fleet-design.md`](../docs/fleet-design.md), is the canonical document - "design section N" anywhere in the coder-fleet repo means that file. [`docs/agent-contract.md`](../docs/agent-contract.md) is what the migration checklist checks agent bodies against. [`docs/limits.md`](../docs/limits.md) is what the fleet deliberately does not enforce or cover, with the reason, so a gap is not mistaken for an oversight. [`AGENTS.md`](../AGENTS.md) is the working agreement for changing the coder-fleet repo: the checks to run, the port rule, the release rule and the writing conventions.

The board binary under `coder-fleet/board/` is a pinned fork of [Backlog.md](https://github.com/MrLesk/Backlog.md), MIT like the rest of the repo; its own `LICENSE` and `NOTICE.md` record the pin and what was kept.
