# Port the claude-agents fleet to OpenCode

Status: built through Phase 6 and the install, against the fifteen decisions below; Phase 7 has not been recorded as run. This file began on 2026-09-12 as a pre-interview strawman. The lead resolved its open questions in a build plan the same day, the human approved that plan sight unseen with the plan gate lifted, and the plan's decisions now live here under Decisions, numbered as they were, so "plan decision N" anywhere in the history means decision N below. The Phase 0 to 3 measurements, the Phase 3 review and the Phase 0 run article are folded in under What OpenCode actually does, The measured overhead and Operating rules; git history keeps the originals. Lines marked *(supplied)* were the author's recommendation at spec time rather than something the human said.

This file and `docs/divergence-register.md` are the port's core documentation. This one says what the port is, what it decided and what the platform turned out to be; the register says, artefact by artefact and invariant by invariant, what happened to each thing in `claude/coder-fleet/`.

## Problem

The fleet at `claude/coder-fleet/` is a working set of ten role agents, eight skills, two commands, four hooks and three workflows that together impose a particular discipline on agent work: a spec before a plan, a plan approved by a human before code, a fixed four-heading handoff out of every subagent, a Notion board whose columns only hooks may write, and a "blocked by human" queue that is the one thing the human watches. It runs only inside Claude Code. *(Those counts and the plan stage are the fleet as it was on 2026-09-12; the fleet has since grown and dropped plans, and the register tracks each change.)*

The human wants the same fleet available in OpenCode. The naive reading - copy ten markdown files into an `agent/` directory and change the frontmatter keys - produces something that boots and does not work, because two of the mechanisms the fleet's discipline rests on have no counterpart in the target:

The board integration is four shell hooks bound to `SubagentStart`, `SubagentStop` and `TaskCompleted`. OpenCode has no subagent lifecycle events. Without them there is nothing to move a card to Doing, nothing to parse a handoff and reject a malformed one, nothing to post a blocker into the human queue, and nothing to run the test gate before an item closes. The handoff format stops being a machine contract and becomes a request.

The three workflows are JavaScript that calls a `phase()` and `agent()` runtime that only Claude Code provides. OpenCode has no deterministic multi-agent orchestration at all - composition is one `task` tool call spawning one subagent, `subagent_depth` defaults to 1, and children are force-denied the `task` and `todowrite` tools unless their own ruleset re-grants them. The fleet's flagship pipelines have nowhere to land as written.

The third gap is the safety rail. `enforce-agent-scope.sh` is roughly 1200 lines of bash plus a Python helper, bound to `PreToolUse`, that parses bash command lines per agent and denies writes outside an agent's territory - it is what actually stops `spec-writer` writing source and `coder` touching `main`, since the frontmatter cannot express either. OpenCode has no OS-command hook shape at all: no `hooks.json`, no `hooks:` config key, no subprocess hook comparable to `PreToolUse`. The nearest host is a TypeScript plugin on `tool.execute.before`. So this is not a port of a script, it is a rewrite of the fleet's only real enforcement mechanism in a different language against a different interface, and the thing that has to survive is the set of invariants, not the file.

Two smaller mismatches compound it. `effort`, which the lead's entire escalation policy is expressed in, has no equivalent; the nearest thing is `variant`, a free-form provider-specific string, and `disallowedTools`, which every non-lead agent carries as a second lock on a stated invariant, has none either - restriction is per-tool `permission` rules instead, which is a better mechanism but a different one. And `skills:` preloading does not exist - OpenCode loads skills on demand through a `skill` tool, so `glossary` and `handoff` being in every agent's context at startup, which is what makes the handoff contract enforceable rather than optional, has to be achieved some other way. Per-agent skill *restriction* does have a native analogue, so the fleet's `skills:` list splits into two problems with different answers.

So the question this spec had to settle before anything was built is what "a complete port" means when the target lacks the mechanisms that make the original work, and which of the fleet's properties are the ones actually worth carrying across.

## The target runtime

Inference is local. The human has confirmed that constraint applies to inference only - Notion and other hosted services may stay, so the board is not ruled out by this.

**Every frightening assumption in this port has been tested, and each came back better than the argument predicted.** The model was assumed to be poor at sustained format discipline: twenty runs produced zero semantic failures, with every failure in whitespace or a trailing sign-off. Model swapping was assumed to cost enough to rule out per-role models: it costs thirteen seconds. Tool-calling was not assumed either way and is the one that would have been fatal: six of six, the correct tool selected every time with valid JSON in the `tool_calls` field, no plain-text tool calls, no refusals, no malformed arguments. The fleet's core loop is an agent picking a tool and reporting in a fixed format, and both halves are measured rather than feared. The port's caution should be proportionate to what is still unmeasured, not to what was frightening before anyone checked.

*(The tool-calling result also implies the install postdates the Qwen3-Coder chat-template bug that broke tool-calling, patched upstream on 22 July 2026. Worth recording, because an older install would have failed this test for a reason that has nothing to do with the model's ability.)*

Serving is LM Studio on `trillian` at `http://10.0.0.3:1234/v1`, OpenAI-compatible, with one large model resident at a time. `qwen3-coder-next` is the model everything was measured against and the one the port runs on (decision 2), but the port targets the *shape* of this runtime - a local OpenAI-compatible endpoint, one large model resident, a context window in the tens of thousands rather than hundreds - and nothing outside configuration names a model.

Whatever the model, its id must be pinned explicitly in the OpenCode `provider` block. `trillian` is LM-Link federated to `marvin` and `eddie`, and `/v1/models` lists 39 ids across the federation, so a request naming a model that is not the loaded local one may silently execute on another machine. A configuration that relies on a default, an alias or a picked-from-the-list id is a configuration that will sometimes run somewhere else. The pin was verified from trillian's own server log rather than from OpenCode's output: the request body named `qwen3-coder-next`, the locally loaded instance served it, and a grep of the day's log for federation markers (`lm link`, `lmlink`, `federat`, `remote host`, `forwarding`) returned nothing. OpenCode printing a model name proves only what OpenCode intended. *(Two stale facts in the homelab documentation set were found in one session, which is itself worth treating as a caution about relying on it. It stated LM Studio on trillian was not serving, when it was. And an older project memory recorded the memory server's unit as `memory.service` at `/srv/sprites/mcp/memory`, when the live-verified reference is `agent-memory-mcp.service` at `/srv/agent-memory/current`. Take the newer one, and verify rather than cite when that set is the only source.)*

