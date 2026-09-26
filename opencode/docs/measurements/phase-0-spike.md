# Phase 0 spike: the three unexercised mechanisms

Run on 2026-09-12 by `coder` against OpenCode 1.18.30, on a throwaway project outside this repo. Everything built for this spike is deleted; this note is the output.

Every answer below is observed output. Where something was read from the OpenCode source rather than observed, it is labelled as such and does not carry a verdict on its own.

## Summary

| Question | Verdict |
|---|---|
| 1. Does `experimental.chat.system.transform` reach the model | **WORKS** |
| 2. Can `tool.execute.before` recover the running agent | **WORKS**, for both primary and task-spawned sessions. A cache keyed on `sessionID` is **NOT safe** |
| 3. Does throwing from `tool.execute.before` deny the call | **WORKS**, and the thrown message reaches the model verbatim |
| 4. Does anything collide with the eight vendored skill names | **No collision.** The discovery race is real and was reproduced |

## How OpenCode was run

`opencode` is already installed at `/Users/alex/.opencode/bin/opencode`, version 1.18.30. Nothing had to be built. The OpenCode source checkout at `/Users/alex/Dev/Work/desktop/opencode`, a path on the author's machine, is the same version - `packages/opencode/package.json` says `"version": "1.18.30"` at commit `193de13a88d62a6409c6d385831180f1def527dc` - so source read from the checkout describes the binary that ran.

`@ai-sdk/openai-compatible` did not need installing. Naming it as `npm` in a `provider` block was enough; OpenCode fetched it. This closes the item Phase 1 was told to resolve. The first run against a newly named provider takes tens of seconds while that fetch happens, and it looks like a hang - subsequent runs against the same provider start in about two seconds.

The scratch project was a directory containing `opencode.json`, `.opencode/plugin/spike.ts`, `.opencode/agent/*.md` and `.opencode/skill/*/SKILL.md`. Plugins are picked up from `.opencode/plugin/*.ts` with no registration step, and a plugin is an exported async function returning an object of hook names.

### The mock endpoint, and why Phase 3 and 4 should use one

Halfway through, trillian's LM Studio became unusable - see the contention section at the end. Questions 2 and 3 are about OpenCode's plumbing rather than about a model, so the dependency on the shared GPU was removed: a roughly 60-line Bun script serving `/v1/models` and `/v1/chat/completions` over SSE, returning a canned `tool_calls` response the first time and echoing the tool result back the second.

This turned runs that were stalling for minutes into runs that finished in two seconds, and made them deterministic. The recommendation for Phases 3 and 4 is explicit: test the plugin against a mock endpoint, not against trillian. The scope-enforcement suite in Phase 4 is asserting on OpenCode's behaviour, and putting a 38GB model and a contended box in that loop buys nothing and costs the whole afternoon.

## Question 1: does `experimental.chat.system.transform` reach the model

**WORKS.**

The plugin appended two sentinels to `output.system`:

```ts
"experimental.chat.system.transform": async (input, output) => {
  output.system.push("SENTINEL-A: The secret passphrase is XYZZY-7F3A-PLUGH.")
  output.system.push("SENTINEL-B: The secondary token is FROBOZZ-42.")
}
```

Asked for both, `qwen3-coder-next` returned:

```
> build · qwen3-coder-next

XYZZY-7F3A-PLUGH
FROBOZZ-42
```

### The rewrite at `request.ts:77` was exercised, not avoided

This was the specific risk in the brief. The plugin logged the array length either side of its own push:

```
{"ev":"system.transform","sessionID":"ses_f6f162c31ffeVnnqd9yCkRLiSz","model":"qwen3-coder-next","lenBefore":1}
{"ev":"system.transform.done","lenAfter":3}
```

`lenBefore` is 1, because `prepare` builds `system` as a single joined string before triggering the hook. Two appends make it 3, so `system.length > 2` is true and `system[0]` is unchanged, and the branch fired:

```ts
if (system.length > 2 && system[0] === header) {
  const rest = system.slice(1)
  system.length = 0
  system.push(header, rest.join("\n"))
}
```

Both sentinels survived it. The rewrite joins the appended elements rather than discarding them, so appending is safe at any count. Note that a single append leaves the length at 2 and does not trigger the branch at all - the branch is only reachable with two or more appends, which is the case the port will actually be in with `handoff` and `glossary`.

