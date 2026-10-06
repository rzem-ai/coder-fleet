# Plan: port the claude-agents fleet to OpenCode

Issue: `opencode-agents-port`. Spec: `docs/specs/opencode-agents-port.md`.

Status: approved by Alex on 2026-09-12, sight unseen, with the plan gate explicitly lifted for this build. The fifteen decisions below were taken by the lead to resolve the spec's open questions. Every one of them is the lead's call rather than Alex's and any can be reversed on sight.

## The bar

The human can open OpenCode on a project, invoke a fleet agent running against `qwen3-coder-next` on trillian, get a conforming handoff back, watch scope enforcement deny something it should deny, and see memory recall work. Nothing beyond that is in scope.

## Decisions taken by the lead

1. Parity is behavioural, not inventory. Judged agent by agent against the fleet's stated invariants, with differences in a divergence register.
2. Model is `qwen3-coder-next` at `http://10.0.0.3:1234/v1`, pinned explicitly, for every agent except `ui-designer`, which declares `qwen3.8-27b` because it is a vlm with 262k context and `qwen3-coder-next` has no vision. Devstral Small 2 and Seed-OSS-36B trials are later work.
3. Swap mechanics for v1: agents declare their model in frontmatter, the lead batches work by model, nothing swaps automatically, and the port does not read LM Studio's state.
4. No resident small model and no light tier for v1.
5. Both `handoff` and `glossary` are preloaded into every agent via `experimental.chat.system.transform`. The justification is not the conformance sample but the file format: the hook receives `{ sessionID?, model }` and no agent, so per-agent preloading is not directly expressible. Preloading everything into everyone is the only policy the mechanism supports.
6. Scope enforcement is declarative `permission` rules wherever they reach, plus a small TypeScript plugin on `tool.execute.before` for the residue. The residue is narrower than first briefed: the shell AST walk at `packages/opencode/src/tool/shell.ts:391-410` plus arity normalisation covers bare commands declaratively, so the plugin's job is interpreter payloads the AST never parses into - `bash -c`, `sh -c`, `zsh -c`, `env`, `xargs`, `eval` - plus the fleet's documented quote-recovery shapes.
7. Handoff conformance is external work owned by another session. The port builds no normaliser, no validator and no retry loop.
8. The eight shipped skills are vendored as copies under the port's own directory. `using-memory` is not vendored; its corpus-write convention folds into the `lead` body's invariants. The other eleven referenced-but-unshipped names are dropped with a register row each and struck from every body's skill list.
9. The flat fleet is accepted: `subagent_depth: 1`, children denied `task`, the lead spawns and nobody else does.
10. Credentials in two layers. The memory server's `mcp` entry lives in `~/.config/opencode/opencode.json`, never in the repo. Within it the token is a `{file:...}` reference, never `{env:}` and never a literal, because an unset environment variable resolves to an empty string silently.
11. The memory server registers as `rzem-memory`, giving `rzem-memory_memory_search` and siblings per `toolName = sanitize(clientName) + "_" + sanitize(name)`. A distinctive key rather than `memory`, because there is no collision detection.
12. The corpus write lock is permission rules on full prefixed identifiers: deny `rzem-memory_memory_capture`, `rzem-memory_memory_forget` and `rzem-memory_memory_kv_*` on the eight agents that must not write, allow on `researcher` and `lead`. `disabled()` uses `findLast`, so the last matching rule wins and rule order is load-bearing.
13. Deferred entirely, with register rows rather than silence: the board and its four hooks, the three workflows, the evals harness, `coder` worktree isolation, and upstream contributions to OpenCode.
14. Commands `init` and `kickoff` are ported, holding the line on OpenCode's extra capability except the per-command model override where it serves declare-and-batch.
15. The plugin is the unit of truth, authored as a working install in this repo so the repo dogfoods itself, with an install script that materialises it elsewhere.

## Layout

```
opencode.json                      provider block, model pin, permission defaults - no credentials
.opencode/agent/<name>.md          ten agent bodies
.opencode/command/<name>.md        init, kickoff
.opencode/skill/<name>/SKILL.md    eight vendored skills
.opencode/plugin/fleet.ts          preload transform plus scope residue
docs/divergence-register.md        one row per fleet artefact
docs/measurements/                 context overhead, swap counts, conformance
scripts/install-project.sh         materialise into a target project
scripts/install-home.sh            render the memory token
```

## Phase 0 - prove the three unexercised mechanisms

A throwaway spike, deleted at the end, plus findings at `docs/measurements/phase-0-spike.md`.

