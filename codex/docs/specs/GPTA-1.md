# CF-4: Port the coder-fleet plugin to the Codex CLI

Formerly GPTA-1 on the gptcode-agents board, renumbered CF-4 when the boards were folded into the coder-fleet repo on 26 September 2026. The spike ids GPTA-1.1 and GPTA-1.2 are now CF-4.1 and CF-4.2; the findings file keeps its old name.

Status: draft, third revision. The first pass was written before any interview. The second was a desk pass against the CF-4.1 spike on codex-cli 0.156.1, and the human has since decided questions 3, 7, 9, 10, 19, 21 and 22. This revision re-aligns the spec with the Claude Code plugin as it stands at v0.27.17, so that the port targets the fleet as it is today rather than the one the first draft described. Against that description, the fleet has dropped plans (CF-58), added actions for the human (CF-25), renamed Doing to In Progress (CF-9), bound SessionStart and PostToolUse on `Agent` alongside the four events the draft counted, added the refuter's clock, renamed the `board` skill to the one now called `help-boards`, and keeps the board as files under `.boards/` in each repository. Each line carries one of these markers:

- Unmarked: given in the brief from the lead, stated in the root `AGENTS.md`, or read from `claude/coder-fleet/` or the OpenCode port.
- *(verified 0.156.1)*: observed in the CF-4.1 spike on codex-cli 0.156.1 on 25 September 2026, recorded in `codex/docs/findings/GPTA-1.1-codex-hooks.md`.
- *(researched)*: a fact about Codex taken from its docs or issue tracker on 25 September 2026, cited in Sources and not yet observed on the install. Docs and issues disagree in places, and where they do the line says so.
- *(researched 29 Sep)*: the same, read from the Codex docs on 29 September 2026 for this revision. The docs moved to `learn.chatgpt.com` in between.
- *(parity 0.27.17)*: re-derived in this revision to match the Claude Code plugin at v0.27.17. A default like *(supplied)*, but its reason is "the fleet does it this way" rather than the author's taste. The human has not accepted these yet.
- *(supplied)*: the author's guess or recommendation. These are the lines to edit first.
- *(decided 25 Sep)*: the human's answer, relayed by the lead.
- *(settled by CF-4.1)*: an open question the spike answered with evidence. The line says how.

## Problem

The fleet at `claude/coder-fleet/` imposes a discipline on agent work. The human's order is the approval: the lead builds only what the human filed, asked for or said go on, and briefs a coder from the board card. An unshaped idea goes through a spec first, and the approved spec's acceptance criteria go onto the card, because the card is what a coder builds from. A coder or scripter builds one item or sub-issue at a time. A reviewer reads every diff, and a refuter attacks the risky ones. Every subagent ends with a four-heading handoff. The board is files under `.boards/` in the repository, its columns are written only by hooks, and "blocked by human" is the one column the human watches, with each blocker listed as an action at the top of the card. All of this runs only inside Claude Code.

The human wants the same discipline in the OpenAI Codex CLI. `codex/` holds that port, and the ports section of the root `AGENTS.md` fixes the rules: a port does not invent, every artefact traces to its counterpart under `claude/coder-fleet/`, Codex wins on file layout and frontmatter, and the fleet wins on behaviour and vocabulary. "As close as feasible" is the standard this spec holds itself to: where Codex can express the fleet's mechanism, the port uses it. Where it cannot, the port re-expresses the behaviour and says so in the register, and it drops only what Codex has no way to carry.

There is a concrete reason this matters now. On 24 September 2026 Codex, run outside the fleet on `fathom-rzem-ai`, landed five commits straight on `main` with no board move, no review round and no trailer, and silently contradicted two written requirements. Reconciling it took a lead session and four new sub-issues. The fleet's discipline did not fail there; it was simply absent, because nothing of it runs inside Codex. The port is how it gets there.

The inventory to account for, as of v0.27.17:

- **11 agents:** lead, scout, spec-writer, coder, scripter, reviewer, refuter, ui-designer, tech-writer, researcher, fleet-steward.
- **8 shipped skills:** glossary, handoff, help-boards, compound, migration-checklist, looping, run-article, humanize (with its `references/`). A ninth, `brainstorming`, is preloaded by spec-writer but resolves from the superpowers plugin and is not shipped.
- **5 commands:** init, kickoff, board, work, prune-worktrees.
- **3 workflows:** deep-research, review-round, spec-to-card.
- **7 hook scripts on 6 events in `hooks/hooks.json`,** with `hooks/lib/` (`board.sh`, `check-write-scope.py`):
  - SessionStart: `board-env-check.sh`
  - SubagentStart: `board-subagent-start.sh` and `agent-clock.sh`
  - SubagentStop: `board-subagent-stop.sh`, matched to the eleven agents
  - TaskCompleted: `board-task-completed.sh`
  - PostToolUse on `Agent`: `board-agent-return.sh`
  - PreToolUse: `enforce-agent-scope.sh` on writes and Bash, and `agent-clock.sh` on every tool
- **1 MCP server:** `board`, the forked Backlog.md binary behind the `board/board.sh` shim.
- **5 templates:** `AGENTS.md`, `board.config.yml`, `board.gitignore`, `project-settings.json`, `rules/glossary.md`.
- **User-scope files:** `claude/home/settings.json`, with the session-wide `permissions.deny`, placed by `claude/scripts/install-home.sh`.
- **2 generators:** `gen-glossary-rule.sh`, and `gen-agent-pairs.sh`, which has no pairs to render yet (CF-12).
- **Evals:** per-agent smoke evals, and the deterministic suite under `claude/evals/lib/` that CI runs through `check-all.sh`.

### Codex is a much closer target than OpenCode was

The target is codex-cli 0.156.1, the version installed on the human's machine *(decided 25 Sep)*. CF-4.1 checked the load-bearing claims against it; the rest are still from the docs.

The OpenCode port had to rebuild the fleet's hooks, its enforcement and its subagent model from scratch because OpenCode had none of them. Codex has the hooks the fleet depends on, and they do what the fleet needs once trusted *(verified 0.156.1)*. What the spike disproved is the per-agent sandbox, which the earlier draft had counted as a stronger lock than the fleet's.