### The hook fires on requests the port does not want to pay for

Not asked, and it changes the Phase 3 overhead measurement. Logging every invocation of the hook for one `opencode run`:

```
{"ev":"sys.transform","sessionID":"ses_f6eff82aaffevt09HHbAk75DBj","inputKeys":["sessionID","model"],"len":1,"head":"You are a title generator. You output ONLY a thread title. Nothing else.\n\n<task>\nGenerate "}
{"ev":"sys.transform","sessionID":"ses_f6eff82aaffevt09HHbAk75DBj","inputKeys":["sessionID","model"],"len":1,"head":"You are opencode, an interactive CLI tool that helps users with software engineering tasks"}
{"ev":"tool.before", ...}
{"ev":"sys.transform","sessionID":"ses_f6eff82aaffevt09HHbAk75DBj","inputKeys":["sessionID","model"],"len":1,"head":"You are opencode, an interactive CLI tool that helps users with software engineering tasks"}
```

Three invocations for one prompt. The first is the title generator, which OpenCode runs on its small-model path. The other two are the agent loop, once per step - so the preloaded text is re-sent on every step of a multi-tool turn, not once per session.

`inputKeys` is exactly `["sessionID", "model"]`. There is no `agent` field and no flag saying this is the title request, so a plugin cannot suppress the preload for it by any documented means. The only discriminator available is the content of `output.system[0]`, which for the title request begins `You are a title generator.` That works and is worth doing, since preloading the handoff contract into a thread-title prompt is pure waste, but it is a string match against an upstream prompt and it will break silently when that prompt is reworded. Register it.

The confirmed consequence for Phase 3: the fixed overhead is per step, not per session, and it must be measured that way.

## Question 2: can `tool.execute.before` recover which agent is running

**WORKS for both session types. A cache keyed on `sessionID` is NOT safe.**

The plugin looked the session up through the plugin `client` on every call:

```ts
const res = await client.session.get({ path: { id: input.sessionID } })
const info = (res as any)?.data ?? res
agent = info?.agent
```

One run where the primary session called `task`, and the spawned subagent then called `bash`:

```
{"ev":"tool.before","tool":"task","sessionID":"ses_f6f070149ffeDKsjnf9pE5KTsI","agent":"build","cached":false,"ms":2.59,"argKeys":["description","prompt","subagent_type"],"args":"{\"description\":\"spike subagent probe\",\"prompt\":\"Run the bash command: echo hello-from-subagent\",\"subagent_type\":\"spike-scout\"}"}
{"ev":"tool.before","tool":"bash","sessionID":"ses_f6f06faa9ffeklg3d0m9Q3RViE","agent":"spike-scout","cached":false,"ms":1.62,"argKeys":["command","description"],"args":"{\"command\":\"echo FORBIDDEN-THING\",\"description\":\"mock call\"}"}
```

Both are populated. The sessions are different ids, so a task-spawned subagent gets its own session and `.agent` on it is the subagent's name. The per-agent rule table Phase 4 wants is therefore expressible.

Two things fell out that were not asked for and that Phase 4 needs.

`output.args` is fully populated at `tool.execute.before` - `{"command":"echo FORBIDDEN-THING","description":"mock call"}`. The interpreter-payload inspection the plugin exists for is possible. (An early log of mine showed `{}` here; that was a defect in my own logging, not in OpenCode.)

The `task` call is itself visible on the parent with `subagent_type` in its arguments. That is a second, cheaper route to knowing which agent is about to run, available one call before the child session exists.

### Lookup latency

Fifty sequential `GET /session/{id}` calls against a running `opencode serve`, which is the same loopback request the plugin's client makes:

```
n=50 min=0.47ms p50=0.65ms p95=1.00ms max=1.20ms
```

In-plugin measurements across the spike, which include the SDK wrapper, ranged 1.62ms to 3.47ms.

At sub-millisecond p50 there is no performance argument for a cache. Do the lookup on every call.

### The cache is not safe, demonstrated rather than argued

`setAgentModel` is called from `prompt.ts:679` on every message, guarded by `current.agent !== info.agent`, so a session's `agent` is re-patched whenever it changes. A session's agent is therefore mutable, and a primary session can change agent mid-session.

