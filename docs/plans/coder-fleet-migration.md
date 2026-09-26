# Coder-fleet: one name, one repo, three harnesses

Status: design, awaiting the human's review. Written 26 September 2026. The implementation plan follows this document once it is approved and lives beside it.

## Problem

The fleet is called `claudecode-agents` because it began as a Claude Code plugin. It is now also an OpenCode port in `rzem-ai/opencode-agents` and a Codex port in a local repo with no remote, `gptcode-agents`. Three names for one thing, three repos for one design, and a design document that lives in only one of them. The name also lies in the other direction: the OpenCode port carries a hand-corrected copy of the glossary because the generated one says "Claude Code" in every mapping column.

The fleet's name is `coder-fleet` on every harness. One repo, `rzem-ai/coder-fleet`, holds all three ports and the design they share.

## Non-goals

- No change to what any agent does. Bodies, skills, hooks, workflows and the board binary move and get renamed; their behaviour is the same before and after, and the deterministic suite is the proof.
- No shared-core refactor. The three ports stay three separate trees. A generator that emits each harness's format from one source is a later design, and the layout below leaves room for it.
- No progress on the OpenCode or Codex ports themselves. They arrive in the state they are in, uncommitted OpenCode edits included, and their own plans carry on afterwards under the new paths.
- No history migration. The new repo starts from a clean tree. The old repos are archived and remain the record of how the fleet got here.
- No changelog, per the repo's standing rule.

## Layout

```
coder-fleet/
├── .claude-plugin/marketplace.json    name "rzem"; one entry, coder-fleet -> ./claude/coder-fleet
├── .github/workflows/                 CI runs the deterministic suite from its new path
├── .boards/                           one board for the repo, project name coder-fleet
├── README.md                          the front door for all three harnesses
├── AGENTS.md                          rules for any agent changing this repo
├── LICENSE
├── docs/                              fleet-design.md, agent-contract.md, limits.md, plans/, runs/
│
├── claude/
│   ├── coder-fleet/                   the Claude Code plugin: plugin.json, .mcp.json, agents, skills,
│   │                                  hooks, workflows, commands, board, templates
│   ├── evals/                         smoke evals and lib/, the deterministic suite
│   ├── home/                          user-scope files for a machine that runs the fleet
│   └── scripts/                       install-home.sh, gen-glossary-rule.sh
│
├── opencode/
│   ├── coder-fleet/                   today's .opencode/ contents plus opencode.json
│   ├── test/                          the invariant tests
│   └── docs/                          divergence register, measurements, findings, port plan and spec
│
└── codex/
    ├── coder-fleet/                   empty; the port's config, agents and skills land here
    └── docs/                          the GPTA-1 spec, plan and findings
```

The rule the tree follows: `<harness>/coder-fleet/` is the installable unit for that harness, and everything beside it under `<harness>/` is tooling and notes for that port. `docs/` at the root is the design every port implements.

### Why the plugin sits two levels down and keeps a different folder name

Claude Code resolves a marketplace by `.claude-plugin/marketplace.json` at the repository root and nothing else about the layout. A plugin entry's `source` is a relative path from that root at any depth, with `..` the only thing forbidden. At install, only the plugin directory is copied into `~/.claude/plugins/cache/rzem/coder-fleet/<version>/`, named by the marketplace entry, never by the folder. A file above the plugin directory is not copied and a component path that escapes it is rejected. So the plugin directory must be complete on its own, which is why the evals, home files and scripts sit beside it rather than inside it, and why nothing in the tree depends on the folder being called `claude`.

The whole repo is still cloned into `~/.claude/plugins/marketplaces/rzem/`, as it is today. The OpenCode and Codex trees ride along in that clone and cost nothing at load time.

### What the web cannot do, before and after

A cloud session at claude.ai/code ignores `extraKnownMarketplaces`, because that needs the workspace trust dialog and a cloud session never shows one. On the web a plugin loads only from Anthropic's marketplaces, as a plugin synced from the claude.ai account, or from a project's `.claude/skills/`. The fleet does not load on the web today and this move does not change that. The desktop app and the terminal share the full marketplace path.

## The rename

### Plugin, prefixes and paths

The plugin's `name` becomes `coder-fleet` in `plugin.json` and in the marketplace entry, version `0.25.0`, continuing the line. With it every namespace the name feeds changes: agent types `coder-fleet:coder` and the other ten, commands `/coder-fleet:kickoff` and the rest, skills, the SubagentStop matcher, and the MCP prefix `mcp__plugin_coder-fleet_board__*` named in the agent bodies and their evals. The project settings template points `agent` at `coder-fleet:lead` and the marketplace source at `rzem-ai/coder-fleet`. The repo refers to itself as "the coder-fleet repo".

The marketplace carries a top-level `renames` map, `{"claudecode-agents": "coder-fleet"}`. On Claude Code v2.1.193 or later that map rewrites the old key to the new one in `enabledPlugins` and `pluginConfigs` across user, project and local settings. The map is append-only history and never leaves the file.

### Environment variables and the secrets directory

Nineteen environment variables carry the `CLAUDECODE_AGENTS_` prefix, around 150 references across the hooks, the board binary, install-home.sh and the tests. They become `CODER_FLEET_` with the suffix unchanged, so `CLAUDECODE_AGENTS_BOARD_ROOT` is `CODER_FLEET_BOARD_ROOT`. The secrets directory `~/.config/claudecode-agents` becomes `~/.config/coder-fleet`, and the backup directory under `~/.local/state` moves with it. `install-home.sh` moves an existing secrets directory to the new path if the old one exists and the new one does not, and rewrites the three places in user settings that deny reads of it. No compatibility shim: an old name in the environment is ignored, and the suite fails on any remaining old name.

