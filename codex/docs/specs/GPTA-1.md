# GPTA-1: Port the claudecode-agents plugin to the Codex CLI

Status: draft. The first pass was written before any interview. Alex has since decided five open questions (3, 10, 19, 20 and 21), and the GPTA-1.1 spike has tested the Codex claims this spec rests on against codex-cli 0.156.1. This revision is a desk pass against that evidence, not an interview: every default re-derived here is the author's until Alex accepts it. Each line carries one of these markers:

- Unmarked: given in the brief from the lead, stated in this repo's `CLAUDE.md`, or read from the source fleet or the opencode-agents precedent.
- *(verified 0.156.1)*: observed in the GPTA-1.1 spike on codex-cli 0.156.1 on 25 September 2026, recorded in `docs/findings/GPTA-1.1-codex-hooks.md`.
- *(researched)*: a fact about Codex taken from its docs or issue tracker on 25 September 2026, cited in Sources and not yet observed on the install. Docs and issues disagree in places, and where they do the line says so.
- *(supplied)*: the author's guess or recommendation. These are the lines to edit first.
- *(decided 25 Sep)*: Alex's answer, relayed by the lead.
- *(settled by GPTA-1.1)*: an open question the spike answered with evidence. The line says how.

Every question an interview would have asked stands in Open questions with a recommended default, ordered so the answers that change the shape of the port come first.

## Problem

The fleet at `claude/coder-fleet/` imposes a discipline on agent work: a spec before a plan, a plan the human approves before code, one coder per phase, a reviewer on every diff, a four-heading handoff out of every subagent, and a board whose columns only hooks write, with "blocked by human" as the one column the human watches. It runs only inside Claude Code.

The human wants the same discipline available in the OpenAI Codex CLI. `codex/` holds that port, and the ports section of the root `AGENTS.md` fixes the rules: it ports rather than invents, every artefact traces to its source, Codex wins on file layout and frontmatter, the fleet wins on behaviour and vocabulary.

There is a concrete reason this matters now. On 24 September 2026 Codex, run outside the fleet on `fathom-rzem-ai`, landed five commits straight on `main` with no board move, no review round and no trailer, and silently contradicted two written requirements. Reconciling it took a lead session and four new sub-issues. The fleet's discipline did not fail there; it was simply absent, because nothing of it runs inside Codex. The port is how it gets there.

The inventory to account for: 11 agents (lead, scout, spec-writer, coder, scripter, reviewer, refuter, ui-designer, tech-writer, researcher, fleet-steward), 8 shipped skills (glossary, board, handoff, compound, migration-checklist, looping, run-article, humanize), 5 commands (init, kickoff, board, work, prune-worktrees), 3 workflows (deep-research, review-round, spec-to-plan), 4 hook bindings in `hooks/hooks.json` (SubagentStart, SubagentStop, TaskCompleted, PreToolUse), one MCP server (the `board` binary), templates, per-agent evals and `scripts/install-home.sh`. `skills/board-linear/` exists in the source as an empty directory and is not an artefact *(decided 25 Sep)*.

### Codex is a much closer target than OpenCode was

The target is codex-cli 0.156.1, the version installed on Alex's machine *(decided 25 Sep)*. GPTA-1.1 checked the load-bearing claims against it; the rest are still from the docs.

The OpenCode port had to rebuild the fleet's hooks, its enforcement and its subagent model from scratch because OpenCode had none of them. Codex has the hooks the fleet depends on, and they do what the fleet needs once trusted *(verified 0.156.1)*. What the spike disproved is the per-agent sandbox, which the earlier draft had counted as a stronger lock than the fleet's.