Four questions, each answered by the cheapest experiment. Does `experimental.chat.system.transform` actually reach the model - push a sentinel no model would emit unprompted and ask an agent to repeat it, appending rather than replacing so it survives the rewrite at `packages/opencode/src/session/llm/request.ts:77`. Can `tool.execute.before` recover the agent name via a session lookup on `sessionID`, for both a primary session and one spawned through `task`, and is a cache keyed on `sessionID` safe. Does throwing from the hook deny the call, and what text reaches the model, because an invariant the agent cannot read is one it cannot comply with next turn. And does anything at `~/.claude/skills` or `~/.agents/skills` collide with the eight vendored names.

Verified by the findings note answering all four with observed output pasted in rather than reasoning.

Fails if question 1 comes back negative, which takes most of the handoff contract's enforceability with it. Fallback in order: contract text into every body, duplication registered; or `permission.skill` plus a load-first instruction, contract registered as advisory. Question 2 negative is survivable - the rule table becomes session-wide and the per-agent rows move to the register as unenforced.

Runs concurrently with Phases 1 and 2.

## Phase 1 - runtime foundation

The provider block, the model pin, the memory registration and the credential path.

Touches `opencode.json`, `~/.config/opencode/opencode.json`, `scripts/install-home.sh`, `docs/measurements/runtime.md`. Resolve here whether `@ai-sdk/openai-compatible` is bundled or must be installed, since the spec flags it unverified and it blocks everything.

Verified by four observations. A completion returns with the served model id matching the pin, proving no request reached a federated peer. The nine memory tool identifiers are enumerated from a live session and match `rzem-memory_memory_*` exactly. A session with the token file present performs a `memory_search`. A session with the token file absent fails loudly with `bad file reference` rather than authenticating as nobody.

Runs concurrently with Phases 0 and 2.

## Phase 2 - vendor the eight skills

Copies under `.opencode/skill/`, plus the `using-memory` fold and the register stub.

Two content changes are forced and both are registered. OpenCode's skill frontmatter accepts only `name` and `description`, so `handoff`'s `disable-model-invocation: true` is dropped and replaced by denying `handoff` through `permission.skill`, which works only because it is preloaded by other means. And `handoff`'s body twice describes a `SubagentStop` hook that does not exist here; that paragraph is rewritten, because a skill telling the model it will be sent back to rewrite a malformed handoff, when nothing will, is training it on a lie.

The eleven dropped names are struck from every body. `reviewer` in particular names `review-checklist` as step 2 of its procedure and that instruction has no referent here.

Verified by all eight listing with the fleet's descriptions, no duplicate-skill warning, and a register row per dropped name.

Fails if Phase 0 question 4 found a collision. Collisions resolve nondeterministically rather than later-wins, because discovery runs at `concurrency: "unbounded"`, which is not acceptable for `handoff`. The escape hatch is `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`, at the cost of the human's personal skills in fleet sessions.

Runs concurrently with Phases 0 and 1.

## Phase 3 - the walking skeleton, `scout` end to end

One agent, complete. `scout` because it is read-only so a mistake is cheap, it exercises memory recall, its invariants are the most declaratively expressible, and every other agent's workflow depends on it.

The body is the fleet's re-expressed: model pinned, `mode: subagent`, description carried verbatim because it is routing copy the lead reads, `permission` replacing `tools` and `disallowedTools` together, `effort: low` deleted rather than translated.

The plugin at this phase does one thing: append the vendored `handoff` and `glossary` bodies to `output.system`, read from disk at init rather than per call, tolerating `sessionID` being undefined since `agent.ts:381` triggers the hook from `Agent.generate` without one.

Measure the fixed context overhead here with system prompt, both skills and tool definitions as separate line items, so if the total demands compression it is obvious which part to compress.

Verified by five observed things: a cold session spawns `scout`, it answers a real "where is X" question, and emits a four-heading handoff having never called the `skill` tool; a `memory_search` returns; an attempted `Write` is denied; an attempted `rzem-memory_memory_capture` is denied; the overhead number is written down with its components.

Send `reviewer` on the permission ruleset specifically. `findLast` makes rule order silently load-bearing, and `coder` will test the deny it wrote rather than the allow it forgot.

The gate. Depends on 0, 1 and 2. Nothing parallel.

## Phase 4 - the enforcement residue and the invariant register

The hook that catches what `permission` cannot express, and the register with a test per row.

One function, a per-agent rule table, and the session-to-agent lookup Phase 0 proved. Explicitly not a faithful rewrite of 1200 lines. The fleet's script header comments record that two characters once retired four separate checks at once; read them rather than re-deriving.

The register carries one row per invariant with its mechanism and its test: `fleet-steward` cannot merge or push to a default branch; `reviewer`, `refuter`, `scout` and `researcher` cannot edit; `spec-writer` cannot write outside `docs/specs/`; `coder` cannot force-push or rewrite published history; `coder` cannot read a credential file; and the corpus write lock. An invariant that cannot be enforced is registered as unenforced rather than dropped quietly, because a body claiming a lock that is not there is worse than an absent one.

Verified by the suite running against a live session, including `bash -c "git push --force"` being denied for `coder`.