### The project instruction file is AGENTS.md

Claude Code reads `AGENTS.md` as project instructions directly since v2.1.277, and OpenCode and Codex have always read it, so it is the one instruction file every harness in this repo shares. The plugin still tells projects to write `CLAUDE.md`: the template is `templates/CLAUDE.md`, `init` copies it to `CLAUDE.md` and walks its markers, `kickoff` checks that `CLAUDE.md` exists, and the README, the design and the compound skill describe it by that name. All of that changes to `AGENTS.md`: the template is renamed, `init` writes `AGENTS.md`, `kickoff` checks for it, and the prose follows.

One rule from the docs shapes `init` and `kickoff`. By default Claude reads `AGENTS.md` only when no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` exists in the working directory or any directory above it; if one does, Claude reads those and silently ignores `AGENTS.md`. `~/.claude/CLAUDE.md` and `.claude/rules/` do not count and load alongside. So `init`, on finding an existing `CLAUDE.md` at the project root, offers to rename it to `AGENTS.md` and merge the template's missing sections, rather than writing a second file that would never load. And `kickoff`'s skeleton check fails, with the path, when an `AGENTS.md` is shadowed by a `CLAUDE.md` or `CLAUDE.local.md` at the root or above it, unless the project-instructions setting is `claude-md-and-agents-md`. The glossary rule under `.claude/rules/` is untouched by any of this.

### Instruction files

The root `AGENTS.md` gains a section on the ports carrying the one rule both port CLAUDE.md files hold: a port does not invent, every artefact traces back to its counterpart under `claude/coder-fleet/`, the harness wins on file layout and frontmatter, the fleet wins on behaviour and vocabulary, and a deliberate divergence is recorded in that port's divergence register. The per-port `CLAUDE.md`, `.claude/` and `.remember/` directories do not come across.

The README becomes the front door for all three, with the Claude Code install rewritten for `coder-fleet@rzem`, a status line per port, and the design pointer unchanged.

### Board

The repo's board and the Codex board fold into one at `.boards/`, project name `coder-fleet`. The four item files copy across unchanged, so BD-1 and GPTA-1, 1.1 and 1.2 keep their ids, comments and statuses. New items take the prefix `CF`. The board binary's own naming, its package name and the environment variables above, changes with the rest.

## Machines already running the fleet

After the new repo is public, each machine does three things, and `install-home.sh` does the first two:

1. Repoint `extraKnownMarketplaces.rzem.source.repo` in user settings to `rzem-ai/coder-fleet`. A changed source triggers a re-fetch of the marketplace.
2. Run `claude plugin install coder-fleet@rzem` once. For a git-hosted marketplace a renamed plugin reports "not cached" until that install, even after the `renames` map has rewritten the settings key.
3. In each project seeded from the old template, change `agent` in `.claude/settings.json` from `claudecode-agents:lead` to `coder-fleet:lead`. The kickoff preflight names any project still on the old value.

Old plugin versions in the cache are swept by Claude Code fourteen days after they are orphaned.

## Old repos

`rzem-ai/claudecode-agents` is public and `rzem-ai/opencode-agents` is private. Each gets a final commit replacing its README with a pointer to `rzem-ai/coder-fleet` and the new path of its contents, then is archived on GitHub. `gptcode-agents` has no remote and is not pushed anywhere; its tree is copied and the local directory is left for the human to remove. All three local directories stay until the acceptance criteria below have passed on this machine.

## Acceptance criteria

- `rzem-ai/coder-fleet` exists, public, with the layout above and a single initial commit followed by the rename commits, the first release subject starting `v0.25.0:`.
- `claude plugin validate .` passes at the new root and `claude plugin validate ./claude/coder-fleet` passes for the plugin.
- `bash claude/evals/lib/check-all.sh` passes, run from the new root, with the roster, hook contracts, glossary rule, handoff parity and workflow logic checks all green. CI runs the same command.
- `grep -rI claudecode-agents` and `grep -rI CLAUDECODE_AGENTS` over the new repo return nothing outside the `renames` map, the README pointer text, `docs/limits.md`, and the ports' divergence records that describe history.
- On this machine, after `install-home.sh`: `/plugin marketplace update rzem` and `/plugin install coder-fleet@rzem` load the plugin, `claude plugin details coder-fleet` lists eleven agents, five commands and the skills under the new prefix, and one spawn of a fleet agent against a board item moves it to Doing and passes the handoff gate on stop.
- The opencode invariant tests pass from `opencode/test/`.
- `grep -rI 'CLAUDE\.md'` over the new repo returns only the lines in `init` and `kickoff` that handle a pre-existing `CLAUDE.md`, and the docs sentences that explain the shadowing rule. `init` run in a scratch project writes `AGENTS.md`, and `kickoff` there reports the skeleton present; with a `CLAUDE.md` placed above the scratch project, `kickoff` reports it as shadowing and names the path.
- `~/.config/coder-fleet` holds what `~/.config/claudecode-agents` held, mode 600, and the old directory is gone.
- The two GitHub repos are archived with pointer READMEs.

## Open questions

None outstanding. The decisions taken in the design conversation on 26 September 2026: layout as above; fresh history; environment variables and the secrets directory rename in this release; version 0.25.0; the new repo is public.