| Fleet mechanism | Codex counterpart | Confidence |
|---|---|---|
| Agent markdown with frontmatter | Custom agents as TOML files; required `name`, `description`, `developer_instructions`; may also set model, reasoning effort, sandbox, MCP servers and enabled skills. A TOML custom agent spawns, and its `name` arrives in hooks as `agent_type` | Verified 0.156.1 for loading, spawning and the name; the other keys documented |
| `model:` and `effort:` | `model` and `model_reasoning_effort` per agent, resolved spawn value, then `[agents]` default, then parent | Documented |
| Agent / Task spawning | Built-in subagents (`spawn_agent`), configured under `[agents]` in `config.toml`. `task_name` on a spawn must be snake_case (`spike_worker`); a hyphen is rejected, while the agent's own `name` may keep one | Verified 0.156.1 |
| SubagentStart, SubagentStop, PreToolUse hooks | All three fire for a custom subagent. `features.hooks` is stable and on by default; `features.codex_hooks` is a deprecated alias and nothing needs enabling. Every non-managed hook needs a one-time trust step first, and an untrusted hook is skipped without any message (see Constraints) | Verified 0.156.1 |
| SubagentStart payload | `session_id`, `turn_id`, `transcript_path`, `cwd`, `model`, `permission_mode`, `agent_id`, `agent_type`. No spawn prompt, the same as Claude Code, so the `.boards/.focus` binding carries across as designed. `hookSpecificOutput.additionalContext` reaches the subagent | Verified 0.156.1 |
| SubagentStop exit 2 rejecting a malformed handoff | SubagentStop carries `last_assistant_message`. `{"decision":"block","reason":...}` sends the subagent back with the reason, and the second call carries `stop_hook_active: true` so a hook can avoid looping | Verified 0.156.1 |
| PreToolUse exit 2 denial | PreToolUse fires for shell (`tool_name` `Bash`), `apply_patch` (patch body in `tool_input.command`) and MCP calls (`mcp__<server>__<tool>`), each with top-level `agent_type` when called from a subagent and without it when called by the main session. `hookSpecificOutput.permissionDecision: "deny"` stopped an `apply_patch` edit. The parent's own `spawn_agent` also passes through PreToolUse, with the target agent inside `tool_input` | Verified 0.156.1 for firing on all three and for the deny on `apply_patch`; deny on shell and MCP not yet observed |
| Skills (`SKILL.md`) | Same format, `~/.codex/skills/` or plugin-bundled; `agents/openai.yaml` with `allow_implicit_invocation: false` makes a skill explicit-only, invoked as `$name` | Documented |
| Plugin + marketplace + `${CLAUDE_PLUGIN_ROOT}` | Plugins with `.codex-plugin/plugin.json`, bundling skills, MCP servers and hooks; hook commands get `PLUGIN_ROOT` and `PLUGIN_DATA` | Documented, but an older issue reports plugin hooks not executing (#16430) |
| MCP server (`board`) | MCP supported, stdio and HTTP. A subagent's call to a stdio stub server reached PreToolUse, then failed with "MCP tool call requires approval, but approval policy is never" under `approval_policy = "never"` | Verified 0.156.1 for the call and the approval failure; the fix for the approval failure is unknown |
| Frontmatter tool scoping | Per-agent `sandbox_mode = "read-only"` is not applied to a spawned subagent: its rollout shows the parent's `workspace-write`. It is not a lock. Beta permission profiles with filesystem deny rules exist and govern shell commands only | Verified 0.156.1 for the sandbox (round 1; a stricter re-check is in GPTA-1.2); profiles documented only |

What Codex does not have, as far as the docs and the spike say:

- **No agents in plugins** *(researched)*. `plugin.json` has no `agents` key; custom agents must be placed in an agents directory by some other means. Open feature requests #18988 and #28491.
- **No worktree isolation for subagents** *(researched)*. A spawned subagent inherits the parent's cwd, and there is no `cwd` parameter on `spawn_agent`. Open requests #18969 and #23095. Question 10 settles what coder does instead.
- **No per-agent sandbox** *(verified 0.156.1)*. See the table. The OS-level lock the earlier draft counted on does not exist for subagents.
- **No custom slash commands** *(researched)*. Custom prompts in `~/.codex/prompts` are deprecated in favour of skills, and reportedly stopped appearing from codex-cli 0.117.0 (#15941).
- **No TaskCompleted event and no TaskCreate counterpart** that a hook can observe *(researched)*. The docs name no event for a task finishing.
- **No deterministic workflow runtime** equivalent to the fleet's `phase()` and `agent()` JavaScript.
- **No path-scoped rules** *(researched)*. Nothing resembles `.claude/rules/` with a `paths:` header; the nearest is nested `AGENTS.md` per directory.
- **Project hooks are reported ignored inside a git worktree** (#27133) *(researched)*; user-level hooks reportedly still fire. Neither half is verified: GPTA-1.2 checks both after the quota reset. Since coder runs in the main checkout (question 10) and hooks install at user level (question 3), this now only matters when Alex runs Codex from a worktree himself.
- **Project `.codex/` loads only in a trusted project** *(researched)*, including project-scoped agents.
- **Hooks run only once trusted** *(verified 0.156.1)*. See Constraints.

Two things the port must not claim as losses. The fleet's Blocked-on-failure transition has never fired, because Claude Code's SubagentStop payload has no status field; the Codex payload has none either *(verified 0.156.1)*, so nothing is lost and nothing is to be rebuilt. And SubagentStart never saw the spawn prompt in the fleet either.

## Dependencies outside this repo

The glossary generator in `claudecode-agents` (`scripts/gen-glossary-rule.sh`) gains a Codex target, so that this repo's glossary is generated with Codex mappings and this repo's "never edit it here" rule holds *(decided 25 Sep)*. That change is work in the source repo, tracked there, and this port depends on it rather than doing it. It is the one planned change to the source fleet, and it happens under that repo's own process, not as a write from this project.

## Constraints the spike surfaced

**Hook trust is part of the install, and its failure is silent** *(verified 0.156.1)*. Before a non-managed hook runs, a human has to review and trust it in the interactive `/hooks` screen. Codex records trust in `config.toml` under `CODEX_HOME`, one `[hooks.state."<path to hooks.json>:<event>:0:0"]` table per hook holding a `trusted_hash = "sha256:..."`. A hook that is new, or whose definition has changed since it was trusted, is skipped, and nothing says so: in two spike rounds no log or transcript carried any trust-refusal message. No config key or CLI command grants trust non-interactively; the only way around it is `--dangerously-bypass-hook-trust`, which applies to every hook, including those in any repo Alex clones.

For this port that means an untrusted fleet looks exactly like an installed one while enforcing nothing: no scope lock, no default-branch guard, no handoff check, no board moves. That is the Fathom outcome with no warning, and question 3's guard on every session is the first thing it switches off. Every fleet upgrade that changes a hook re-arms the wall. It is a safety requirement, not an install detail, and question 22 decides how the port meets it.

Two things are not yet known. Whether the trusted hash covers only the `hooks.json` entry or also the script it runs *(researched: the docs say "the exact hook definition"; unverified)*, which decides whether a script edit silently runs unreviewed code or silently switches the hook off. And issue #47285 reports that one approval in `/hooks` trusts every pending hook at once, across plugins and events *(researched)*, so trusting the fleet's hooks can also trust whatever else is pending.

**Codex usage is capped, and every live check spends it** *(verified 0.156.1)*. The spike ran under a ChatGPT sign-in and hit the plan's usage limit partway through round 3, with a reset four days later. Every model eval, every end-to-end acceptance check below and every round of a spike draws on the same quota as Alex's own work. The deterministic checks cost nothing. Question 9 decides the account, and question 17 how evals budget it.

## Non-goals

Improving the fleet. A behaviour wrong in `claudecode-agents` is ported wrong and fixed upstream in a separate issue, as the OpenCode port did with the handoff parser. *(supplied, carried from the opencode-agents precedent)*

Writing to `claude/coder-fleet/` from this port. It is read-only reference material. The glossary generator change above happens under `claude/` as its own work.

Building the Blocked-on-failure transition. It has never worked in the source, so it is not part of parity.

Contributing to Codex upstream. Where Codex lacks something (agents in plugins, `cwd` on spawn, a per-agent sandbox), the answer inside this issue is a workaround or a registered gap, not a pull request. *(supplied - Open question 18)*

Keeping the two fleets in sync automatically, beyond the glossary generator. No generator emitting agent bodies for both, no CI diff against the source bodies. *(supplied, except the glossary exception, which is decided - Open question 19)*

Parallel coders in v1. Coder runs one at a time *(decided 25 Sep - Open question 10)*.

Codex cloud, the Codex app and the IDE extension. The target is the CLI on Alex's machines. *(supplied - Open question 1)*

Public distribution. No marketplace listing, no docs for a stranger. *(supplied)*

Sprites, per the glossary.

## Acceptance criteria

Criteria marked *(contingent)* take their final form from a numbered open question. Every criterion that needs a live Codex run spends quota (see Constraints), so the plan should batch them. The two criteria added in this revision are numbered 19a and 19b so that existing references keep their numbers.

**Before the plan**

0. The spike in board item GPTA-1.1 shows, on codex-cli 0.156.1, that SubagentStart fires for a custom subagent, that SubagentStop with `decision: "block"` sends the subagent back with the reason, and that PreToolUse fires on a file edit and can refuse it. The plan for GPTA-1 is not written until the spike reports. If any of the three fails, the spec is re-scoped before planning *(decided 25 Sep - Open question 21)*. Met: all three passed in round 3 *(verified 0.156.1)*. The findings are on branch `worktree-agent-af83b7d1806f0e868` and not yet on `main`.

**Inventory and traceability**

1. A divergence register at `docs/divergence-register.md` has one row per fleet artefact - every agent, skill, command, workflow, hook binding, the MCP server, each template and the installer - with one of the four dispositions Ported, Re-expressed, Deferred or Dropped and a reason. `skills/board-linear/` has a row saying it is an empty directory in the source and not an artefact. Checked by listing the source tree and confirming every path appears in the register. *(supplied: the file path and the four dispositions are taken from opencode-agents, per the brief)*
2. Any artefact that exists here with no fleet counterpart is marked Invented in the register with its reason.
3. Every file follows the writing conventions in the root `AGENTS.md`: Australian English, standard hyphens only, no emojis, no hard-wrapped prose. Checked with a grep for U+2013, U+2014 and emoji ranges returning nothing.

**Agents**

4. Each ported agent loads in Codex and is spawnable by the lead. Checked by a session that spawns each by name and receives a handoff. The lead's instructions give `task_name` in snake_case, since a hyphenated one is refused *(verified 0.156.1)*. *(contingent on 4 and 5 for how many agents)*
5. Each agent's `description` is the fleet's verbatim, since it is the routing copy the lead chooses by, or the register says why it changed.
6. Each agent's model and reasoning effort are set explicitly in its TOML, never inherited from the parent by accident, and the mapping from the fleet's tiers is recorded in the register. *(contingent on 9)*
7. Every agent whose fleet definition gives it no file-writing tool - scout, reviewer and researcher, per the current `tools:` and `disallowedTools:` lines - has every `apply_patch` call refused by PreToolUse, and scout's and reviewer's shell calls held to the fleet's read-only allowlists by the same hook; researcher, which has no shell in the fleet, has every shell call refused. A test asks each to write a file through `apply_patch` and through a shell redirection and observes both refused. `sandbox_mode` is not relied on, since it is not applied to subagents *(verified 0.156.1)*. *(supplied: the earlier draft listed refuter, but refuter carries Write and Edit in the fleet, and its restriction is its git rule, covered by criterion 14)*

**Handoff contract**

8. Every fleet agent's final message is checked by a SubagentStop hook using the fleet's handoff parser, and a malformed handoff is sent back to the subagent with the parser's reason rather than accepted, with `stop_hook_active` used so a second failure is recorded rather than looped on. Checked against the existing `evals/fixtures/handoff-cases`. *(the mechanism is verified 0.156.1; the loop handling is supplied)*
9. A `Blocker:` line in a conforming handoff moves the focused item to Blocked by human with the blocker text as a comment. Checked end to end on a scratch board.
10. The glossary and handoff contract reach every agent from a SubagentStart hook's `additionalContext`, without the agent choosing to load them. Checked by a cold spawn producing a conforming handoff having never invoked a skill. *(mechanism settled by GPTA-1.1 - Open question 11)*

**Board**

11. SubagentStart moves the focused item to Doing, using the existing `.boards/.focus` binding. Checked on a scratch board.
12. The `board` MCP server loads in a Codex session and its task tools work, from the lead and from a subagent, under the approval policy the install sets. Checked by `task_view` on a known item from each. *(supplied addition: the spike saw an MCP call refused under `approval_policy = "never"`, so "loads" is not enough)*
13. Completion to Done is reachable by some defined mechanism, or the register records it as Deferred and says what the human does instead. *(contingent on 6)*

**Enforcement**

14. Each invariant the fleet's `enforce-agent-scope.sh` holds has a row in an invariant register saying Enforced (with mechanism and a test that attempts the forbidden action and sees it refused) or Unenforced. At minimum: spec-writer cannot write outside `docs/specs/`, including through the file paths named inside an `apply_patch` body; coder cannot force-push or rewrite published history; fleet-steward cannot merge; the read-only agents cannot write (criterion 7). Each Enforced row is tested on every tool kind that can reach it - shell, `apply_patch` and MCP - since a deny has so far been observed only on `apply_patch`. The register states, as the fleet's own hook does, that this layer is a role reminder rather than a containment boundary, and that it does nothing while its hook is untrusted. An invariant that reads as enforced and is not is a failed criterion. *(contingent on 8, now settled for the mechanism)*
15. A PreToolUse guard installed in the user-level `~/.codex/hooks.json` refuses a commit to the default branch in every Codex session on the machine, fleet work or not. Checked by a test that starts a plain Codex session in a scratch repo with no fleet files, asks it to commit on `main`, and observes the refusal. The README names what the guard cannot cover: Codex cloud, the Codex app, other machines without the install, and any session where hooks are disabled *(decided 25 Sep - Open question 3)*. The guard governs calls with no `agent_type`, which the fleet's hook exempts as the main session, since a non-fleet session has none *(supplied, following from the decision)*. Where the guard lives may move if question 22 chooses managed hooks.

**Pipeline**

16. From a brain dump, the spec-to-plan sequence produces `docs/specs/<issue>.md` and stops for the human, then produces `docs/plans/<issue>.md` and stops for approval. Both stops are observable: the session ends or waits, it does not continue past them. *(contingent on 7)*
17. A review round on a diff produces a reviewer verdict with ranked findings. *(contingent on 7)*
18. Coder runs serially, one at a time, on a feature branch in the main checkout, and the PreToolUse guard refuses any commit it attempts on the default branch. Checked two ways: `git log main` is unchanged after a coder run, and a coder asked to commit on `main` is refused. The register records worktree isolation as Deferred and `prune-worktrees` as Dropped *(decided 25 Sep - Open question 10)*.

**Installation**

19. One documented command installs the fleet, including its hooks, and running it twice is safe. After it, a Codex session in an initialised project starts as the lead and can spawn every ported agent. *(contingent on 2 and 22)*

19a. The install does not report success while any fleet hook would be skipped. A check, run as the last step of the install and on demand, confirms that every fleet hook is trusted at its current definition (or is managed, if question 22 goes that way), and fails non-zero naming each one that is not. Checked three ways on a scratch `CODEX_HOME`: freshly installed and untrusted, it fails; after trusting, it passes; after one hook is edited, it fails naming that hook. *(supplied: the requirement follows from the verified silent skip; the check's form is contingent on 22)*

19b. The install never passes `--dangerously-bypass-hook-trust` and never writes `trusted_hash` entries itself. *(supplied - Open question 22)*

20. No credential or token appears in any committed file. *(supplied, following the OpenCode port)*

**Evals**

21. The deterministic handoff-format checks from `evals/lib/` run here without Claude Code and without spending Codex quota. *(supplied)*
22. Each ported agent has an eval that runs under Codex, driven by `codex exec` prompting the lead to spawn the agent by name, as the spike's harness did, or the register records it as Deferred. Model runs are manual, as in the fleet. The first run is a baseline; the fleet's Claude baselines are not a target. *(contingent on 9 and 17)*

**Glossary**

23. This repo's glossary rule is the output of the Codex target of `gen-glossary-rule.sh` in `claudecode-agents`, with Maps to cells naming Codex mechanisms, and is never hand-edited here. Checked by regenerating and diffing to nothing. *(supplied wording; the mechanism is decided 25 Sep - Open question 19)*

## Open questions

Each has a recommended default. Accept with a word, or edit. "Depends on it" says what moves if the answer changes.

Three questions need Alex before the plan, in this order: 22 (how the silent skip is closed, which may move where question 3's hooks live), 7 (what the workflows become) and 9 (which account, which sets the eval budget). The rest go ahead on their defaults unless Alex edits them. *(supplied triage)*

### Shape of the port

**1. Which Codex surface?** Default *(supplied)*: the CLI only, on Alex's machines. The spike proved hooks on the CLI, both `codex exec` and the interactive `/hooks` screen, and nothing about the app or cloud. Depends on it: whether hooks can be relied on at all, and every enforcement and board criterion.

**2. How is it packaged, given plugins cannot carry agents?** Re-derived default *(supplied)*: no Codex plugin in v1. An install script, mirroring `scripts/install-home.sh`, places the agent TOMLs, the skills, the hooks and the `board` MCP configuration, then runs the trust check (criterion 19a). The reason has changed since the first draft: question 3 put the hooks at user level, and plugins cannot carry agents, which leaves a plugin carrying only skills and one MCP server while adding a second trust scope and #16430's doubt. Agent TOMLs go in `~/.codex/agents/`, replacing the project-level default recorded under question 3, since the hooks are machine-wide and a project `.codex/` loads only in a trusted project. Hook commands use a fixed install path, not `PLUGIN_ROOT`, and the path stays stable across upgrades because trust is keyed to it *(verified 0.156.1)*. Depends on it: criterion 19, and question 22.

**3. User-level or project-level install, and should the port guard Codex sessions that are not fleet work?** Decided *(decided 25 Sep)*: hooks go in the user-level `~/.codex/hooks.json` and guard every Codex session on the machine, including work outside the fleet. The port still names what it cannot cover: Codex cloud, the Codex app, other machines, and sessions with hooks disabled. Criterion 15 takes the guard-plus-test form. Where the agent TOMLs live was not part of this answer; the earlier default of project-level `.codex/agents/` stays *(supplied)* and belongs with question 2.

**4. Which agents are in v1?** Default *(supplied)*: all eleven except `fleet-steward`, Deferred. Its sweep is scheduled, unattended and aimed at Claude model releases and Claude frontmatter via `migration-checklist`, which describes the wrong platform. Nothing in the spike bears on this. Depends on it: criterion 4, and the fate of `migration-checklist`.

**5. How does the lead become the main session?** Codex has no documented equivalent of Claude Code's `agent` setting that makes a named agent the primary. Default *(supplied)*: the lead's body goes into the project's `AGENTS.md` via `init`, since that is what a Codex session always reads. The alternative is a `config.toml` profile with its own instructions file, which the human has to remember to select. Unverified: whether a profile can set the main session's developer instructions. What the spike added: hooks tell the main session apart by the absence of `agent_type`, as in the fleet *(verified 0.156.1)*, but a non-fleet session looks the same, so no hook can tell the lead from a plain Codex session. Depends on it: criterion 19, and whether `init` writes `AGENTS.md`.

### Mechanisms with no direct counterpart

**6. What replaces TaskCompleted, the only route to Done?** Codex names no task-completed event and has no `TaskCreate` a hook can see. Re-derived default *(supplied)*: a Stop hook on the main session that moves an item to Done only when the lead's final message carries an explicit `[board:<issue>]` completion marker and the test gate passes. That keeps both fleet rules the earlier default traded against each other - columns are written by hooks, and only a deliberately marked act finishes an issue - with the marker moved from a task subject to a message. It rests on Stop carrying `last_assistant_message` the way SubagentStop does *(verified for SubagentStop; unverified for Stop)*. If Stop does not carry it, the fallback is the earlier default, an explicit `$done` skill, which the register must own as a divergence from "never by an agent"; failing both, Done is Deferred and the human moves it. Depends on it: criterion 13.

**7. What happens to the three workflows?** No deterministic orchestration runtime exists. Default *(supplied)*: `spec-to-plan` and `review-round` become explicit-only skills the lead follows, with the human gates as hard stops in the text; `deep-research` becomes a skill that spawns `researcher`. Counter-argument: `review-round.js` carries a lot of logic, and "turn it into a skill" may be a polite way of dropping its determinism. The alternative is a script driving `codex exec`, which keeps determinism, adds a second runtime, and spends quota per step. What the spike added: SubagentStop can hold a reviewer's verdict to a required shape the same way it holds a handoff *(supplied, from the verified block)*, which returns some of the determinism a skill loses, but nothing Codex offers can stop a lead skipping a gate. Needs Alex: this is a call on how much determinism the fleet is worth. Depends on it: criteria 16 and 17.

**8. How is scope enforced?** *(settled by GPTA-1.1)*: one lock, not two. The spike showed PreToolUse fires on shell, `apply_patch` and MCP calls with `agent_type`, and that its deny stops an `apply_patch` edit; it also showed `sandbox_mode = "read-only"` is not applied to a subagent, so the per-agent OS lock the earlier default relied on does not exist. Enforcement is the fleet's `enforce-agent-scope.sh` bound to Codex's PreToolUse, adapted to Codex's payload rather than rewritten. The adaptation is real work: the fleet's write rules key on `Write`/`Edit` and `tool_input.file_path`, and Codex's edits arrive as `apply_patch` with the paths inside the patch body's `*** Add File:`, `*** Update File:` and `*** Delete File:` lines. This is parity rather than a loss: the fleet's own hook calls itself a role reminder, not a containment boundary, and leaves containment to the session sandbox, which Codex also has. Remaining default *(supplied)*: no second per-agent lock in v1; permission profiles stay unexamined, since they are beta and see shell only. Depends on it: criteria 7 and 14.

**9. How do the fleet's model tiers map, and on which account?** What the spike showed: it ran under a ChatGPT sign-in, the payload reported the model as `gpt-6-astra`, and the plan's usage cap stopped round 3 *(verified 0.156.1)*. Default *(supplied)*: stay on the ChatGPT sign-in and treat its quota as the budget for evals and live acceptance checks; tiers become explicit models plus `model_reasoning_effort` per agent, chosen from what that account exposes, with the larger model for the fleet's top tier and the smallest for `scout`. Names live in the TOMLs only and the register records the mapping, since they churn (the docs record gpt-5.4 retiring on 31 August 2026). The alternative is an API key, which removes the cap and costs money per run. Needs Alex: it is his money and his quota. Depends on it: criteria 6 and 22, and how the plan batches live checks.

**10. What does coder do without worktree isolation?** `spawn_agent` has no `cwd`, and a prompt saying "work in this directory" is not a boundary. Decided *(decided 25 Sep)*: option (a). Coder runs serially, one at a time, on a feature branch in the main checkout, and PreToolUse refuses commits to the default branch. Worktree isolation is Deferred in the register, `prune-worktrees` is Dropped, and there are no parallel coders in v1. Criterion 18 is firmed up to match.

**11. How do glossary and handoff get into every agent?** *(settled by GPTA-1.1)*: from a SubagentStart hook's `hookSpecificOutput.additionalContext`. The spike's hook injected a marker token and every subagent final message, four of four across two independent subagents, carried it back. No inline copy in `developer_instructions`, so there is one source *(supplied)*. The risk moves rather than vanishes: with the hook untrusted, no agent gets the contract and SubagentStop is not there to notice, which criterion 19a and question 22 cover. Unverified: any size limit on `additionalContext`. Depends on it: criterion 10.

**12. What do the five commands become?** Custom prompts are deprecated. Default *(supplied)*: explicit-only skills (`allow_implicit_invocation: false`), invoked as `$init`, `$kickoff`, `$work`, `$board`. `prune-worktrees` is Dropped *(decided 25 Sep - question 10)*. Worth Alex confirming that `$name` rather than `/name` is acceptable day to day, but it does not change the plan. Depends on it: criterion 19 and the register.

**13. What replaces `.claude/rules/` with `paths:`?** Default *(supplied)*: always-on rules (the glossary) go into `AGENTS.md`; path-scoped rules become nested `AGENTS.md` files in the directories they cover, and anything that does not fit a directory is registered as lost scoping. Nothing in the spike bears on this. Depends on it: the `compound` skill, which writes rules there, and `init`.

### The board and the memory server

**14. Does the board binary run unchanged?** It is a bun/TS MCP server and a CLI, which Codex can host. Its environment variables are named `CLAUDECODE_AGENTS_*` and its state lives under `~/.local/state/claudecode-agents/`. Default *(supplied)*: run the same binary, keep the names, and share the state directory, so a repo worked by both fleets has one board and one log. New from the spike: an MCP call was refused under `approval_policy = "never"` *(verified 0.156.1)*, so the install has to set whatever approval the board's tools need, and criterion 12 now checks it from a subagent. Also noted, not proposed: the parent's `spawn_agent` passes through PreToolUse with its arguments, and SubagentStart carries a `transcript_path`; either might let a hook read a `Board-Item:` line, which the fleet never could. Parity says keep `.boards/.focus`, and the register can note the possibility. Depends on it: criteria 11 and 12, and whether a Claude and a Codex session on one repo can collide on `.boards/.focus`.

**15. Does a Codex board write identify itself?** The fleet writes `Board-Writer:` trailers and coder commits carry a co-author trailer. Default *(supplied)*: Codex writes get distinct `Board-Writer:` values and a Codex co-author trailer, so `git log` tells the fleets apart - which is exactly the signal missing in the Fathom reconciliation. Depends on it: hook scripts and coder's body.

**16. Does the memory server come across, and how is the corpus write lock held?** *(settled by GPTA-1.1, except the deny itself)*: Codex names MCP tools `mcp__<server>__<tool>`, and PreToolUse sees them with `agent_type`, so the write lock can be a PreToolUse rule whatever an agent TOML can or cannot scope. Default *(supplied)*: yes, configured in user config with the token from a file or env var outside the repo, and a PreToolUse rule refusing the memory server's write tools to every subagent except `researcher`. Because the rule sees no `agent_type` on the main session, the lead keeps write access, and so does every non-fleet Codex session, since the server is configured machine-wide. Unverified: that a deny on an MCP call takes effect (the spike's MCP call failed on approval first), and the approval setting the memory tools need. Depends on it: criterion 20, and the recall step in the agent bodies.

### Scope and process

**17. What do the evals become?** Re-derived default *(supplied)*: port the deterministic checks first, since they cost no quota. Drive agent runs through `codex exec` prompting the lead to spawn the named agent, which is the pattern the spike's harness used and which worked *(verified 0.156.1)*; whether `codex exec` can target a custom agent directly no longer matters. Model runs stay manual, as in the fleet, and are budgeted against question 9's quota. Depends on it: criterion 22.

**18. Is contributing upstream to Codex out?** Default *(supplied)*: out. If Alex would rather push agents-in-plugins, `cwd` on `spawn_agent` or a per-agent sandbox that is actually applied upstream, questions 2, 8 and 10 change shape.

**19. Does this repo track the source fleet after the port?** The glossary here is generated from the source skill and its Maps to column names Claude Code mechanisms. Decided *(decided 25 Sep)*: a Codex target is added to the glossary generator (`gen-glossary-rule.sh`) in `claudecode-agents`, and this repo's "never edit it here" rule stays. The generator change is work in the source repo and a dependency of this port, not something this repo does; see Dependencies outside this repo and criterion 23. Automatic sync of anything beyond the glossary remains a non-goal.

**20. Is there a ninth skill?** The brief listed `board-linear`; the plugin's `skills/` directory has eight `SKILL.md` files. Decided *(decided 25 Sep)*: `skills/board-linear/` in the source is an empty directory. The fleet has eight skills, and the register records `board-linear` as not an artefact.

**21. What would make this not worth doing?** If Codex's hooks turn out not to fire reliably for subagents (the payload and matcher issues filed against both tools suggest edge cases), the port reduces to agents and skills with no board and no gate, which is advisory discipline - the Fathom outcome with better prompts. Decided *(decided 25 Sep)*: a spike, board item GPTA-1.1, proves SubagentStart, SubagentStop with `decision: "block"`, and PreToolUse on a file edit on codex-cli 0.156.1 before the plan is written. See criterion 0.

### Surfaced by GPTA-1.1

**22. How does the port stop an untrusted hook being a silent no-op?** See Constraints. Options *(supplied)*: (a) the trust check of criterion 19a at install and on demand, and nothing more, so a hook that goes untrusted after an upgrade is caught only when someone runs the check; (b) (a) plus a `codex` shell wrapper that runs the check before every launch and refuses to start when a fleet hook is untrusted or stale, which catches it every time at the cost of wrapping every Codex invocation; (c) install the fleet's hooks as managed hooks in a filesystem `requirements.toml`, which Codex treats as trusted by policy and which cannot be disabled from `/hooks` *(researched; unverified on 0.156.1, and whether a plain filesystem file works outside MDM is unconfirmed)*, removing the trust step and the silent skip at the source, at the cost of needing admin rights to install and to upgrade. (c) conflicts with question 3 as decided, which names `~/.codex/hooks.json` as the location, though it serves question 3's intent - guard every session - better than the decided location does. Recommended *(supplied)*: (c) if a check after the quota reset shows it works on 0.156.1, otherwise (b). Rejected in every case: `--dangerously-bypass-hook-trust`, which trusts every hook in every repo. Needs Alex: it reopens where a decided answer puts the hooks, and (b) and (c) both touch his machine outside Codex. Depends on it: criteria 15, 19, 19a and 19b, and question 2.

## Sources

- `docs/findings/GPTA-1.1-codex-hooks.md` on branch `worktree-agent-af83b7d1806f0e868`, the evidence behind every *(verified 0.156.1)* line
- [Codex hooks](https://developers.openai.com/codex/hooks)
- [Codex subagents](https://developers.openai.com/codex/subagents)
- [Codex configuration reference](https://developers.openai.com/codex/config-reference)
- [Codex advanced configuration](https://developers.openai.com/codex/config-advanced)
- [Codex permissions](https://developers.openai.com/codex/permissions)
- [Codex skills](https://developers.openai.com/codex/skills)
- [Codex custom prompts (deprecated)](https://developers.openai.com/codex/custom-prompts)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Codex CLI enterprise managed configuration: requirements.toml and managed_config.toml](https://codex.danielvaughan.com/2026/04/27/codex-cli-enterprise-managed-configuration-requirements-toml-admin-policies/) (third-party summary, for question 22)
- [openai/codex #47285 - hook review trusts every pending hook in one approval](https://github.com/openai/codex/issues/47285)
- [openai/codex #18988 - allow plugins to bundle custom agents](https://github.com/openai/codex/issues/18988)
- [openai/codex #28491 - declare custom subagents in plugin.json](https://github.com/openai/codex/issues/28491)
- [openai/codex #18969 - cwd for spawn_agent](https://github.com/openai/codex/issues/18969)
- [openai/codex #23095 - spawn_agent in a specified worktree](https://github.com/openai/codex/issues/23095)
- [openai/codex #27133 - project hooks ignored inside a worktree](https://github.com/openai/codex/issues/27133)
- [openai/codex #16430 - plugin-local hooks not executed](https://github.com/openai/codex/issues/16430)
- [openai/codex #16226 - distinguish subagent hook events](https://github.com/openai/codex/issues/16226)
- [openai/codex #15941 - custom prompts missing after 0.117.0](https://github.com/openai/codex/issues/15941)
- Source fleet: `claudecode-agents/agents/*.md` (`tools:` and `disallowedTools:`, for criterion 7) and `claudecode-agents/hooks/enforce-agent-scope.sh`
- Precedent: `opencode/docs/specs/opencode-agents-port.md` and `opencode/docs/divergence-register.md`