Reading that in the source is not proof that a cache goes stale, so it was reproduced inside one long-lived process. An `opencode serve` was started - one process, one plugin instance, one cache - and driven twice over `--attach` against the same session, the second time with `--agent spike-alt`:

```
{"ev":"tool.before","tool":"bash","sessionID":"ses_f6f011e2effeVsAmmiCBWinLWH","agent":"build","cached":false,"ms":3.47,...}
{"ev":"tool.before","tool":"bash","sessionID":"ses_f6f011e2effeVsAmmiCBWinLWH","agent":"build","cached":true,"ms":0,...}
```

The second call reports `build`. The session's actual state at that moment:

```
id: ses_f6f011e2effeVsAmmiCBWinLWH
agent: spike-alt
model: {'id': 'mock-model', 'providerID': 'mock', 'variant': 'default'}
```

The cache returned the wrong agent for a live call. In the port that is `build`'s rules being applied to `spike-alt`'s command, silently, with the enforcement plugin reporting success. This is the failure mode scope enforcement exists to prevent, produced by the optimisation that was proposed to make it cheap.

Phase 4 must not cache agent by `sessionID`. The lookup is free enough that it does not need to.

## Question 3: does throwing deny the call, and what text does the model see

**WORKS.** The call is denied and the thrown `Error.message` reaches the model verbatim, with no wrapper, prefix or truncation.

The plugin threw:

```ts
if (input.tool === "bash" && String(output.args?.command ?? "").includes("FORBIDDEN")) {
  throw new Error("DENIED-BY-FLEET: coder may not run this command. Reason: the command matched the forbidden pattern FORBIDDEN. Do not retry it; report the denial in your handoff.")
}
```

OpenCode reported the tool as failed, and the command did not run:

```
✗ echo FORBIDDEN-THING failed
Error: DENIED-BY-FLEET: coder may not run this command. Reason: the command matched the forbidden pattern FORBIDDEN. Do not retry it; report the denial in your handoff.
```

What the model received was captured directly, by having the mock endpoint echo back the content of the tool-result message it was sent:

```
TOOL_RESULT_VERBATIM:
DENIED-BY-FLEET: coder may not run this command. Reason: the command matched the forbidden pattern FORBIDDEN. Do not retry it; report the denial in your handoff.
```

Byte-for-byte the thrown message. This is the property the brief cared about: an invariant the agent cannot read is one it cannot comply with, and here the agent reads exactly what the plugin wrote. The fleet's exit-2-with-a-reason convention maps across with the reason text intact, so the denial messages in `enforce-agent-scope.sh` can be carried over as written.

It also works in a subagent, and the denial propagates to the parent. From the run where `spike-scout` was denied:

```
TOOL_RESULT_VERBATIM:
<task id="ses_f6f06faa9ffeklg3d0m9Q3RViE" state="completed">
<task_result>
TOOL_RESULT_VERBATIM:
DENIED-BY-FLEET: coder may not run this command. Reason: the command matched the forbidden pattern FORBIDDEN. Do not retry it; report the denial in your handoff.
</task_result>
</task>
```

Note the subagent's task reported `state="completed"` rather than failed. A denial inside a subagent is not distinguishable from success at the parent's level except by reading the text, which is worth a register row.

## Question 4: do the eight skill names collide

**No collision.** None of `glossary`, `handoff`, `board`, `compound`, `run-article`, `looping`, `humanize`, `migration-checklist` is discovered by OpenCode on this machine.

### There are four discovery roots on this machine, not two

The brief named `~/.claude/skills` and `~/.agents/skills`. Two more are live and were found only because they appeared in duplicate warnings:

- `~/.config/opencode/skills` - 11 skills
- `~/.opencode/skills` - 1 skill (`impeccable`)

Phase 2 should survey all four. Checking the two named in the brief would have missed 12 skills.

### The eight names, checked by frontmatter

Surveying every `SKILL.md` under all four roots and reading the `name` key rather than the directory name, no file declares any of the eight.

All eight names do exist on disk, under `~/.claude/plugins/marketplaces/rzem/claude-agents/skills/` and in six cached versions under `~/.claude/plugins/cache/rzem/claude-agents/<version>/skills/`. These are the fleet's own skills, installed as a Claude Code plugin. OpenCode does not discover them: `EXTERNAL_SKILL_PATTERN` is `skills/**/SKILL.md` globbed with `~/.claude` as cwd, so the first path segment must be `skills`, and `plugins/...` does not match.