Send `reviewer`, and then `refuter`. A rewrite in a new language against a different interface is the case most likely to be subtly wrong while passing its author's own tests, and "the tests would not notice if this were wrong" is exactly what `refuter` exists for.

Depends on 3. Nothing parallel - it is one file.

## Phase 5 - the remaining nine agents

`lead`, `coder`, `reviewer`, `refuter`, `researcher`, `spec-writer`, `tech-writer`, `ui-designer`, `fleet-steward`.

The mechanical transformations are the same for all nine: model pinned except `ui-designer`; `effort` deleted; `tools` plus `disallowedTools` collapsed into one `permission` ruleset with denies written last; `isolation: worktree` dropped from `coder` with a register row saying parallel coders now share a working tree; `skills:` split between `permission.skill` restriction and plugin preloading; unresolvable names struck.

Three need real rewriting. `lead` loses its entire escalation section - the tier language goes rather than being translated - and gains four levers, the declare-and-batch policy, the folded corpus-write convention, and loses every board instruction including the invariant about never writing a board column. `coder` loses its worktree paragraph and gains a line saying what is true instead. `fleet-steward` loses its Notion filing, which is most of what it does, and with the evals deferred it is the body most at risk of becoming a stub that looks like parity and is not - it deserves an honest register row, and whether it ships at all in v1 is worth a decision.

Three concurrent batches: the read-only four, the writing three, the two rewrites. The three `opencode.json` permission edits merge by hand rather than having three agents write one file.

Verified by all ten listing, every body loading without a schema error, the Phase 4 suite passing for every row, and each of the ten running one representative task inside the chosen window.

Depends on 4. Phase 6 runs concurrently with all of it.

## Phase 6 - commands

`init` and `kickoff`. Hold the line on the extra capability and use only the per-command model override, which participates in declare-and-batch rather than reaching for a lever the fleet withheld. Register that one use.

Both need rewriting rather than translation. `init` references `${CLAUDE_PLUGIN_ROOT}`, merges into `.claude/settings.json` and copies a glossary rule, none of which exist here; it becomes materialise `.opencode/`, write or merge `opencode.json`, create the work directories, run the guided fill. `kickoff` loses its board setup entirely, roughly a third of what it does.

Verified by running `init` twice on a scratch project and observing that nothing is overwritten, then `kickoff` reaching the point where it would start the spec pipeline.

Fails if OpenCode has no equivalent of the guided-fill interaction. Fallback is a command that writes the skeleton and reports remaining markers, which is a lesser command and a register row.

Concurrent with Phase 5.

## Phase 7 - the pipeline runs, and ui-designer sees

Nothing new is built. This demonstrates the bar.

Run the pipeline end to end on the chosen model: a spec produced, the human gate observed as an actual stop, a plan produced, a second gate observed, a phase coded, a diff reviewed. A gate is only a gate if the agent stops at it, and that is demonstrated rather than reasoned about.

Then swap to `qwen3.8-27b`, run a design task, and have `ui-designer` read back an image of its own output. Having a vision model and being able to see your work are not the same claim. Record the full outage on a genuinely cold load, since the thirteen-second figure had 114GB of warm page cache behind it. Deliberately interleave two tiers so the swap count is legible afterwards.

Fails if an agent walks through a gate. That is the most important behavioural property the port carries across, and the fallback is making the gate structural - the command ends and continuing needs a second invocation - rather than a sentence in a body.

Depends on 5 and 6.

## Phase 8 - close the register, and install

The register completed, the install script, the measurement write-ups.

The register is what makes this a port rather than a rewrite: a reader goes from any fleet artefact to either its counterpart or its reason for absence without reading a diff. It carries the model dimension per agent, and declare-and-batch recorded as invented rather than ported with the reason, so a later reader does not hunt for a counterpart that does not exist. Deferred and dropped get different rows.

Verified by a clean checkout, `install-project.sh` run twice against a scratch project, a session started there using the ported lead and spawning every ported subagent, plus a grep confirming the checkout holds neither a credential nor a reference to one.

Send `reviewer` on the credential surface over the whole tree rather than the diff. A committed token is the failure a later commit cannot undo.

Depends on everything.

## Parallelism

0, 1 and 2 concurrent. 3 depends on all three and is the gate. 4 depends on 3 and cannot be split. 5 depends on 4 and splits into three concurrent batches. 6 concurrent with 5. 7 depends on 5 and 6. 8 depends on everything.

The build runs on Claude, so the four-slot limit and the 64k window constrain what the port produces at runtime rather than how many agents build it. Phase 7 is the exception, being a runtime demonstration.

## Where `reviewer` is not optional

Phase 3's permission ruleset, because `findLast` makes order silently load-bearing. Phase 4's plugin, plus `refuter` after it. Phase 8's credential surface, over the whole tree.