**The escalation policy becomes four levers, and the tier language goes.** The fleet's `opus` / `sonnet` / Fable tiering is deleted from the lead's body rather than translated, because there is nothing to translate it into and a body that still reads as though it can escalate by model is lying to whoever reads it next. What replaces it, in order of reach: another review round; a bigger or tighter brief; the lead doing the work itself rather than delegating; and, as the escape hatch for genuinely hard work, a deliberate manual model swap.

The swap is affordable but deliberate. Measured on trillian: unload 3.0s, cold load at 64768 9.2s, first request 0.4s, total outage 13.4s. *(Caveat: trillian had 114GB in page cache, so the model file was almost certainly warm; a genuinely cold first swap after a reboot is slower and unmeasured.)* Thirteen seconds makes a swap an ordinary operation rather than a catastrophe, which is why it can be a lever at all. But it is explicitly a deliberate act, not something the fleet does automatically on an agent's say-so, because the binding constraint is swap *frequency* rather than swap *cost*, and an automatic swap is exactly how frequency gets out of hand.

**The fleet is tiered across two models, and the mechanism is declare and batch.** Agents declare the model they need in frontmatter. The lead orders work so that same-model jobs run together. A per-session swap ceiling is recorded - two, one to the vision model and one back - so thrashing surfaces as a number rather than as a slow afternoon nobody attributes to anything. No agent swaps the resident model on its own initiative, which matters more under a tiered design rather than less: the dangerous failure is a design task routed to `ui-designer` silently evicting the model another agent is mid-run against.

Tiers are role requirements rather than model ids. There is a coding and tool-calling tier, which is most of the fleet. There is a vision tier, which is `ui-designer`. There may one day be a cheap tier for high-frequency shallow work, `scout` being the candidate (decision 4 defers it).

**This is the port's one genuine invention, and the divergence register says exactly that.** Everything else in this repo traces back to a counterpart in the fleet. Declare-and-batch does not, because the fleet never had to schedule a shared resource: there, `model: opus` on a body routes the work and nothing waits on anything. Here an agent's model is a claim on a single resident slot, and honouring it costs an outage everyone else sits through. The register records it as invented rather than ported, so a later reader does not go looking for the original.

**Co-residency is capped at roughly 3GB alongside the main model.** Measured: a 6.55GB 9B failed to load beside `qwen3-coder-next` with an llama-server SIGABRT; a 2.84GB 4B loaded fine, leaving 3.5GB spare (29058 of 32607 MiB). Tiering by swap makes this cap matter only to a permanently resident cheap model, which v1 does not have.

**The context window is a setting, and 64768 is a pool rather than a per-session window.** 64768 is the loaded value, against a model ceiling of 262144, so the budget is a choice that can be revisited at a cost. LM Studio on trillian runs four slots - `id 0` to `id 3` in its log - drawing on one shared KV cache: one request reached `n_tokens = 43000` at `progress = 0.99` before the cache ran out and every in-flight task on the box got the same 500. A 43000-token prompt getting that far is not what a hard 64768/4 split predicts, so the slots share a pool rather than dividing it, and the exact per-slot arithmetic is not established. What is established is the shape: concurrency and context trade against each other on this box, so four concurrent agents cannot each have 64768 tokens, and any budget figure taken on an idle box is wrong on a busy one in the direction that matters. The window makes the fleet's scout-first discipline structurally mandatory rather than good hygiene, and it prices preloading, since anything put into every agent's system prompt is a fixed tax on every step. The measured tax is under The measured overhead.

**Four concurrent requests.** LM Studio on trillian is configured PARALLEL 4. Fanning more than four agents out at once buys nothing; the fifth queues. In practice the ceiling for spawns is three, because the lead's own session holds a slot (Operating rules).

## The handoff contract: an external dependency

Handoff conformance on a local model is being solved in separate work, not here. This section records what is known, states what the port depends on, and stops. It deliberately proposes no mechanism - no normaliser, no retry loop, no structured output - because that design belongs to the other session and two designs would be worse than one.

An earlier draft of this spec called this the biggest risk in the port, reasoning that the contract loses both its supports at once - Opus's reliability, and the `SubagentStop` hook that exits 2 on a malformed handoff. The second half stands: there is no `SubagentStop` equivalent in OpenCode, so nothing validates a handoff unless something is built to. The first half has been measured and is wrong in an important way.

Twenty runs of `qwen3-coder-next` across five realistic agent tasks - scout, coder, reviewer, researcher, refuter - with the full contract in the system prompt at temperature 0.3, ten runs per condition:

- Strict parsing, contract exactly as written: 4/10 conforming.
- Trailing whitespace normalised before parsing: 6/10 on a fresh sample.

Those numbers look alarming and are not, because of what the failures were. Across all twenty runs there was **not one semantic failure**. No omitted section. No mis-typed `Blocker:` line. No typed line under the wrong heading. No invented fourth prefix. No missing `- None`. Every failure was cosmetic and of exactly two kinds: two trailing spaces after a heading, `## Done  ` instead of `## Done`, breaking the `^## Done$` anchor, which is a markdown hard-break habit; and a stray sign-off line after the final item, literally `Handoff.` or `handoff`, violating "nothing follows the last item of Decisions needed".

The model therefore has excellent content discipline and sloppy whitespace discipline, and the failures are all in the cheap-to-fix class. Part of what was measured was the parser's strictness rather than the model's reliability, and that half was fixed upstream within hours: fleet v0.11.1, commit `e132516`, right-trims every line before any anchor sees it, and the upstream validator already rejected the stray sign-off line before that fix, since it lands under the last open section and fails the item-prefix check.

One later datum from Phase 3, for whoever owns conformance: a preloaded `scout` produced all four headings in order but left the two empty sections blank instead of carrying `- None`. That is exactly the ambiguity the skill warns about - a blank section is indistinguishable from an agent that stopped early - and nothing on this port validates it.

What the port depends on is simply that this is handled - that by the time a ported agent's handoff reaches whatever consumes it, conformance has been dealt with by the mechanism that work lands. If that work changes the contract's wording or the parser's strictness, the port follows it rather than diverging. Until it lands, the ported lead is the only reader, and its body says to reject a result missing any of the four headings and re-run it rather than guess.