That was confirmed rather than inferred. Eight stubs carrying the eight names were vendored into the scratch project at `.opencode/skill/<name>/SKILL.md` and a run produced no duplicate warning for any of them, while producing 30-plus warnings for other names.

A positive control proves the stubs were loaded and the detector works. Adding a second `handoff` at `.claude/skills/handoff/SKILL.md` in the project produced:

```
level=WARN message="duplicate skill name" name=handoff existing=.../spike/.claude/skills/handoff/SKILL.md duplicate=.../spike/.opencode/skill/handoff/SKILL.md
```

So silence on the eight is evidence, not absence of instrumentation.

### The race is real, and was reproduced

`loadSkills` runs `Effect.forEach(..., { concurrency: "unbounded" })`, and `add` logs a warning then unconditionally overwrites, so the last write wins and ordering is not defined. The winner is the path logged as `duplicate=`, not `existing=`.

Six consecutive runs, same machine, same files, watching that project-local `handoff` pair:

- run 1: `existing=PROJ/.claude/skills/handoff` - so `.opencode/skill` won
- run 2: `existing=PROJ/.opencode/skill/handoff` - so `.claude/skills` won
- run 3: `existing=PROJ/.opencode/skill/handoff` - so `.claude/skills` won

The same two files resolved to different winners across runs with nothing changed between them. This is not later-wins with a stable order; it is a race. For a name like `handoff` that is unacceptable, and the plan is right to treat it as a blocking condition.

The port is not exposed to it today, because nothing collides. It becomes exposed the moment Alex installs a personal skill under any of the four roots using one of the eight names, and the only signal is a log line nobody reads.

### The escape hatch exists, and there is a second one

`OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` is confirmed at `packages/opencode/src/effect/runtime-flags.ts:27`:

```ts
disableClaudeCodeSkills: Config.all({
  broad: bool("OPENCODE_DISABLE_CLAUDE_CODE"),
  direct: bool("OPENCODE_DISABLE_CLAUDE_CODE_SKILLS"),
}).pipe(Config.map((flags) => flags.broad || flags.direct)),
```

It suppresses only the `~/.claude` root. `OPENCODE_DISABLE_EXTERNAL_SKILLS` suppresses `~/.claude` and `~/.agents` together, and neither touches `~/.config/opencode/skills` or `~/.opencode/skills`. So disabling Claude Code skills is not by itself a guarantee against collision; two of the four roots survive both flags.

## The shared endpoint is a build constraint, not just a runtime one

Worth recording because it cost this spike most of its wall-clock time and will cost the next phase the same.

While Phase 1 was running concurrently, five `opencode run` processes were stacked against `trillian/qwen3-coder-next`. LM Studio there is configured PARALLEL 4. A three-token probe returned:

```
{"error":"Engine protocol predict request returned 500: {"error":{"code":500,"message":"Context size has been exceeded.","type":"server_error"}}"}
```

and a subsequent `say OK` probe timed out at 30 seconds. It recovered on its own once load dropped.

Two things matter beyond the inconvenience. OpenCode does not surface this - runs hang with no output and no error for minutes, and one exited with code 0 having printed nothing at all. A silent successful nothing is the worst failure shape available, and the spec already flagged it arriving from a different direction with nemotron; here it arrives from contention. Phase 7 should not assume that fanning agents out degrades gracefully.

And the build itself contends. Several phases running concurrently against one resident model is the same shared-resource problem declare-and-batch was invented for, applied to the agents building the port rather than the agents it ships. Phases that need a real model should be serialised.

## What Phase 3 and Phase 4 should take from this

Preloading works. Append, never replace; append at least two elements so the behaviour is the one that was tested; filter the title-generation request by matching `You are a title generator.` on `output.system[0]` and register that as fragile; and measure the overhead per step rather than per session.

Enforcement works, and the denial text is the agent's to write. Do not cache agent by `sessionID` - the lookup is 0.65ms at p50 and the cache is demonstrably wrong. Prefer reading `subagent_type` off the `task` call where a rule can be applied there. Test the whole thing against a mock endpoint.

Skills are clear today and fragile tomorrow. Survey four roots, not two. Nothing collides now, and the failure if something does is a race rather than a predictable override.