| Fleet mechanism | Codex counterpart | Confidence |
|---|---|---|
| Agent markdown with frontmatter | Custom agents as TOML files. `name`, `description` and `developer_instructions` are required; a file may also set model, reasoning effort, sandbox, MCP servers and enabled skills. A TOML custom agent spawns, and its `name` arrives in hooks as `agent_type` | Verified 0.156.1 for loading, spawning and the name; the other keys documented |
| `model:` (an alias: `opus`, `sonnet`) and `effort:` | `model` and `model_reasoning_effort` per agent, resolved spawn value, then `[agents]` default, then parent. Codex names concrete models, not aliases | Documented |
| `agent` in project settings, which makes the lead the main session | Top-level `developer_instructions` in `config.toml`, "additional developer instructions injected into the session". `model_instructions_file` also exists, but it replaces `AGENTS.md`, which the fleet needs kept. See question 5 | Researched 29 Sep; whether project-scoped config may set it is unverified |
| Agent / Task spawning | Built-in subagents (`spawn_agent`), configured under `[agents]` in `config.toml`. `task_name` on a spawn must be snake_case (`spike_worker`); a hyphen is rejected, while the agent's own `name` may keep one | Verified 0.156.1 |
| The fleet's six hook events | Codex documents twelve: SessionStart, SessionEnd, SubagentStart, PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, UserPromptSubmit, SubagentStop, Stop and Interrupt. `features.hooks` is stable and on by default; `features.codex_hooks` is a deprecated alias. Every non-managed hook needs a one-time trust step first, and an untrusted hook is skipped without any message (see Constraints) | Verified 0.156.1 for SubagentStart, SubagentStop and PreToolUse; the list researched 29 Sep |
| SessionStart (`board-env-check.sh`) | SessionStart, whose `additionalContext` "is added as extra developer context" | Researched 29 Sep |
| SubagentStart payload | `session_id`, `turn_id`, `transcript_path`, `cwd`, `model`, `permission_mode`, `agent_id`, `agent_type`. No spawn prompt, the same as Claude Code, so the `.boards/.focus` binding carries across as designed. `hookSpecificOutput.additionalContext` reaches the subagent | Verified 0.156.1 |
| SubagentStop exit 2 rejecting a malformed handoff | SubagentStop carries `last_assistant_message`. `{"decision":"block","reason":...}` sends the subagent back with the reason, and the second call carries `stop_hook_active: true` so a hook can avoid looping | Verified 0.156.1 |
| PreToolUse denial | PreToolUse fires for shell (`tool_name` `Bash`), `apply_patch` (patch body in `tool_input.command`) and MCP calls (`mcp__<server>__<tool>`), each with top-level `agent_type` when called from a subagent and without it when called by the main session. `hookSpecificOutput.permissionDecision: "deny"` stopped an `apply_patch` edit. The parent's own `spawn_agent` also passes through PreToolUse, with the target agent inside `tool_input`. PreToolUse may also return `updatedInput`, which `agent-clock.sh` needs to trim a shell timeout | Verified 0.156.1 for firing on all three and for the deny on `apply_patch`; deny on shell and MCP not yet observed; `updatedInput` researched 29 Sep |
| PostToolUse on `Agent` (`board-agent-return.sh`) | PostToolUse, carrying the tool's model-facing output as `tool_response`. Whether a Codex subagent run can end without SubagentStop, which is the case the fleet's hook exists for, is unknown | Researched 29 Sep |
| TaskCompleted (the only route to Done) | None. Stop fires on the main session and carries `last_assistant_message`. See question 6 | Researched 29 Sep for Stop's payload; unverified on 0.156.1 (CF-4.2 criterion 5) |
| Skills (`SKILL.md`) | Same format, in `~/.codex/skills/` or bundled in a plugin. `agents/openai.yaml` with `allow_implicit_invocation: false` makes a skill explicit-only, invoked as `$name` | Documented |
| `skills:` preloading in agent frontmatter | No preloading. A SubagentStart hook's `additionalContext`, keyed on `agent_type`, carries the same text in (question 11) | Verified 0.156.1 for the mechanism |
| Plugin + marketplace + `${CLAUDE_PLUGIN_ROOT}` | Plugins with `.codex-plugin/plugin.json`, bundling skills, MCP servers and hooks; hook commands get `PLUGIN_ROOT` and `PLUGIN_DATA` | Documented, but an older issue reports plugin hooks not executing (#16430) |
| MCP server (`board`) and per-agent MCP scoping through `tools:` and `disallowedTools:` | MCP supported, stdio and HTTP, with per-server `enabled_tools` and `disabled_tools`, and a per-tool `mcp_servers.<id>.tools.<tool>.approval_mode` of `auto`, `prompt`, `writes` or `approve`. A subagent's call to a stdio stub server reached PreToolUse, then failed with "MCP tool call requires approval, but approval policy is never" under `approval_policy = "never"` | Verified 0.156.1 for the call and the failure; the per-tool approval key, researched 29 Sep, is the candidate fix |
| Frontmatter tool scoping (`tools:`, `disallowedTools:`) | Per-agent `sandbox_mode = "read-only"` is not applied to a spawned subagent: its rollout shows the parent's `workspace-write`. It is not a lock. Beta permission profiles with filesystem deny rules exist and govern shell commands only. Codex reads files through shell, so "no Bash" cannot be carried across literally (question 24) | Verified 0.156.1 for the sandbox (round 1; a stricter re-check is in CF-4.2); profiles documented only |
| `permissions.deny` in `claude/home/settings.json` | No counterpart confirmed. See question 23 | Supplied |

What Codex does not have, as far as the docs and the spike say:

- **No agents in plugins** *(researched)*. `plugin.json` has no `agents` key; custom agents must be placed in an agents directory some other way. Open feature requests #18988 and #28491.
- **No worktree isolation for subagents** *(researched)*. A spawned subagent inherits the parent's cwd, and `spawn_agent` has no `cwd` parameter. Open requests #18969 and #23095. Question 10 settles what coder and scripter do instead.
- **No per-agent sandbox** *(verified 0.156.1)*. See the table. The OS-level lock the earlier draft counted on does not exist for subagents.
- **No custom slash commands** *(researched)*. Custom prompts in `~/.codex/prompts` are deprecated in favour of skills, and reportedly stopped appearing from codex-cli 0.117.0 (#15941).
- **No TaskCompleted event and no task list a hook can observe** *(researched)*. The fleet's `[board:<id>]` marker lives on a `TaskUpdate` subject, and Codex has no counterpart to carry it.
- **No deterministic workflow runtime** equivalent to the fleet's `phase()` and `agent()` JavaScript.
- **No path-scoped rules** *(researched)*. Nothing resembles `.claude/rules/` with a `paths:` header; the nearest is nested `AGENTS.md` per directory.
- **No Agent Teams.** The fleet does not use teammates either: its spawns are type and prompt only, because a named spawn stands down every type-keyed control. Nothing is lost.
- **No claude.ai connectors.** The fleet reaches the memory server as the claude.ai Memory connector; Codex has to be given the server directly (question 16).
- **Project hooks are reported ignored inside a git worktree** (#27133) *(researched)*; user-level hooks reportedly still fire. Neither half is verified: CF-4.2 checks both. Since coder runs in the main checkout (question 10) and hooks install at user level (question 3), this only matters when the human runs Codex from a worktree themselves.
- **Project `.codex/` loads only in a trusted project** *(researched)*, including project-scoped agents and config.
- **Hooks run only once trusted** *(verified 0.156.1)*. See Constraints.

Two things the port must not claim as losses. The fleet's SubagentStop moves no column but Blocked by human, because Claude Code's SubagentStop payload has no status field. The Codex payload has none either *(verified 0.156.1)*, so a failed run is no more visible in one fleet than the other. And SubagentStart never saw the spawn prompt in the fleet either.

## Dependencies on the Claude tree

Port work reads `claude/` and never writes to it. A change the port needs there is its own change to the Claude tree, under that tree's own process, and this port depends on it rather than doing it.

- `claude/scripts/gen-glossary-rule.sh` gains a Codex target, so that the port's glossary is generated with Codex mappings and the "never edit it here" rule holds *(decided 25 Sep)*. `check-all.sh`'s staleness check covers the new output. This is the one planned change.
- When editor pairs land (CF-12), `gen-agent-pairs.sh` gains a Codex target too, so that a pair renders as two TOMLs from the same source *(parity 0.27.17)*. Until then there is nothing to render.
- The editors are a later port decision, outside v1 as this spec stands: the four agents (`spec-editor` and `spec-editor-fable`, CF-12.3; `tech-editor` and `tech-editor-fable`, CF-12.4), the challenge gate, and the editor questions `/init` and `/kickoff` ask, which record a `Spec editor:` and a `Tech editor:` line in `AGENTS.md` and deny the unchosen definitions in `.claude/settings.json` (CF-12.5). The CF-12 spec gives the ports a record only (its Q11). Taking them up means deciding what an Opus and a Fable editor run on under question 9's account, and how a Codex project would refuse a definition it did not choose. Until then a project carrying the two lines from a Claude Code install has no editor here.

## Constraints the spike surfaced

**Hook trust is part of the install, and its failure is silent** *(verified 0.156.1)*. Before a non-managed hook runs, a human has to review and trust it in the interactive `/hooks` screen. Codex records trust in `config.toml` under `CODEX_HOME`, one `[hooks.state."<path to hooks.json>:<event>:0:0"]` table per hook holding a `trusted_hash = "sha256:..."`. A hook that is new, or whose definition has changed since it was trusted, is skipped, and nothing says so: in two spike rounds no log or transcript carried any trust-refusal message. No config key or CLI command grants trust non-interactively. The only way around it is `--dangerously-bypass-hook-trust`, which applies to every hook, including those in any repo the human clones.

For this port that means an untrusted fleet looks exactly like an installed one while enforcing nothing: no scope lock, no default-branch guard, no handoff check, no board moves. That is the Fathom outcome with no warning, and question 3's guard on every session is the first thing it switches off. Every fleet upgrade that changes a hook re-arms the wall. The human has decided how the port meets it: a README warning and nothing more (question 22).

Two things are not yet known. The first is whether the trusted hash covers only the `hooks.json` entry or also the script it runs *(researched: the docs say "the exact hook definition"; unverified)*. That decides whether a script edit silently runs unreviewed code or silently switches the hook off. The second is issue #47285, which reports that one approval in `/hooks` trusts every pending hook at once, across plugins and events *(researched)*, so trusting the fleet's hooks can also trust whatever else is pending.

**Codex usage is capped, and every live check spends it** *(verified 0.156.1)*. The spike ran under a ChatGPT sign-in and hit the plan's usage limit partway through round 3, with a reset on 29 September 2026 at 20:48 AEST. Every model eval, every end-to-end acceptance check below and every spike round draws on the same quota as the human's own work. The deterministic checks cost nothing. The human has decided to stay on the ChatGPT sign-in and keep live checks small and batched (question 9).

## Non-goals

Improving the fleet. A behaviour that is wrong in `claude/coder-fleet/` is ported wrong and fixed there as its own change, as the OpenCode port did with the handoff parser.

Writing to `claude/` from this port. It is read-only reference material. The generator changes above happen under `claude/` as their own work.

Building a status-driven Blocked transition on SubagentStop. The fleet has none, so it is not part of parity.

Contributing to Codex upstream. Where Codex lacks something (agents in plugins, `cwd` on spawn, a per-agent sandbox), the answer inside this issue is a workaround or a registered gap, not a pull request. *(supplied - question 18)*

Keeping the two fleets in sync automatically, beyond the generators named above. No generator emits agent bodies for both, and CI does not diff against the source bodies. *(supplied, except the glossary, which is decided - question 19)*

Parallel coders and scripters in v1. Each runs one at a time *(decided 25 Sep for coder - question 10; parity 0.27.17 for scripter, which shares coder's isolation and scope rule)*.

Codex cloud, the Codex app and the IDE extension. The target is the CLI on the human's machines. *(supplied - question 1)*

Public distribution. No marketplace listing, no docs for a stranger. *(supplied)*

Sprites, per the glossary.

## Acceptance criteria

Criteria marked *(contingent)* take their final form from a numbered open question. Every criterion that needs a live Codex run spends quota (see Constraints), so the build should batch them. Criteria added in a revision take a letter suffix (7a, 9a, 13a) so that existing references keep their numbers.

**Before building**

0. The spike in board item CF-4.1 shows, on codex-cli 0.156.1, three things: SubagentStart fires for a custom subagent, SubagentStop with `decision: "block"` sends the subagent back with the reason, and PreToolUse fires on a file edit and can refuse it. If any of the three fails, the spec is re-scoped before anything is built *(decided 25 Sep - question 21)*. Met: all three passed in round 3 *(verified 0.156.1)*, and the findings are on `main` at `codex/docs/findings/GPTA-1.1-codex-hooks.md`.

**Inventory and traceability**

1. The divergence register at `codex/docs/divergence-register.md` has one row per artefact under `claude/coder-fleet/`, plus `claude/home/settings.json` and `claude/scripts/install-home.sh`. That covers every agent, skill, command, workflow, hook script and hook binding, `hooks/lib/`, the MCP server, each template and the installer. Each row has one of the four dispositions Ported, Re-expressed, Deferred or Dropped, and a reason. `brainstorming` has a row saying it is preloaded by spec-writer but resolves from the superpowers plugin, and what the port does about it. Checked by listing the source tree and confirming every path appears in the register. *(the four dispositions are the OpenCode port's)*
2. Any artefact here with no fleet counterpart is marked Invented in the register, with its reason.
3. Every file follows the writing conventions in the root `AGENTS.md`: Australian English, standard hyphens only, no emojis, no hard-wrapped prose, and "the human" rather than a name. Checked with a grep for U+2013, U+2014 and emoji ranges returning nothing.

**Agents**

4. Each ported agent loads in Codex and the lead can spawn it. Checked by a session that spawns each by name and receives a handoff. The lead's instructions give `task_name` in snake_case, since a hyphenated one is refused *(verified 0.156.1)*. *(contingent on 4 and 5 for how many agents)*

4a. Each agent's `developer_instructions` is the fleet body verbatim. The only changes are mechanism names (a tool, an event, a path, a command's `/` for `$`), each covered by a register row. A behavioural rule is never reworded to suit Codex. That covers the lead's order rule, coder and scripter stopping on a card with no acceptance criteria, `Blocker:` lines reserved for questions only the human can answer, and the refuter's survivors as `survived:` Done bullets. Checked by a deterministic diff of each TOML's body against its source with the registered substitutions applied, which comes back empty. *(parity 0.27.17)*

5. Each agent's `description` is the fleet's verbatim, since it is the routing copy the lead chooses by, or the register says why it changed.
6. Each agent's model and reasoning effort are set explicitly in its TOML, never inherited from the parent by accident. The fleet's tiers map one to one: every `opus` agent gets one Codex model, every `sonnet` agent another. `effort:` carries across as the same word where Codex's scale has it. The mapping is recorded in the register. *(decided 25 Sep for the account - question 9; the one-to-one mapping is parity 0.27.17)*
7. Every tool the fleet withholds from an agent through `tools:` and `disallowedTools:` is refused to that agent by PreToolUse, for every Codex tool kind that reaches it. `sandbox_mode` is not relied on, since it is not applied to subagents *(verified 0.156.1)*. Concretely:
   - scout, reviewer and researcher have every `apply_patch` call refused.
   - fleet-steward, which the fleet gives Edit but not Write, has `apply_patch` refused wherever the patch adds a file.
   - scout's and reviewer's shell calls are held to the fleet's read-only allowlists.
   - spec-writer, tech-writer and researcher, which have no Bash in the fleet, are handled as question 24 decides.

   A test asks each read-only agent to write a file through `apply_patch` and through a shell redirection, and observes both refused. *(parity 0.27.17)*

7a. MCP scoping matches the fleet's by PreToolUse rule on `mcp__<server>__<tool>`, keyed on `agent_type`:
   - **Board:** full access for the lead; read-only for spec-writer; read, create and edit for fleet-steward, but never complete or archive; nothing for any other agent.
   - **Memory:** read tools for every agent; `memory_capture` for researcher and the lead only; `memory_forget`, `memory_kv_set` and `memory_kv_delete` for the lead only.

   Checked by a test that calls a withheld tool from each role and sees it refused. *(parity 0.27.17; contingent on 16)*

**Handoff contract**

8. Every fleet agent's final message is checked by a SubagentStop hook using the fleet's handoff parser. A malformed handoff is sent back to the subagent with the parser's reason rather than accepted, and `stop_hook_active` is used so that a second failure is recorded rather than looped on. Checked against `claude/evals/fixtures/handoff-cases`, with a parity check against the fleet's parser like `handoff-parity.sh`. *(the mechanism is verified 0.156.1; the loop handling is supplied)*
9. A `Blocker:` line in a conforming handoff does three things, as the fleet's `board-subagent-stop.sh` does. It moves the focused item to Blocked by human. After the move, one `task edit <id> --action=<ask>... --by SubagentStop` call adds each blocker's text as a numbered action in the card's Actions for Human section, and that call runs even when the move was refused. Then the Blocker comment is posted. Checked end to end on a scratch board. *(parity 0.27.17, from CF-25)*

9a. SubagentStop puts a comment lifted from the handoff on the card on every outcome: the `## Done` items on a clean stop and the blocker lines on a blocked one. It uses the fleet's headlines and comment-length cap, and archives a cut comment's whole text under the state directory. It writes the stopped marker on every path after the ids are read. It moves no column except Blocked by human. Checked against the fleet's board-hook contract cases, adapted to the Codex payload. *(parity 0.27.17)*

10. Every skill in an agent's fleet `skills:` list reaches that agent, except one the register marks Dropped (at v0.27.17 only spec-writer's `brainstorming`, per question 11). Each reaches it from a SubagentStart hook's `additionalContext`, keyed on `agent_type`, without the agent choosing to load it. For every agent that means glossary and handoff; for the others it is their own list, such as help-boards for spec-writer and looping for coder. The lead gets its own list the same way from SessionStart. Checked by a cold spawn producing a conforming handoff having never invoked a skill. *(mechanism settled by CF-4.1 - question 11; the per-agent lists are parity 0.27.17)*

**Board**

11. SubagentStart binds and moves the item the way the fleet's `board-subagent-start.sh` does:
   - The binding reads the agent's own record on a resume first, then `.boards/.focus`, then the session's last item, then `CODER_FLEET_BOARD_PAGE_ID`.
   - The move is to In Progress, or to Doing on a board whose config lists only Doing.
   - It never moves a Blocked by human card that has an open action for the human, and never moves a card it could not read.

   Checked on a scratch board. *(parity 0.27.17)*
12. The `board` MCP server loads in a Codex session and its task tools work, from the lead and from a subagent, under the approval the install sets. `task_view`, `task_focus` and `task_edit` all work. Checked by `task_view` on a known item from each. *(the need is verified 0.156.1; per-tool `approval_mode` is the candidate fix, researched 29 Sep)*
13. Completion to Done is reachable through a defined mechanism, or the register records it as Deferred and says what the human does instead. Whatever the mechanism, the test gate is the fleet's: `CODER_FLEET_TEST_COMMAND` or the status marker file, a lenient or strict gate, and a timeout. Passing tests move the item to Done. Failing tests move it to Blocked, with the fleet's comment naming the command, its exit code and the tail of its output. *(contingent on 6; the gate is parity 0.27.17)*

13a. A SessionStart hook does what `board-env-check.sh` does: it names each `BOARD_COL_*` override in `~/.config/coder-fleet/board.env` that the board's config does not list, into the session's context, and writes nothing. Checked with a scratch `board.env`. *(parity 0.27.17)*

13b. A run that ends without SubagentStop gets one card comment saying so, as `board-agent-return.sh` does, through PostToolUse on the spawn or wait call. The alternative is a register row recording it as Dropped, with evidence that a Codex subagent cannot end without SubagentStop. *(parity 0.27.17; the Codex behaviour is unverified)*

**Enforcement**

14. Each invariant that the fleet's `enforce-agent-scope.sh` holds has a row in an invariant register. Each row says either Enforced, with the mechanism and a test that attempts the forbidden action and sees it refused, or Unenforced. The rows are, at v0.27.17:
   - scout: shell held to the read allowlist, with no redirection, command substitution or writing `sed` and `find`.
   - reviewer: the same, plus no tests, builds, installs or writing git.
   - spec-writer: writes only under `docs/specs/`.
   - tech-writer: writes only under `docs/` or to a Markdown file at the project root.
   - ui-designer: writes only `prototypes/` and a commissioned article under `docs/runs/`, runs no writing git and installs nothing.
   - refuter: writes only outside the project and runs read-only git. When its checker cannot run it fails closed, where every other role fails open.
   - fleet-steward: never touches anything outside its working copy, never merges, never force-pushes and never pushes to a default branch.
   - coder and scripter, re-expressed per question 10: a writing git command is refused on the default branch, in place of the fleet's "only in a linked worktree".

   Write destinations are read from the `*** Add File:`, `*** Update File:` and `*** Delete File:` lines of an `apply_patch` body and checked by the fleet's `check-write-scope.py`. Each Enforced row is tested on every tool kind that can reach it (shell, `apply_patch` and MCP), since a deny has so far been observed only on `apply_patch`. The register states, as the fleet's own hook does, that this layer is a role reminder rather than a containment boundary, and that it does nothing while its hook is untrusted. An invariant that reads as enforced and is not is a failed criterion. *(parity 0.27.17 for the list; the mechanism is settled by CF-4.1 - question 8)*

14a. The refuter's wall clock is carried across from `agent-clock.sh`. SubagentStart records the start once per agent id. PreToolUse denies every tool call after 25 minutes. Under the cap, PreToolUse trims a shell call's timeout to the time left through `updatedInput`, or the register records the trim as lost if Codex does not apply it. Checked with a backdated clock file. *(parity 0.27.17; `updatedInput` researched 29 Sep)*

15. A PreToolUse guard in the user-level `~/.codex/hooks.json` refuses a commit to the default branch in every Codex session on the machine, fleet work or not. Checked by a test that starts a plain Codex session in a scratch repo with no fleet files, asks it to commit on `main`, and observes the refusal. The README names what the guard cannot cover: Codex cloud, the Codex app, other machines without the install, and any session where hooks are disabled or untrusted *(decided 25 Sep - question 3)*. The guard governs calls with no `agent_type`, which the fleet's hook exempts as the main session, since a non-fleet session has none *(supplied, following from the decision)*.

**Pipeline**

16. `spec-to-card`, as an explicit-only skill, runs in two stages that each stop, as the fleet's workflow does. Given a brain dump or a board item, it recalls, locates, briefs the interview, and drafts `docs/specs/<issue>.md` with everything unheard as an open question, then stops for the human. Given a spec the human has marked approved, it adds each numbered acceptance criterion the card lacks with `task edit <issue> --ac=...`, then stops. It never writes a status, never redrafts an approved spec, and stops with "could not read the board" rather than filing a second card when the board is unreadable. Both stops are observable: the session ends or waits, it does not continue past them. *(decided 25 Sep that workflows become skills - question 7; the stages are parity 0.27.17, from CF-58)*
17. `review-round`, as an explicit-only skill, gates on the card first. It stops on a card with no acceptance criteria, an unreadable board or an invalid issue id. It then produces a reviewer verdict with ranked findings, held to its required shape by SubagentStop. A refuter's survivors are read from its `survived:` Done bullets. *(decided 25 Sep - question 7; the gate and survivor reading are parity 0.27.17)*

17a. `deep-research`, as an explicit-only skill, spawns researcher for the fan-out and returns a cited synthesis. *(decided 25 Sep - question 7)*

18. Coder and scripter run serially, one at a time, on a feature branch in the main checkout, and the PreToolUse guard refuses any commit either attempts on the default branch. Checked two ways: `git log main` is unchanged after a coder run, and a coder asked to commit on `main` is refused. The register records worktree isolation as Deferred and `prune-worktrees` as Dropped *(decided 25 Sep - question 10)*.

**Installation**

19. One documented command installs the fleet, and running it twice is safe. It mirrors `claude/scripts/install-home.sh`:
   - It places the agent TOMLs, the skills, the hooks and the `board` MCP configuration.
   - It builds the board binary into `~/.local/bin/board`, the same binary and path the Claude install uses.
   - It renders secrets from the same local spec into `~/.config/coder-fleet/`.
   - It never touches Codex's own session state.
   - It merges into an existing `~/.codex/config.toml` and `~/.codex/hooks.json` rather than replacing them, on the policy of `claude/scripts/merge-settings.py`:
     - Keys, MCP servers and hooks it does not manage are left as it found them.
     - Its own entries are added after the user's, so existing hooks keep their positions in the trust key.
     - It never removes an entry.
     - A file it cannot parse is an error, not a reason to overwrite.
   - It backs up anything it changes.

   Afterwards, `$init` writes the fleet's own `AGENTS.md` template, `.boards/` config and gitignore, and the lead's instructions, and a Codex session in an initialised project starts as the lead and can spawn every ported agent. *(contingent on 2 and 5; the installer's shape is parity 0.27.17)*

19a. The README says, where the install instructions are, that every fleet hook needs a one-time trust in `/hooks` after install and after every upgrade that changes a hook, and that an untrusted hook is skipped without any message. The installer prints the same instruction as its last line. *(decided 25 Sep - question 22)*

19b. The install never passes `--dangerously-bypass-hook-trust` and never writes `trusted_hash` entries itself. *(decided 25 Sep - question 22)*

20. No credential or token appears in any committed file. *(supplied, following the OpenCode port)*

20a. Each rule in `claude/home/settings.json`'s `permissions.deny` has a register row saying which Codex mechanism holds it, or that nothing does. *(parity 0.27.17; contingent on 23)*

**Evals**

21. The port's deterministic checks run in this repo's CI beside `check-all.sh`, without Claude Code, without Codex and without quota. They cover:
   - the handoff parser's parity with the fleet's
   - the scope rules against the scope-hook contract cases, adapted to `apply_patch` bodies
   - the board hooks against the board-hook contract cases
   - a roster check: every fleet agent is a TOML or a register row, and the SubagentStop and SubagentStart keys name the same set

   *(parity 0.27.17)*
22. Each ported agent has an eval that runs under Codex, driven by `codex exec` prompting the lead to spawn the agent by name as the spike's harness did, or the register records it as Deferred. Model runs are manual, as in the fleet. The first run is a baseline; the fleet's Claude baselines are not a target. *(contingent on 9 and 17)*

**Glossary**

23. The port's glossary is the output of the Codex target of `claude/scripts/gen-glossary-rule.sh`, with Maps to cells naming Codex mechanisms, and is never hand-edited. `check-all.sh` regenerates it and diffs to nothing. *(decided 25 Sep - question 19)*

## Open questions

Each has a recommended default. Accept with a word, or edit. "Depends on it" says what moves if the answer changes.

Every question that changed the shape of the port has been answered. This revision reopens one and adds two, and those are the three to look at first: 5 (where the lead's instructions live, reopened because `AGENTS.md` is now shared with the Claude fleet), 24 (how agents with no Bash in the fleet read files on Codex) and 23 (the session-wide deny list). The rest go ahead on their defaults unless the human edits them. *(supplied triage)*

### Shape of the port

**1. Which Codex surface?** Default *(supplied)*: the CLI only, on the human's machines. The spike proved hooks on the CLI, both `codex exec` and the interactive `/hooks` screen, and nothing about the app or cloud. Depends on it: whether hooks can be relied on at all, and every enforcement and board criterion.

**2. How is it packaged, given plugins cannot carry agents?** Default *(supplied)*: no Codex plugin in v1. An install script mirroring `claude/scripts/install-home.sh` places the agent TOMLs in `~/.codex/agents/`, the skills, the hooks and the `board` MCP configuration. A plugin would carry only skills and one MCP server while adding a second trust scope and #16430's doubt. Hook commands use a fixed install path, not `PLUGIN_ROOT`, and the path stays stable across upgrades because trust is keyed to it *(verified 0.156.1)*. The installer shares `~/.local/bin/board` and `~/.config/coder-fleet/` with the Claude install *(parity 0.27.17)*. Depends on it: criterion 19.

**3. User-level or project-level install, and should the port guard Codex sessions that are not fleet work?** Decided *(decided 25 Sep)*: hooks go in the user-level `~/.codex/hooks.json` and guard every Codex session on the machine, including work outside the fleet. The port still names what it cannot cover: Codex cloud, the Codex app, other machines, and sessions with hooks disabled or untrusted.

**4. Which agents are in v1?** Default *(supplied)*: all eleven except `fleet-steward`, which is Deferred. Its sweep is scheduled, unattended and aimed at Claude model releases and Claude frontmatter via `migration-checklist`, which describes the wrong platform. Depends on it: criterion 4, and the fate of `migration-checklist`.

**5. How does the lead become the main session?** Reopened by this revision. The earlier default put the lead's body into the project's `AGENTS.md` via `$init`. That no longer works. The fleet's `/init` now writes `AGENTS.md` as the project instruction file for Claude Code too, so a lead body there would reach every Claude session in the repo as well, where the lead is already a separate agent. It would also break the fleet's own rule that the lead's policy lives in its definition, not in `AGENTS.md`. Re-derived default *(parity 0.27.17)*: `$init` writes the lead's body as top-level `developer_instructions` in the project's `.codex/config.toml`. That is the closest counterpart to `agent: coder-fleet:lead` in `.claude/settings.json`: per project, set once, and not read by Claude. The lead's preloaded skills arrive through SessionStart `additionalContext`. `AGENTS.md` stays the shared, harness-neutral file the fleet's template makes it. Unverified: whether project-scoped config may set `developer_instructions`. The docs name keys a project cannot override, and this is not among them *(researched 29 Sep)*. If it cannot, the fallback is a `config.toml` profile the human selects. Either way, no hook can tell the lead from a plain Codex session, since both lack `agent_type` *(verified 0.156.1)*. Depends on it: criteria 10 and 19.

### Mechanisms with no direct counterpart

**6. What replaces TaskCompleted, the only route to Done?** Codex names no task-completed event and has no `TaskCreate` a hook can see. Default *(supplied)*: a Stop hook on the main session moves an item to Done only when the lead's final message carries the fleet's `[board:<id>]` completion marker and the test gate passes. That keeps both fleet rules intact: columns are written by hooks, and only a deliberately marked act finishes an issue. The marker simply moves from a task subject to a message. The docs now say Stop carries `last_assistant_message` *(researched 29 Sep)*; CF-4.2 criterion 5 observes it on 0.156.1. If Stop does not carry it, the fallback is an explicit `$done` skill, which the register must own as a divergence from "never by an agent". Failing both, Done is Deferred and the human moves it. Depends on it: criterion 13.

**7. What happens to the three workflows?** Decided *(decided 25 Sep)*: `spec-to-card` (then `spec-to-plan`, since renamed by CF-58) and `review-round` become explicit-only skills the lead follows, with the human gates as hard stops in the text. SubagentStop holds the reviewer's verdict to a required shape. `deep-research` becomes a skill that spawns `researcher`. There is no `codex exec` orchestration script. The skills follow the workflows' current stages and gates, not the 25 September ones *(parity 0.27.17)*.

**8. How is scope enforced?** *(settled by CF-4.1)*: one lock, not two. PreToolUse fires on shell, `apply_patch` and MCP calls with `agent_type`, and its deny stops an `apply_patch` edit. `sandbox_mode = "read-only"` is not applied to a subagent. Enforcement is the fleet's `enforce-agent-scope.sh` and `check-write-scope.py` bound to Codex's PreToolUse, adapted to Codex's payload rather than rewritten. The adaptation is real work, because the fleet keys on `Write`, `Edit` and `tool_input.file_path`, while Codex's edits arrive as `apply_patch` with the paths inside the patch body. This is parity rather than a loss: the fleet's own hook calls itself a role reminder, not a containment boundary, and leaves containment to the session sandbox, which Codex also has. Remaining default *(supplied)*: no second per-agent lock in v1. Depends on it: criteria 7, 7a and 14.

**9. How do the fleet's model tiers map, and on which account?** Decided *(decided 25 Sep)*: the fleet and its evals run on the ChatGPT sign-in, and live checks and evals are batched and kept small to fit the plan quota. Tiers become explicit models plus `model_reasoning_effort` per agent. Names live in the TOMLs only and the register records the mapping, since they churn. The spike saw `gpt-6-astra` in the payload *(verified 0.156.1)*. Default *(parity 0.27.17)*: one Codex model for the fleet's `opus` tier and one for its `sonnet` tier, with no agent on a third. Fable is the fleet's escalation for the lead by hand, not a subagent model, so it maps to the human switching the main session's model, not to a TOML. Editor pairs (CF-12) render as two TOMLs once they exist. Depends on it: criteria 6 and 22.

**10. What do coder and scripter do without worktree isolation?** `spawn_agent` has no `cwd`, and a prompt saying "work in this directory" is not a boundary. Decided *(decided 25 Sep)*: coder runs serially, one at a time, on a feature branch in the main checkout, and PreToolUse refuses commits to the default branch. Worktree isolation is Deferred in the register, `prune-worktrees` is Dropped, and there are no parallel coders in v1. Scripter, which carries `isolation: worktree` and coder's scope rule in the fleet, gets the same answer *(parity 0.27.17)*.

**11. How do the preloaded skills get into every agent?** *(settled by CF-4.1)*: from a SubagentStart hook's `hookSpecificOutput.additionalContext`. The spike's hook injected a marker token, and every subagent's final message carried it back, four of four across two independent subagents. The hook injects each agent's fleet `skills:` list by `agent_type`, with no inline copy in `developer_instructions`, so each skill has one source *(parity 0.27.17)*. The risk moves rather than vanishes: with the hook untrusted, no agent gets the contract, and SubagentStop is not there to notice. Unverified: any size limit on `additionalContext`, which matters more now that humanize and migration-checklist are long. `brainstorming` is not shipped by the fleet and does not exist on Codex. Default *(supplied)*: Dropped in the register, since spec-writer's interview is inline in its body and does not depend on it. Depends on it: criterion 10.

**12. What do the five commands become?** Custom prompts are deprecated. Default *(supplied)*: explicit-only skills (`allow_implicit_invocation: false`), invoked as `$init`, `$kickoff`, `$work` and `$board`, each carrying its command's current steps. For kickoff that includes the preflight, reporting `board.env` check lines, and the offer to rename Doing to In Progress *(parity 0.27.17)*. `prune-worktrees` is Dropped *(decided 25 Sep - question 10)*. Depends on it: criterion 19 and the register.

**13. What replaces `.claude/rules/`?** The fleet ships one rule, the glossary, with no `paths:` key, so it loads on every turn. Re-derived default *(parity 0.27.17)*: the glossary reaches the lead through SessionStart and every subagent through SubagentStart (question 11), and nothing is added to `AGENTS.md`. A Codex-mapped glossary in the shared `AGENTS.md` would contradict the Claude-mapped `.claude/rules/glossary.md` in every Claude session in the same repo. Path-scoped rules that the `compound` skill writes become nested `AGENTS.md` files in the directories they cover, and anything that does not fit a directory is registered as lost scoping *(supplied)*. Depends on it: `compound` and `$init`.

### The board and the memory server

**14. Does the board binary run unchanged?** It is the fleet's fork of Backlog.md, a bun/TS CLI and MCP server that reads and commits files under `.boards/` in the repository, found through `git rev-parse --git-common-dir`. It needs no endpoint and no token. Default *(parity 0.27.17)*: run the same binary, keep the `CODER_FLEET_*` and `BOARD_COL_*` names and `~/.config/coder-fleet/board.env`, and share `~/.local/state/coder-fleet/`. A repo worked by both fleets then has one board, one log and one focus. Session state is keyed by session id, so Claude and Codex sessions do not share records. They do share `.boards/.focus`, which is per checkout in the fleet too. The spike saw an MCP call refused under `approval_policy = "never"` *(verified 0.156.1)*, so the install sets `mcp_servers.board.tools.<tool>.approval_mode` for the tools the fleet's agents use *(researched 29 Sep)*, and criterion 12 checks it from a subagent. Also noted, not proposed: the parent's `spawn_agent` passes through PreToolUse with its arguments, and SubagentStart carries a `transcript_path`. Either might let a hook read a `Board-Item:` line, which the fleet never could. Depends on it: criteria 11, 12 and 13.

**15. Does a Codex board write identify itself?** Every board write commits with a `Board-Writer:` trailer taken from the binary's `--by` flag, and coder commits carry a co-author trailer. Default *(supplied)*: Codex hooks pass distinct `--by` values and coder's commits carry a Codex co-author trailer, so `git log` tells the fleets apart. That is exactly the signal missing in the Fathom reconciliation. Depends on it: the hook scripts and coder's body.

**16. How does the memory server come across, and how are its writes held?** The fleet reaches the memory server as the claude.ai Memory connector, `mcp__claude_ai_Memory__*`, which Codex does not have. Default *(supplied, following the OpenCode port)*: the server is configured directly in user config, with its token rendered by the installer's secret spec into `~/.config/coder-fleet/`, outside the repo. Codex names its tools `mcp__<server>__<tool>`, and PreToolUse sees them with `agent_type`, so the fleet's write split is a PreToolUse rule (criterion 7a). The main session has no `agent_type`, so the lead keeps full access, and so does every non-fleet Codex session, since the server is configured machine-wide. Unverified: that a deny on an MCP call takes effect (CF-4.2 criterion 6), and the approval the memory tools need. Depends on it: criterion 7a, and the recall step in every agent body.

### Scope and process

**17. What do the evals become?** Default *(supplied)*: port the deterministic checks first, since they cost no quota. Drive agent runs through `codex exec`, prompting the lead to spawn the named agent. That is the pattern the spike's harness used, and it worked *(verified 0.156.1)*. Model runs stay manual, as in the fleet, and are budgeted against question 9's quota. Depends on it: criteria 21 and 22.

**18. Is contributing upstream to Codex out?** Default *(supplied)*: out. If the human would rather push for agents in plugins, `cwd` on `spawn_agent` or a per-agent sandbox that is actually applied, questions 2, 8 and 10 change shape.

**19. Does the port track the Claude fleet after it lands?** Decided *(decided 25 Sep)*: a Codex target is added to the glossary generator, and the "never edit the generated copy" rule holds. The generator is now `claude/scripts/gen-glossary-rule.sh` in this repo, so the change is its own change to the Claude tree (see Dependencies on the Claude tree). Automatic sync of anything beyond the generators remains a non-goal.

**20. Is there a ninth skill?** Decided *(decided 25 Sep)*: `skills/board-linear/` was an empty directory and not an artefact. It no longer exists in `claude/coder-fleet/skills/`, so the register needs no row for it. The ninth name an agent refers to is `brainstorming`, covered under question 11.

**21. What would make this not worth doing?** Decided *(decided 25 Sep)*: the port was worth doing only if Codex's hooks fire reliably for subagents, and spike CF-4.1 was to prove that before anything was built. It did (criterion 0).

### Surfaced by CF-4.1

**22. How does the port stop an untrusted hook being a silent no-op?** Decided *(decided 25 Sep)*: with a README warning only. The port documents the one-time `/hooks` trust step, and says that an untrusted hook is silently skipped. There is no `codex` wrapper and there are no `requirements.toml` managed hooks. Hooks stay in `~/.codex/hooks.json` per question 3. `--dangerously-bypass-hook-trust` stays rejected. CF-4.2 criterion 4 (managed hooks) is no longer load-bearing for CF-4. Criteria 19a and 19b follow.

### Surfaced by this revision

**23. What holds the session-wide deny list on Codex?** The fleet's `claude/home/settings.json` denies credential reads (`~/.ssh`, `~/.aws`, `.env`, `~/.config/coder-fleet/` and others), edits to its own settings, `curl`, `wget`, `sudo`, `op`, force-push, `git reset --hard`, `git clean -f` and `git filter-branch` in every session, and the scope hook leaves that half to it. Codex's sandbox holds writes to the workspace, and nothing this spec has checked denies reads. Default *(supplied)*: the user-level PreToolUse hook carries the deny list as rules on shell commands and `apply_patch` paths for every session, as a role reminder like the rest of the scope layer. The register records each deny as Enforced there, or as Unenforced where a shell read can route around a pattern. Beta permission profiles, which govern shell only, stay unexamined in v1. Depends on it: criterion 20a.

**24. How do agents with no Bash in the fleet read files on Codex?** spec-writer, tech-writer and researcher have no Bash in the fleet and read through Claude Code's Read, Grep and Glob. Codex has no such tools and reads through shell, so refusing every shell call would leave them unable to read. Default *(supplied)*: they get scout's read-only shell allowlist through the same PreToolUse rule, and the register records the change as Re-expressed, because the behaviour (read, never run) survives while the mechanism changes. The alternative is to refuse shell outright and accept agents that cannot read the repo. Depends on it: criteria 7 and 14.

## Fleet changes after this spec

Changes to the Claude Code plugin after v0.27.17 that the port will meet. Each is a note, not a revision: the criteria and questions above are unchanged until the next revision takes them in.

- **The card gate on the route to Done (CF-24.4).** `board-task-completed.sh` now moves a `[board:<id>]` item to Done only when its card has at least one acceptance criterion and every criterion and Definition of Done item is ticked; otherwise the item goes to Blocked with a comment listing what is unticked, and the hook exits 2. A card the hook cannot read follows `CODER_FLEET_TEST_GATE`: strict refuses, lenient lets it through and logs. Whatever replaces `TaskCompleted` under question 6 and criterion 13 carries this gate as well as the test gate, reading the card with one `board task view <id> --json`. The OpenCode port defers it with the board.

## Sources

- `codex/docs/findings/GPTA-1.1-codex-hooks.md`, the evidence behind every *(verified 0.156.1)* line
- `claude/coder-fleet/` at v0.27.17: `agents/*.md` (`tools:`, `disallowedTools:`, `skills:`), `hooks/hooks.json`, `hooks/README.md`, `hooks/enforce-agent-scope.sh`, `hooks/lib/check-write-scope.py`, `workflows/spec-to-card.js`, `workflows/review-round.js`, `commands/*.md` and `templates/`, plus `claude/home/settings.json` and `claude/scripts/install-home.sh`, for every *(parity 0.27.17)* line
- `docs/fleet-design.md`, sections 4, 6, 7 and 8
- [Codex hooks](https://learn.chatgpt.com/docs/hooks) (formerly developers.openai.com/codex/hooks), read again on 29 September for the event list, Stop's and PostToolUse's payloads, SessionStart's `additionalContext` and PreToolUse's `updatedInput`
- [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) (formerly developers.openai.com/codex/config-reference), read again on 29 September for `developer_instructions`, `model_instructions_file`, `[agents]` and per-tool MCP `approval_mode`
- [Codex subagents](https://developers.openai.com/codex/subagents)
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
- Precedent: `opencode/docs/specs/opencode-agents-port.md` and `opencode/docs/divergence-register.md`