One consequence stands regardless of which mechanism lands: a handoff does not degrade gracefully. A missing heading or a dropped typed line is indistinguishable from an agent with nothing to report, so a format failure becomes a lost blocker silently, and nobody finds out. That is what makes the acceptable conformance rate a real question rather than a tuning detail, and it stays open (Still open).

## What the port is for

*(supplied)* The success condition is that the human can open OpenCode on a project, describe an idea, and get the same sequence of events they get in Claude Code: an interview, a spec on disk, a coder that builds against the spec's criteria, a reviewer that reads the diff, and handoffs they can trust the shape of. Whether that is delivered by the same file inventory is not the point; whether the discipline survives is.

The stated principle in `AGENTS.md` already constrains the answer: a port does not invent, and every artefact traces back to its counterpart in the fleet with a register row wherever it deliberately diverges. So the port is allowed to drop things and allowed to re-express things, but not allowed to drop them silently. One thing is admitted as invented rather than ported - declare-and-batch scheduling - handled the way the principle asks: recorded, reasoned, and not pretended to be a port.

What this looks like on local inference is worth saying plainly. The fleet stops being a set of agents that differ by how much you are willing to spend on them, and becomes a set of agents that differ by what they are allowed to touch, what they carry in context, and which of two models they need. The discipline the port preserves - a spec before code, a human gate, a fixed handoff, work scoped to one agent's territory - never depended on model tiering. It depended on the roles being distinct and the contracts between them being machine-checkable, and both survive the move.

## Non-goals

Improving the fleet. A behaviour that is wrong in the fleet is ported wrong, and fixed upstream in a separate change. This was tested rather than assumed: the port found a genuine defect in the handoff parser, the decision was to normalise around it here and raise the fix separately, and the fix shipped upstream the same day as v0.11.1. Seven findings against the fleet were filed the same way on 2026-09-12 (worktree isolation not observed, MCP names unverified, twelve unshipped skill names, the trailing-whitespace parser, endpoint contention, empty results read as success, a CI gate that did not exist); every one has since been closed in `claude/coder-fleet/`.

Solving handoff conformance on a local model. Separate work owns that, and the port consumes whatever it lands.

Writing to `claude/coder-fleet/`. It is read-only reference material for port work; a fix the port needs upstream is its own change.

