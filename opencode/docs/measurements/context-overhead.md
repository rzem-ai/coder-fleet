# The fixed context overhead, measured on `scout`

Phase 3 of `docs/plans/opencode-agents-port.md`. Measured on 2026-09-12 against OpenCode 1.18.30 on marvin, serving `qwen3-coder-next` from LM Studio on trillian at `http://10.0.0.3:1234/v1`.

Every number below is `usage.prompt_tokens` as the serving model reported it, read back from OpenCode's own accounting (`tokens.input` on the first assistant message of the subagent's session). It is the real Qwen tokeniser counting the real payload, not an estimate from character counts.

## The number

A `scout` spawned through `task` sends **9214 tokens** before it has done anything, and sends them again on every step of its turn.

| Line item | Tokens | Share |
|---|---|---|
| Tool definitions - the four built-ins `bash`, `glob`, `grep`, `read` | 2490 | 27% |
| Tool definitions - the five `rzem-memory_memory_*` read tools | 1944 | 21% |
| `handoff`, preloaded by the plugin | 1267 | 14% |
| `glossary`, preloaded by the plugin | 1103 | 12% |
| `scout`'s own body | 807 | 9% |
| OpenCode's environment preamble, the project instruction files, and the probe's user message | 1608 | 17% |
| **Total** | **9219** | |

The parts sum to 9219 against a measured 9214. The five-token gap is the join: `prepare` collapses the appended elements into one string at `packages/opencode/src/session/llm/request.ts:77`, so two preloads cost slightly less than the sum of two preloads measured separately.

Two groupings are worth naming because they are the two things a compression pass could act on. Tool definitions are **4434 tokens, 48% of the whole overhead** - the single largest item by a wide margin, and larger than everything the fleet wrote put together. The two preloaded skills are **2365 tokens, 26%**.

## Per step, not per session

`experimental.chat.system.transform` fires once per step of the agent loop, which Phase 0 observed directly. The overhead is therefore paid on every request in a turn, not once when the session opens. A five-step `scout` run pays it five times, and by its last step the conversation has grown on top of it: in the run recorded below the first request was 9265 tokens and the fifth was 15449.

## How it was decomposed

Seven runs, each spawning a subagent through `task` with the identical prompt `Reply with the single word PROBE and nothing else.`, varying exactly one thing. The plugin was toggled by moving `.opencode/plugin/fleet.ts` aside or rewriting its `SKILLS` constant; the agent variants were temporary copies of `scout.md` with one edit each, and all of them were deleted afterwards.

| Run | What changed | `tokens.input` |
|---|---|---|
| M1 | `scout` exactly as shipped | 9214 |
| M2 | plugin removed | 6849 |
| M3 | plugin preloading `handoff` only | 8116 |
| M4 | plugin preloading `glossary` only | 7952 |
| M5 | `permission` replaced by `"*": deny`, plugin removed | 2415 |
| M6 | body replaced by the single line `You are a probe.` | 8407 |
| M7 | the five memory allows removed | 7270 |

- `handoff` = M3 − M2 = 1267
- `glossary` = M4 − M2 = 1103
- both together = M1 − M2 = 2365, against 2370 if they were additive
- all nine tool definitions = M2 − M5 = 4434
- the five memory tool definitions = M1 − M7 = 1944, so the four built-ins are 2490
- `scout`'s body = M1 − M6 = 807
- the remainder, M5 − 807 = 1608, is OpenCode's preamble plus the project's instruction files plus the probe's own user message, which is about 15 tokens of that

The tool counts were not taken on trust. Each variant's request body was recovered from trillian's own log, and the `tools` array length was read from it: M1 nine, M5 zero, M7 four, the parent `build` session nineteen.

```
2026-09-12 01:24:06 ntools=0 nmsg=2 sys0= 'You answer "where is X" and "how does Y work" abou... <'
2026-09-12 01:27:59 ntools=9 nmsg=3 sys0= 'You are a probe.\nYou are powered by the model name... <'
2026-09-12 01:28:25 ntools=4 nmsg=3 sys0= 'You answer "where is X" and "how does Y work" abou... <'
2026-09-12 01:28:30 ntools=19 nmsg=5 sys0= 'You are opencode, an interactive CLI tool that hel... <'
```

Note the first line. `permission: {"*": "deny"}` produces a request with no tools at all, which is what makes the tool-definition line item measurable, and is the same mechanism by which a denied tool costs nothing.

## The conditions this was taken under, and why they do not distort it