Contributing anything upstream to OpenCode. If the port needs an event that does not exist, the answer is a workaround or a documented gap, not a pull request to OpenCode. *(supplied, and still the human's to reverse; see Still open.)*

Choosing the models beyond v1. The port is built against role requirements, and the trials in Remaining work decide whether the ids change.

Keeping the two fleets in sync automatically. There is no shared source of truth, no generator that emits both, no CI check that the ported bodies match the originals. Divergence after the port is handled by hand, one register row per fleet change. *(supplied)*

Optimising the runtime. Quantisation policy, MoE against dense throughput, and whether a small model sits co-resident are all cheaper to settle by trial after the fleet runs than by argument before it does.

Sprites. The glossary puts them out of scope and nothing here changes that.

Running the ported fleet anywhere but on the human's own machines. No packaging for public distribution, no npm publish, no docs written for a stranger.

## Decisions

Taken by the lead on 2026-09-12 to resolve the spec's open questions, approved by the human with the build plan. Every one was the lead's call and any can be reversed on sight. The status under each is as of this file.

1. **Parity is behavioural, not inventory.** Judged agent by agent against the fleet's stated invariants, with every difference in the divergence register. Insisting every fleet file has a same-named counterpart produces stub workflows and dead hooks that look like parity and are not. Holds.
2. **The model is `qwen3-coder-next`, pinned, for every agent but `ui-designer`**, which declares `qwen3.8-27b` because it is a vlm with 262k context and `qwen3-coder-next` has no vision. Holds. The Devstral Small 2 and Seed-OSS-36B trials are Remaining work.
3. **Swap mechanics for v1:** agents declare their model in frontmatter, the lead batches work by model, nothing swaps automatically, the human performs every swap on the lead's request, and the port never reads LM Studio's state. Holds; the lead's step 6 carries it.
4. **No resident small model and no light tier for v1.** Holds. `scripter`, whose whole difference from `coder` is a cheaper model, is deferred until a light tier exists.
5. **Both `handoff` and `glossary` are preloaded into every agent via `experimental.chat.system.transform`.** The hook receives `{ sessionID?, model }` and no agent, so per-agent preloading is not expressible and everything goes to everyone. Holds. The measured cost is 2365 tokens per step, and compressing it is not where the savings are (The measured overhead).
6. **Scope enforcement is declarative `permission` rules wherever they reach, plus a small TypeScript plugin on `tool.execute.before` for the residue.** The residue is what OpenCode's shell AST never parses into: interpreter payloads (`bash -c`, `sh -c`, `zsh -c`, `eval`), wrappers (`env`, `xargs`), redirections out of an allowed read verb, and the fleet's documented quote-recovery shapes. Holds; it is `.opencode/lib/scope.ts`, and the register's invariant table says what it does and does not catch.
7. **Handoff conformance is external work owned by another session.** The port builds no normaliser, no validator and no retry loop. Holds; the threshold is still open.
8. **The shipped skills are vendored as copies under the port's own directory**, because OpenCode's discovery would otherwise put them in one namespace with the human's personal skills and resolve a duplicate name by race. `using-memory` is not vendored; its corpus-write labelling folds into the lead's invariants. The eleven referenced-but-unshipped names are struck from every body, one register row each. Holds. `help-boards` (formerly `board`) is deferred with the board, so seven skills are vendored.
9. **The flat fleet is accepted:** `subagent_depth: 1`, children denied `task`, the lead spawns and nobody else does. Holds.
10. **Credentials in two layers.** The memory server's `mcp` entry lives in `~/.config/opencode/opencode.json`, never in the repository. Within it the token is a `{file:...}` reference, never `{env:}` and never a literal, because an unset environment variable resolves to an empty string silently while a missing file fails config load. Holds; `opencode/scripts/install-home.sh` renders both.
11. **The memory server registers as `rzem-memory`**, giving `rzem-memory_memory_search` and siblings. A distinctive key rather than `memory`, because OpenCode has no collision detection on tool names. Holds; the nine identifiers were enumerated from a live request body.
12. **The corpus write lock is permission rules on full prefixed identifiers:** deny `rzem-memory_memory_capture`, `rzem-memory_memory_forget` and the kv write tools on the agents that must not write, allow them on `researcher` and `lead`. Rule order is load-bearing, because the last matching rule wins. Holds, and it matters more than it did in the fleet: every ported agent shares one memory credential, so this lock is the only thing separating agents that may write from agents that may not.
13. **Deferred entirely, with register rows rather than silence:** the board and its hooks, the three workflows, the evals harness, `coder` worktree isolation, and upstream contributions to OpenCode. Holds. A workflow's human gates survive as stops spelled out in `kickoff` for the lead to drive by hand.
14. **`init` and `kickoff` are ported**, holding the line on OpenCode's extra command capability except the per-command model override, which serves declare-and-batch. Holds; that one use is a register row.
15. **The plugin is the unit of truth**, installed into a project or the global config by a script. Holds. The payload lives at `opencode/coder-fleet/` and `opencode/scripts/install-project.sh` copies it into a project's `.opencode/`; the plan's earlier idea of authoring it as a working install at this repo's root was dropped when the port moved into this repository.

## Build history

The plan ran in nine phases. Rows are what each phase delivered; the register's sections are named after the phases that added them.

| Phase | What it was | Outcome |
|---|---|---|
| 0 | Spike: prove the system-prompt transform, agent lookup in `tool.execute.before`, deny-by-throw, and skill-name collisions | All four answered by observation; see What OpenCode actually does. The spike code was deleted |
| 1 | Runtime: provider block, model pin, memory registration, credential path | Done. Pin, identifiers, a live `memory_search` and the loud missing-token failure all observed |
| 2 | Vendor the skills | Done; register, Skills |
| 3 | Walking skeleton: `scout` end to end, overhead measured | Done. `reviewer` found three high defects in the ruleset, two fixed in place and one moved to Phase 4 |
| 4 | The enforcement residue and the invariant register | Done; `.opencode/lib/scope.ts`, `test/invariants/`. A `refuter` run found bypasses still open (register, What the enforcement can and cannot see) |
| 5 | The remaining agents | Eight ported, `scripter` and `fleet-steward` deferred, the four editors deferred later |
| 6 | `init` and `kickoff` | Done; register, Commands |
| 7 | The pipeline end to end on the chosen model, gates observed as real stops, and `ui-designer` reading back an image of its own output on a cold swap | Not recorded as run |
| 8 | Close the register and install | `install-project.sh` and the register landed. A clean-checkout run and a whole-tree credential review are not recorded |

## Acceptance criteria

Written at spec time. Criteria marked *(contingent)* depended on an open question; the Decisions above settle each one, and a deferred criterion is a register row rather than a failure.

**Runtime**

The fleet runs against a local OpenAI-compatible endpoint with the model id pinned explicitly, and every agent resolves to the intended model with no path by which a request reaches a federated peer. Demonstrated by a run plus the served model id in the response. The port carries no hard-coded model id outside its configuration, so changing model is a config edit rather than a sweep through the agent bodies.

Each agent's fixed context overhead - system prompt, preloaded text, tool definitions - is measured and recorded before the context window is set, and the window is then chosen against those measurements with a stated working margin. The criterion is that the number is derived rather than inherited.

Every ported agent completes a representative task within the chosen window.

Whatever model the fleet settles on has the two measurements the core loop depends on taken against it before the port commits: tool selection with valid JSON arguments in the `tool_calls` field, and handoff format discipline. The `qwen3-coder-next` figures - 6/6 tool-calling, zero semantic handoff failures in twenty runs - are the reference point, and they do not transfer to another model by assumption. A model that fails the tool-calling check is disqualified whatever else it scores.

The divergence register carries a model dimension: for every agent, the tier it declares and why.

Declare-and-batch is recorded in the register as invented rather than ported, with the reason.

`ui-designer` runs on a vision model rather than shipping blind. Demonstrated by a `ui-designer` run that reads back an image of its own output, since having a vision model and being able to see your own work are not the same claim.

A session records its model swap count, and exceeding the ceiling is visible rather than silent.

No agent swaps the resident model on its own initiative.

The lead's body contains no `opus`, `sonnet` or Fable tier language, and its escalation section names the four levers that exist.

The fleet's own pipeline runs end to end on the chosen model: a spec produced, a phase coded, a diff reviewed. Not well, necessarily - the criterion is that the sequence completes without a stage failing for a reason attributable to the model rather than the work.

**Inventory and traceability**

Every fleet agent has a counterpart in this repo, or a written entry in the divergence register saying it was dropped or deferred and why. The register is a single file, and a reader can go from any fleet artefact to either its port or its reason for absence without reading a diff.

The same holds for each shipped skill, command, hook and workflow.

**Agent behaviour parity**

Each ported agent's frontmatter is valid against OpenCode's agent schema - it loads without error and `opencode agent` lists it with the description the fleet gave it.

Every fleet invariant that was enforced by `tools`, `disallowedTools` or the `enforce-agent-scope.sh` hook is either enforced by an OpenCode `permission` ruleset, enforced by a plugin hook on `tool.execute.before`, or listed in the divergence register as unenforced. An invariant that `permission` rules can express declaratively is expressed that way rather than reimplemented in a hook.

The invariants are enumerated in the divergence register, one row each, with its enforcement mechanism and its test, each demonstrated by a test that attempts the forbidden action and observes it denied. An invariant the port cannot enforce is registered as unenforced rather than quietly dropped, since an unenforced invariant that still reads as enforced is worse than an absent one.

Each ported agent's skill access is scoped with `permission.skill` to the set its fleet counterpart preloaded.

Every MCP tool name in a ported body is checked against the identifiers OpenCode actually produces at runtime, not against an assumed pattern. Demonstrated by an agent that calls a memory tool successfully.

The corpus write lock is expressed as `permission` rules on the full prefixed tool identifiers, and demonstrated by a read-only agent attempting a corpus write and observing it denied.

No credential, and no reference to one, appears in any committed file. Demonstrated twice: a working session resolving the token from the rendered location, and a configuration with no token present failing loudly at startup rather than authenticating as nobody.

`coder` runs against an isolated working copy, or the divergence register records that it does not and says what the consequence is. *(Decision 13: it does not, and the register says so.)*

**The handoff contract**

Whatever is needed to produce a conforming handoff is in context for every ported agent at the point it produces its final message, without the agent having chosen to load it. Demonstrated by an agent run from a cold session that emits a correctly shaped handoff having never called the `skill` tool.

Handoff conformance is handled by the separate work named above, and no part of the port carries its own competing correction logic. The fleet's `handoff-cases` fixtures are the test corpus.

Conformance is measured on the model actually chosen, and the recorded rate meets whatever threshold that work and the human settle on. The figures to beat are 40% strict and 60% whitespace-normalised.

Semantic conformance is reported separately from cosmetic conformance wherever the port reports a rate at all. A suite reporting a single pass rate would have scored this model at 40% and hidden that its content discipline was perfect.

No stage of the pipeline treats an absent `Blocker:` line as evidence that nothing is blocked, unless the handoff it came from was verified as conforming.

**The pipeline**

The port's equivalent of the spec workflow on a brain dump produces `docs/specs/<issue>.md` and stops for the human. The human gate is an observable stop, not a statement in prose that the agent then continues past, and it is demonstrated on the chosen model rather than reasoned about. If an agent walks through it, the fallback is making the gate structural - the command ends and continuing needs a second invocation.

The port's equivalent of `review-round` on a diff produces a reviewer verdict with ranked findings. *(Decision 13 defers the workflow; the lead drives the round by hand.)*

`init` and `kickoff` exist as OpenCode commands and do what their fleet counterparts do to a fresh project, using OpenCode's extra command capability only where the fleet command already wanted it, each use a register row.

**The board**

*(Decision 13: out of the port, and the register says so and names what the human now does by hand.)*

**Installation**

One documented command installs the fleet into a project or a home directory, and running it twice is safe.

After installation, a session started in a ported project uses the ported lead as its primary agent and can spawn every ported subagent.

**Evals**

*(Decision 13 defers the eval harness.)* When it comes, the first run against the chosen model is a baselining run and the suite is a regression gate from the second run on, because the fleet's recorded Opus baselines do not carry across a model change. The handoff format checks are the one part that ports as-is, since they test a contract that survives the platform change.

**Conventions**

Every file follows `AGENTS.md`: Australian English, standard hyphens, no emojis, no hard-wrapped prose. Any deliberate divergence from the fleet carries a register row.

## What OpenCode actually does

Facts about the target, established by reading the OpenCode source at 1.18.30 (commit `193de13a88d62a6409c6d385831180f1def527dc`, the same version as the binary that ran) and, wherever a verdict rests on it, by observation. Each one closed an option or opened one. Where a fact also produced a register row, the row is the record of what the port did about it.

### Plugins and the system prompt

A plugin is an exported async function returning an object of hook names, picked up from `.opencode/plugin/*.ts` with no registration step. Every export of an auto-discovered plugin module must be a function, or the whole module fails to load (register, Three properties of OpenCode).

`experimental.chat.system.transform` reaches the model. Observed: two sentinels appended to `output.system` were repeated back verbatim by `qwen3-coder-next`. It is marked experimental and undocumented, which is a risk to carry rather than a reason to discount it. Three details decide how the port uses it:

- **Append, never replace, and append at least two elements.** `prepare` builds `system` as one joined string before the hook fires, so `lenBefore` is 1. Two appends make it 3 and trigger the rewrite at `packages/opencode/src/session/llm/request.ts:77`, which joins the appended elements rather than discarding them - observed surviving it. A single append leaves the length at 2 and never reaches that branch, so it is the untested case.
- **It fires per step, not per session.** Three invocations for one prompt: the title generator once, then the agent loop once per step. The preloaded text is re-sent on every request of a multi-tool turn.
- **It fires on the title request too, with nothing to tell it apart.** `inputKeys` is exactly `["sessionID", "model"]`, no agent and no flag. The only discriminator is `output.system[0]` beginning `You are a title generator.`, which `.opencode/plugin/fleet.ts` matches. That is a string match against an upstream prompt and will break silently when the prompt is reworded.

### The tool hook, and denying from it

`tool.execute.before` can recover the running agent. `client.session.get({ path: { id: input.sessionID } })` returns `.agent` populated for a primary session and for a session spawned through `task`, which gets its own session id and the subagent's name. `output.args` is fully populated at that point, so interpreter-payload inspection is possible. The `task` call is itself visible on the parent with `subagent_type` in its arguments, one call before the child session exists.

**Never cache the agent by `sessionID`.** A session's agent is mutable: `setAgentModel` (`prompt.ts:679`) re-patches it whenever it changes. Demonstrated in one long-lived `opencode serve` driven twice over `--attach`, the second time with a different agent: the cached lookup reported `build` while `GET /session/{id}` said `spike-alt`. That is one agent's rules applied to another agent's command, silently, with enforcement reporting success. There is no performance case for the cache: 50 sequential lookups measured p50 0.65ms, p95 1.00ms, max 1.20ms, and 1.6ms to 3.5ms in-plugin.

Throwing from the hook denies the call, and the thrown `Error.message` reaches the model byte for byte, with no wrapper, prefix or truncation - captured by a mock endpoint echoing back the tool-result message it was sent. So the denial text is the agent's to read, and the fleet's exit-2-with-a-reason messages carry over as written. A denial inside a subagent propagates to the parent inside `<task_result>`, but the task reports `state="completed"`: at the parent's level a denied subagent is distinguishable from a successful one only by reading the text.

### Permissions

Skills, tools and MCP tools are all gated by the same `Permission.evaluate` over names and globs. `Wildcard.match` supports `*` and `?`, anchors the whole string, and is case-sensitive everywhere but Windows.

There are two evaluation points. `Permission.disabled` hides a tool outright, and only when the last matching rule has `pattern === "*"` and `action === "deny"`; `visibleTools` then strips it from the payload, so a fully denied tool costs no context. Conditional per-argument rules are evaluated separately at call time, keyed on the same tool-name string.

Matching uses `findLast`, so the last matching rule wins, and YAML key order survives into the ruleset. The safe shape is broadest first, narrowest last (register, Where rule order is load-bearing).

**The block you write is always the last block.** A custom agent is built as `merge(defaults, user)` with its own block appended last (`agent.ts:262-293`), so every rule in a body can reopen something upstream closed on purpose - `read: allow` reopened OpenCode's own `*.env` guard on `scout`. Correctness is a property of the merged ruleset, not of the file, so the check is to pull it from a live server (`opencode debug agent`, or `GET /agent`) and evaluate it, which `test/invariants/rulesets.test.ts` does for every body.

A shell allowlist enforces the wrong property. It asks whether a binary is on the list when the invariant is whether the command changes state. The pattern a bash rule matches is the raw text of the command node, redirections included, and `Wildcard.match` compiles `cat *` to a pattern that matches `cat a > b`; the redirect target never becomes an `external_directory` ask either. `find -exec`, `find -delete`, `sed -n 'w file'`, `sed -i` and `git diff --output=` write through verbs that look read-only. Hence the central redirection gate in decision 6, and `find` dropped from every allowlist in favour of `glob`.

Smaller facts the review found, recorded so nobody re-derives them. `permission/index.ts:206` aliases `list_mcp_resources`, `list_mcp_resource_templates` and `read_mcp_resource` onto `read`, so `read: allow` would un-hide them; absent from this build's payload, so latent. OpenCode's built-in `build` agent is constructed without merging the project's config (`agent.ts:144-152`), so a deny in a project `opencode.json` does not reach `build` - a project-level deny is not global. An `ask` in a non-interactive run auto-rejects, so for a subagent it is a deny with a worse failure mode, and a `scout` pointed at a directory behind `external_directory: ask` quietly answers from what it can reach instead of saying it was blocked.

### Skills

Skills are permission-gated per agent by name: `available()` filters the list through `Permission.evaluate("skill", skill.name, agent.permission)`. So the fleet's `skills:` list splits cleanly - restriction has a native analogue, and only preloading needs the transform.

Skill frontmatter is only `name` and `description`. `disable-model-invocation: true` has no counterpart, so `handoff` is denied through `permission.skill` instead, which is safe only because it is preloaded by other means. Validation is loose: a skill whose `name` is not a string is silently skipped.

Discovery is wide, and a duplicate name resolves by race. Four roots were live on the author's machine, not the two the plan named: `~/.claude/skills`, `~/.agents/skills`, `~/.config/opencode/skills` and `~/.opencode/skills`, plus project-local `.claude/skills` and `.agents/` searched upward, the native `{skill,skills}/**/SKILL.md` across every configured directory, and extra paths and URLs from `opencode.json`. `loadSkills` runs at `concurrency: "unbounded"` and `add` logs a warning then overwrites, so on a duplicate the winner is whichever wrote last: the same two files on the same machine resolved to different winners across consecutive runs. Nothing collided with the vendored names when checked, confirmed with a positive control (a planted second `handoff` produced the duplicate warning, so silence on the others was evidence). The fleet's own skills installed as a Claude Code plugin under `~/.claude/plugins/...` are not discovered, because the `~/.claude` glob is `skills/**/SKILL.md`. The escape hatches cover different roots: `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` suppresses `~/.claude` only, `OPENCODE_DISABLE_EXTERNAL_SKILLS` suppresses `~/.claude` and `~/.agents`, and neither touches the two OpenCode-native roots. The port is exposed the moment the human installs a personal skill under any root with a vendored name, and the only signal is a log line.

### Agents, commands and instructions

`opencode run --agent <name>` refuses a `mode: subagent` agent and silently runs the default agent instead, so every observation of a ported subagent goes through a primary session calling `task`. Schema failures in agent frontmatter are all-or-nothing and silent, and unknown keys are posted to the model as request parameters (register, Agents).

`subagent_depth` defaults to 1 and `deriveSubagentSessionPermission` force-denies `task` and `todowrite` to children, so the platform default is a strictly flat fleet (decision 9).

Commands are richer than the fleet's: subdirectory namespacing, `$ARGUMENTS` and quote-aware `$1` positionals, inline backtick shell substituted before the prompt is sent, and a per-command `model` that beats the agent's. OpenCode ships a built-in `init`, which the ported `init` overrides silently (register, One thing Phase 6 did not settle).

There is no OS-command hook shape anywhere: no `hooks.json`, no `hooks:` config key, no subprocess hook. The generic `event` hook is a firehose over the internal bus rather than a named per-lifecycle enum. The fleet's hooks were built against field schemas reverse-engineered from the Claude Code binary, which is an argument for re-deriving the board integration from what OpenCode actually emits rather than porting the hook logic shape for shape, whenever the board comes across.

`experimental_workspace.register` exists, with a shipped example adapter, behind an environment flag that is off by default. It is the only route to `coder` worktree isolation, which decision 13 defers.

### Provider and model

`@ai-sdk/openai-compatible` is bundled: `provider.ts:123` registers it in `BUNDLED_PROVIDERS` and `:1831` consults that table before the npm path, so a provider block naming it resolves from the binary, offline. The first run against a newly named provider still takes tens of seconds and looks like a hang; later runs start in about two seconds.

`max_tokens` falls back to 32000 when the model declares no output limit: `maxOutputTokens` at `transform.ts:1468` is `Math.min(model.limit.output, 32000) || 32000`, and an absent limit makes the `Math.min` 0, which is falsy. On a 64768 window that reserves half the context for output. The port's provider block declares `limit.output: 16384`, which the request body then carries.

`reasoning_effort` is accepted by the endpoint and inert on this model: `"high"` returned an empty `reasoning_content` and `reasoning_tokens: 0`. So there is no reasoning tier to map `effort` onto, and effort is dropped rather than translated. LM Studio's capability metadata reports only `tool_use` across all 39 models, so it cannot distinguish "no reasoning" from "not described".

A reasoning model in a tool-calling slot must have reasoning explicitly disabled. `nvidia/nemotron-3-nano-4b` returned HTTP 200 with empty content, having spent its whole 120-token budget reasoning; that is a documented bug with a documented fix (reasoning is on by default via `LLM_ENABLE_THINKING`, and `LLM_REASONING_BUDGET=0` alone does not disable it), so it is a configuration requirement rather than a model-selection constraint.

### MCP, the memory server and credentials

The memory server comes across unchanged. rzem-memory is a standard HTTP MCP server that gates itself: `agent-memory-mcp.service` on slarti binds 127.0.0.1:3002 and is public at `memory-mcp.rzem.ai` through the Cloudflare tunnel and nginx. Probed without credentials, `/health` returns 200, `/mcp` 401, and `/.well-known/oauth-protected-resource` 200, naming authorization server `https://id.rzem.ai/realms/rzem`. Auth is static bearer tokens first, then Keycloak JWT, and the namespace comes from the credential - there is no `agent_id` parameter on any tool.

Tool identifiers are `sanitize(clientName) + "_" + sanitize(name)` (`mcp/catalog.ts:119`), with everything outside `[a-zA-Z0-9_-]` replaced by an underscore. So the fleet's `mcp__claude_ai_Memory__` prefix does not exist here, and `rzem-memory` yields `rzem-memory_memory_search` and its eight siblings. Neither `opencode mcp list` nor `/experimental/tool/ids` shows MCP tool names, so the nine were enumerated from the tool definitions a live session put in front of the model, recovered from trillian's log of the request body. That is the only check that catches the silent no-op class: a wrong name grants nothing and warns about nothing.

There is no collision detection on tool names. Tools are registered by plain object assignment, so if two server-and-tool pairs sanitise to the same string the later client silently overwrites the earlier: a server `memory` with tool `kv_get` and a server `memory_kv` with tool `get` both produce `memory_kv_get`. Hence the distinctive key in decision 11.

`oauth: false` on the memory entry is load-bearing. `connectRemote` (`mcp/index.ts:250-265`) attaches an OAuth provider to any remote server unless `oauth === false`, and this server advertises a protected-resource document, so leaving the default creates a second authentication path beside the bearer header, and the config no longer states which one authenticates.

Config variable substitution runs on the config text before the JSONC parse, so it applies inside `headers`. `{env:VAR}` resolves an unset variable to an empty string silently, which sends `Authorization: Bearer ` and surfaces as a server-side 401 that sends whoever debugs it to the wrong end. `{file:path}` throws `bad file reference` on a missing or unreadable file, expands `~/`, resolves a relative path against the config directory, skips commented lines, and trims and JSON-escapes the content. Observed: with the token file moved aside, `opencode run` and `opencode mcp list` both failed at config load with exit 1, before any session existed. One hazard it does not cover is a token file that exists and is empty, which resolves without throwing; `install-home.sh` writes through a temporary file and refuses to install a zero-byte result. The silent-empty `{env:}` behaviour applies to every use of the form anywhere in the config, not just credentials.

OpenCode merges `config.json`, `opencode.json` and `opencode.jsonc` from the global config directory (the XDG config directory, overridable by `OPENCODE_CONFIG_DIR`) into whatever the project supplies, which is what lets the credential-bearing entry live outside the repository entirely. `OPENCODE_CONFIG_DIR` does not isolate the global config from a test, though: the Phase 4 suite died on the author's real token reference until `XDG_CONFIG_HOME` was pointed at a scratch directory (`docs/runs/2026-09-12-refuter-phase-4-enforcement-residue.md`).

The live memory token is rendered from `/etc/agent-memory/auth_token.secret` on slarti, named by `/etc/agent-memory/mcp.toml`. `AGENT_MEMORY_TOKEN_CLAUDE_CODE` in `/etc/agent-memory/agent-memory.env` is stale, still present, and produces a 401, so anyone reading that file reaches the wrong conclusion; `install-home.sh` says so at the point of use. OpenCode has one header block per server entry, so the port cannot express the fleet's per-agent credentials: every ported agent shares one identity carrying `memory:read`, `memory:write` and `memory:admin`, and the corpus write lock is the only separation left (decision 12).

## The measured overhead

Measured on `scout` in Phase 3 as `usage.prompt_tokens` reported by the serving model and read back from OpenCode's accounting - the real tokeniser on the real payload. A `scout` spawned through `task` sends **9214 tokens** before it has done anything, and sends them again on every step of its turn.

| Line item | Tokens | Share |
|---|---|---|
| Tool definitions - the four built-ins `bash`, `glob`, `grep`, `read` | 2490 | 27% |
| Tool definitions - the five `rzem-memory_memory_*` read tools | 1944 | 21% |
| `handoff`, preloaded by the plugin | 1267 | 14% |
| `glossary`, preloaded by the plugin | 1103 | 12% |
| `scout`'s own body | 807 | 9% |
| OpenCode's environment preamble, the project instruction files, and the probe's user message | 1608 | 17% |

Decomposed by seven serialised runs of one probe prompt, each varying exactly one thing (plugin removed, one skill only, `permission` set to `"*": deny`, body replaced, memory allows removed), with each variant's `tools` array length read from trillian's log rather than taken on trust. The parts sum to 9219 against a measured 9214; the gap is the join at `request.ts:77`.

What it means for the budget: with `limit.output: 16384` the nominal prompt budget is 64768 − 16384 ≈ 48384 tokens, and `scout`'s fixed overhead is 19% of it before any work. Overhead is per step: in one five-step run the first request was 9265 tokens and the fifth 15449. And the window is a pool, so two concurrent `scout`s spend 18428 tokens of it on preamble alone.

What it means for decision 5: compressing the preloads is not where the money is. They are 2365 tokens of contract text the port exists to deliver, and cutting a quarter would save about 300 tokens at the cost of the precision that makes the contract enforceable by reading. Tool definitions are 4434 tokens, 48%, and nobody in the fleet wrote a word of them. The five memory read tools alone are 21% of `scout`'s overhead for tools it uses only on questions about past decisions; removing them is one line of frontmatter that trades recall away, and it should be weighed per agent rather than fleet-wide. Every deny already in place is also a context saving: the parent `build` session carries nineteen tool definitions to `scout`'s nine, and a session on the author's machine carried roughly 14k tokens before any work until the project denied three unrelated MCP servers (`linear*`, `pencil*`, `openpets*`), which the template now ships.

## Operating rules

What the build learned about running this stack, carried into the ported lead, `kickoff` and the tests where it can be, and stated here once.

**Contention presents as something else.** Several agents against trillian's four slots produced `Context size has been exceeded` on a three-token prompt, which cannot exceed any window: the message describes a shared KV cache with nothing left, not the request. The tell in trillian's log is the pair of lines before the 500, `failed to find free space in the KV cache` and `failed to find a memory slot for batch of size 1`. The one-line check is `ssh trillian 'tail -1 ~/.lmstudio/server-logs/$(date +%Y-%m)/$(date +%Y-%m-%d).1.log'`: busy slots mean contention, an idle box means the prompt. Anyone who trusts the client's error will trim prompts and lower `limit.context`, and neither helps.

**Contention presents as silent success.** OpenCode retried six times over about five minutes and then exited 0 with an empty assistant message and nothing on stdout; only `--print-logs --log-level DEBUG` showed the 500. The same shape arrived from nemotron's exhausted reasoning budget and would arrive from a tool name that resolves to nothing, so it is a property of the stack rather than of one model. Detection has to be structural, cheapest first:

- An `opencode run` that exits 0 with no assistant text has failed. This one condition catches the whole class.
- Run with `--print-logs --log-level DEBUG` whenever the result will be consumed by something other than a human.
- Require the handoff's four headings before accepting a subagent result. A conforming handoff cannot be produced by a model that was never reached, so the format check doubles as a liveness check - an argument against ever loosening the contract.

The ported lead carries the first and third as invariants, and `kickoff`'s preflight treats an empty answer from the pinned model as failure.

**Serialise against the real model.** Four slots do not mean four agents; they mean four slots on one pool, where the fourth can take the other three down. The lead runs at most three spawns at once, because its own session holds a slot, and fewer when one is a long suite. The same applies to building the port: verification is a runtime activity, so phases that need a real model run one at a time. Serialising means checking that the previous run actually exited, not that the command that launched it returned - one backgrounded run held a slot for four and a half minutes after its agent definition had been deleted.

**Test OpenCode's behaviour against a mock endpoint.** A sixty-line Bun server answering `/v1/models` and an SSE `/v1/chat/completions` - a canned `tool_calls` response first, the tool result echoed back second - turned minute-long stalls into two-second deterministic runs, and captured exactly what text reaches the model on a denial rather than trusting a model to quote it. Scope enforcement asserts on OpenCode, not on a model, so it never needs trillian; `test/invariants/live.test.ts` runs this way. Point `XDG_CONFIG_HOME` at a scratch directory, or the user's global config and its token reference load into the test.

**Prove the detector before trusting a negative.** "No warning appeared" is worth nothing until one has been made to appear on purpose; the skill-collision answer is trusted only because a planted duplicate produced the warning. When a run hangs, check `ps` before instrumenting your own code. And a `--continue` run replays history that already contains tool messages, so a test that looks for "any tool message" passes from history without the tool ever being called; check the last message instead.

## Remaining work

The model research found that `qwen3-coder-next` is not the best fit for this hardware - it is the one that was already loaded. Two candidates fit 32GB VRAM with no RAM offload, which would be faster and leave room for a co-resident second model, and neither has been tested. `Devstral Small 2` (Mistral, 24B dense, Apache 2.0, 256K context) is the best-evidenced purpose-built agentic coder for this hardware; its 72.2% SWE-bench Verified figure belongs to the 123B sibling, and its Q4-Q5 size of roughly 14-17GB is extrapolated. `Seed-OSS-36B` (ByteDance, 36B dense, Apache 2.0, 131K context) is the only large model in the survey that fits 32GB VRAM alone at Q4, with no independent tool-use benchmark found. DeepSeek is ruled out by documented tool calls emitted as plain text, rejection of `tool_choice: required` and non-JSON output breaking OpenCode by name; Llama 4 by weak agentic scores and tool use degrading mid-execution. GLM-4.6, DeepSeek-V3.2, Kimi-K2 and MiniMax-M2 fit no box in this stack; GLM-4.5-Air fits with RAM offload.

The vision candidates for `ui-designer`, all at 262144 max context, were `qwen3.8-27b` (20.7GB, the one decision 2 chose), `qwen/qwen3.5-35b-a3b` (22.0GB), `qwen3-vl-32b-instruct` (21.0GB) and `google/gemma-4-31b` (19.9GB). All fit VRAM more comfortably than `qwen3-coder-next`.

Two common beliefs are not established. No published benchmark compares tool-calling across quantisation levels for any model, so the port writes no quant policy. And `qwen3-coder-next` tolerating RAM spill is MoE sparsity, which llama.cpp's `--n-cpu-moe` confirms as a mechanism but no head-to-head throughput benchmark of MoE against dense on this class of hardware exists - which matters because both candidates are dense.

What to do, each answerable by trial and none blocking:

- Trial `Devstral Small 2` and `Seed-OSS-36B` on trillian against the tool-calling and handoff measurements, not against published benchmarks.
- Run a small in-house eval across two or three quantisation levels with the same two instruments.
- Resolve the light tier by trial - FunctionGemma, and `nemotron-3-nano-4b` with reasoning properly disabled - once the coding and vision tiers are proven.
- Run Phase 7: the pipeline end to end with the gate observed as a real stop, and `ui-designer` reading back an image of its own output on a genuinely cold swap, with the outage timed and two tiers deliberately interleaved so the swap count is legible.
- Close Phase 8: a clean checkout installed twice into a scratch project, a session there spawning every ported subagent, and a whole-tree review of the credential surface, since a committed token is the failure a later commit cannot undo.

## Still open

**What conformance rate is acceptable?** If one handoff in twenty drops a `Blocker:` line, a blocker never reaches the human and nobody finds out. The mechanism is owned elsewhere (decision 7) and the port follows its wording if it changes, but "conformance is handled" is not checkable without a number, and the number has to come from that work or from the human.

**Does any agent besides `ui-designer` warrant its own model?** `refuter` and `reviewer` are the plausible candidates, since adversarial reading is the work most sensitive to model quality. Recommendation *(supplied)*: no third tier until an agent demonstrably underperforms, because every tier is another group the lead batches around and another swap in someone's day.

**Is contributing upstream to OpenCode in or out?** A non-goal on the author's judgement. If the human would rather land subagent lifecycle events in OpenCode than work around their absence, that inverts the shape of the board and handoff work and needs saying before the board comes across.

**How does the board come back?** Deferred (decision 13), but the choice is still live when it does: reimplement on OpenCode's `event` hook and `session.*` events, accepting transitions that differ; reconcile by an explicitly run command so the board is eventually right rather than continuously right; or leave it out. The question to answer first is which property matters - the automation, or the "blocked by human" queue being the one place the human looks. If it is the queue, reconciling may be enough and is far cheaper.