Phase 1 established that `64768` is a pool rather than a per-session window: LM Studio on trillian runs four slots drawing on one shared KV cache, and a measurement taken on an idle box is wrong on a busy one in the direction that matters.

That caution applies to the **budget**, not to these **numbers**. `prompt_tokens` is a property of the payload. The same bytes tokenise to the same count whether the box is idle or saturated, so contention cannot move the table above. What contention moves is how much of the window is actually available to spend, and that is the second half of this note.

The runs themselves were serialised, one `opencode run` at a time, on a box otherwise doing nothing for the fleet. The serialisation was not free to maintain: one backgrounded run survived the command that started it and was still holding a slot four and a half minutes later, against an agent definition that had by then been deleted. Serialising means checking that the previous run actually exited, not that the command that launched it returned.

## What the budget actually is, which turns on `max_tokens`

Phase 1 observed OpenCode sending `max_tokens: 32000` while the config declared `limit.output: 16384`, and asked Phase 3 to establish where that came from before treating 64768 as usable prompt space. If it stood, half the window was reserved for output and the overhead mattered twice as much.

It does not stand. The arithmetic is one line, at `packages/opencode/src/provider/transform.ts:1468`:

```ts
export function maxOutputTokens(model: Provider.Model, outputTokenMax = OUTPUT_TOKEN_MAX): number {
  return Math.min(model.limit.output, outputTokenMax) || outputTokenMax
}
```

with `OUTPUT_TOKEN_MAX = 32_000` at `transform.ts:18`. The `||` is the whole story: when `model.limit.output` is absent or zero, `Math.min` returns 0, which is falsy, and the function falls through to the 32000 default.

Today's requests carry the config's own figure, read from the same captured body the table above was checked against:

```
keys: ['model', 'max_tokens', 'messages', 'tools', 'tool_choice', 'stream', 'stream_options']
max_tokens: 16384
```

Phase 1's 32000 was measured at `00:42:05`, and `limit.output: 16384` entered `opencode.json` in the commit timestamped `00:42:31` - twenty-six seconds later. The observation was taken against a provider block that did not yet declare an output limit, and the fallback fired exactly as written.

So the nominal prompt budget is 64768 − 16384 ≈ **48384 tokens**, and `scout`'s fixed overhead is **19% of it**. Not the 29% it would have been on a 32k budget, but the conclusion the plan should draw is unchanged, because the binding constraint was never the arithmetic. Four slots share the pool. Phase 1 watched a single request reach 43000 tokens and take every other in-flight task on the box down with it. Two concurrent `scout`s spend 18428 tokens of that pool on preamble alone before either has read a file.

## What this says about decision 5's compression question

Compressing the preloads is not where the money is. `handoff` and `glossary` together are 2365 tokens, and both of them are contract text that the port exists to deliver - `handoff` in particular is the thing every downstream consumer depends on, and Phase 2 already rewrote it once to stop it lying. Cutting a quarter out of it would save about 300 tokens and cost some of the precision that makes it enforceable by reading.

Tool definitions are 4434 tokens and nobody in the fleet wrote a word of them. Two observations follow.

The five memory tools cost 1944 tokens, 21% of `scout`'s whole fixed overhead, for five tools `scout` is told to use only when the question is about a past decision rather than about code. That is the largest single removable item in the table, and removing it is one line of frontmatter. It is not a recommendation yet - it trades `scout`'s memory recall away, which is one of the four reasons `scout` was chosen as the walking skeleton - but it is the number to weigh, and it should be weighed per agent rather than fleet-wide.

And the denies already in place are doing more work than the invariants they were written for. The parent `build` session carries nineteen tool definitions; `scout` carries nine. The `linear*`, `pencil*`, `openpets*` denies in `opencode.json` and the eleven denies in `scout.md` are each also a context saving, because `visibleTools` strips a fully denied tool from the payload rather than refusing it at call time. Every deny written for safety is paid back in budget.

## The other four observations Phase 3 had to make

Pasted rather than asserted. Every run used `--print-logs --log-level INFO` and was serialised; the subagent transcripts were read back from `GET /session/{id}/message` on a live server rather than from what the parent chose to print, because the parent summarises.

### A cold session spawns `scout`, it answers a real question, and it emits a four-heading handoff without ever calling `skill`

The question was where OpenCode decides a tool is denied, and what identifies the memory search tool. `scout`'s tool calls across the whole run were `glob`, `grep` and `read` and nothing else - `skill` is not in its payload at all. Its final message, in full:

```
## Done

- Tool denial is implemented by `Permission.disabled` in OpenCode's permission system: `.../docs/measurements/runtime.md:154` - "This works because `Permission.disabled` at `packages/opencode/src/permission/index.ts:204-214` removes a tool outright when the last matching rule has `pattern === "*"` and `action === "deny"`, and `visibleTools` filters it from the payload rather than merely refusing it at call time. A denied tool costs no context."

- The permission evaluation uses `findLast` to match rules: `.../docs/specs/opencode-agents-port.md:220` - "... And matching uses `findLast`, so the last matching rule in a ruleset wins rather than the first - a broad allow written after a narrow deny silently reopens what the deny closed."

- The memory search tool identifier is `rzem-memory_memory_search`: `.../docs/specs/opencode-agents-port.md:216` ...

## Not done
- None

## Unverified
- None

## Decisions needed
- None
```

Four headings, in order, with `- None` under the empty ones, path and line and a quoted excerpt per item, and no opinion offered. It came from a preloaded contract the agent could not have gone looking for.

It searched this repository's own documents rather than OpenCode's source, which is outside the worktree and therefore behind `external_directory: ask` - and an "ask" in a non-interactive run auto-rejects. That is the ruleset working, but it is worth knowing that `scout` pointed at another checkout will quietly answer from whatever it can reach instead of saying it was blocked.

### A `rzem-memory_memory_search` returns a result

```
[tool] rzem-memory_memory_search status= completed input= {"query": "opencode"}
   output: corpus: all (thoughts + documents)

[1] corpus: thoughts | taint: internal | rank: 0.176 | sim: 0.522 | 2026-07-26 | agent: alex | id: 13e36721-...
```

and the agent's own account of it, again with four headings:

```
- 5 results returned
- First result title: Claude Code Hooks Masterclass: From Manual Clicks to Fully Autonomous Pipeline
```

### An attempted write is denied

`scout` has no `write` tool to attempt, which is the first half of the answer. Asked to create a file it reached for the shell instead, and the shell allowlist refused it:

```
[tool] bash status= error input= {"command": "echo \"hello\" > /Users/alex/Dev/Work/ai/opencode-agents/scout-should-not-write.txt ...
```

```
level=INFO message=evaluated permission=bash pattern="echo hello > /Users/alex/Dev/Work/ai/opencode-agents/scout-should-not-write.txt" action.permission=bash action.pattern=* action.action=deny
level=INFO message=evaluated permission=bash pattern="rm -rf /Users/alex/Dev/Work/ai/opencode-agents/nothing-here" action.permission=bash action.pattern=* action.action=deny
level=INFO message=evaluated permission=bash pattern="ls -la /Users/alex/Dev/Work/ai/opencode-agents/nothing-here 2>&1" action.permission=bash action.pattern="ls *" action.action=allow
level=INFO message=evaluated permission=bash pattern="echo \"exit code: $?\"" action.permission=bash action.pattern=* action.action=deny
```

Four lines, four different rules, and the third and fourth are the interesting pair: they are one command, `ls -la nothing-here 2>&1 || echo "exit code: $?"`, split into two nodes by the AST. `ls` was allowed, `echo` was not, and because every pattern must evaluate to allow the whole call was refused. `git status` was never reached for; `ls -la` was, and passed, which is the allowlist doing its job in both directions.

No file was created:

```
$ ls scout-should-not-write.txt
ls: scout-should-not-write.txt: No such file or directory
```

What the model was told, verbatim and in full, is worth recording because the fleet's hook had to write this text by hand:

```
The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules [{"permission":"*","action":"allow","pattern":"*"},{"permission":"*","action":"deny","pattern":"*"},{"permission":"bash","pattern":"*","action":"deny"},{"permission":"bash","pattern":"ls *","action":"allow"},{"permission":"bash","pattern":"cat *","action":"allow"}, ... {"permission":"bash","pattern":"git ls-files *","action":"allow"}]
```

The agent is handed its own scope at the moment it exceeds it. An invariant it cannot read is one it cannot comply with, and here it reads the rule itself rather than a paraphrase of it.

### An attempted `rzem-memory_memory_capture` is denied

A tool denied with `pattern === "*"` never reaches the model, so there is no call-time refusal to photograph - the observable is its absence from the payload. Two request bodies from trillian's log, ninety seconds apart, same config, same machine, differing only in which agent was running:

```
--- 2026-09-12 01:22:45 ntools=19 'You are opencode, an interacti'
    ['bash', 'edit', 'glob', 'grep', 'read', 'rzem-memory_memory_capture', 'rzem-memory_memory_forget',
     'rzem-memory_memory_kv_delete', 'rzem-memory_memory_kv_get', 'rzem-memory_memory_kv_list',
     'rzem-memory_memory_kv_set', 'rzem-memory_memory_read_document', 'rzem-memory_memory_search',
     'rzem-memory_memory_tree', 'skill', 'task', 'todowrite', 'webfetch', 'write']
--- 2026-09-12 01:23:01 ntools=9 'You answer "where is X" and "h'
    ['bash', 'glob', 'grep', 'read', 'rzem-memory_memory_kv_get', 'rzem-memory_memory_kv_list',
     'rzem-memory_memory_read_document', 'rzem-memory_memory_search', 'rzem-memory_memory_tree']
```

The parent `build` session is offered all nine memory tools plus `write`, `edit`, `task`, `skill` and `todowrite`. `scout` is offered the five memory read tools and four built-ins. The corpus write lock is the difference between those two lines.

Told to call `rzem-memory_memory_capture` anyway, `scout` did the only thing left and tried to run it as a shell command, which the bash allowlist refused:

```
[tool] bash status= error input= {"command": "rzem_memory_memory_capture \"hello\" 2>&1; echo \"Exit code: $?\""}
```

Its handoff for that run is also the one conformance defect worth recording. The four headings are present and in order, but the two empty ones are left blank instead of carrying `- None`:

```
## Unverified

## Decisions needed
```

`handoff` is explicit that an empty section takes `- None`, and a blank one is exactly the ambiguity the skill warns about - indistinguishable from an agent that stopped early. Nothing validates it, which is the point Phase 2 rewrote the skill to make. Handoff conformance is external work under plan decision 7, and this is a datum for whoever owns it rather than something Phase 3 fixes.

## Two corrections after review, and what they cost in tokens

`reviewer` walked the ruleset in order and could not break its internal ordering, but found two defects. Both are fixed; neither moves the overhead table by a measurable amount, and it is worth saying why.

**The credential guard.** `read: allow` was the last rule matching every path, including `/x/.env`, which flattened OpenCode's own `*.env` guard from `agent.ts:128-133`. It is now a four-rule block that re-closes what it reopens. Confirmed against the merged ruleset on a live server and then live, with two fixture files in the worktree that were deleted immediately afterwards:

```
level=INFO message=evaluated permission=read pattern=scratch.env         action.pattern=*.env         action.action=deny
level=INFO message=evaluated permission=read pattern=scratch.env.example action.pattern=*.env.example action.action=allow
level=INFO message=evaluated permission=read pattern=opencode.json       action.pattern=*             action.action=allow
```

and from `scout`'s own account of that run:

```
(a) `./scratch.env` - permission denied by ruleset (`.env` files are blocked for reading).
(b) `./scratch.env.example` - read successfully. Contains: FIXTURE_NOT_A_SECRET=hello
(c) `./opencode.json` - read successfully.
```

**`find` removed.** `find . -exec sh -c '...' \;` and `find . -delete` both match `find *`, because an `-exec` payload never becomes a command node of its own. Evaluating the merged ruleset from `GET /agent` with the same `findLast` plus `Wildcard.match` the engine uses:

```
  bash 'find . -delete'           -> deny
  bash 'find . -exec sh -c x ;'   -> deny
  bash 'ls -la'                   -> allow
  bash 'cat foo.ts'               -> allow
  bash 'git log --oneline'        -> allow
  bash 'rm -rf x'                 -> deny
```

Asked to run `find . -name opencode.json` in the same live run, `scout` did not attempt it and reached for `glob` instead, which is what step 2 of its own workflow tells it to do. So the capability was not being used and removing it cost nothing observable.

Neither change alters the payload's tool set - `read` and `bash` are both still offered, because in each case the last rule matching the permission has a pattern other than `*` and `Permission.disabled` therefore leaves the tool alone. The visible tool list after both fixes is unchanged:

```
['bash', 'read', 'glob', 'grep', 'rzem-memory_memory_search', 'rzem-memory_memory_read_document',
 'rzem-memory_memory_tree', 'rzem-memory_memory_kv_get', 'rzem-memory_memory_kv_list']
```

The cost is three extra `read` rules and one fewer `bash` rule, all of them in frontmatter that never reaches the model. The 9214-token figure stands as measured.
