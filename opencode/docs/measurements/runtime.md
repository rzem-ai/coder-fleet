# Runtime foundation: what was observed

Phase 1 of `docs/plans/opencode-agents-port.md`. Measured on 2026-09-12 against OpenCode 1.18.30 on marvin, serving from LM Studio on trillian at `http://10.0.0.3:1234/v1`.

Everything below is pasted output rather than an assertion about it. Where a number is derived rather than observed, it says so.

## The adapter question, which blocked everything

The spec flagged as unverified whether OpenCode bundles `@ai-sdk/openai-compatible` or expects it installed. It bundles it, and no install step is needed.

`packages/opencode/src/provider/provider.ts:123` registers it in `BUNDLED_PROVIDERS`:

```
"@ai-sdk/openai-compatible": () => import("@ai-sdk/openai-compatible").then((m) => m.createOpenAICompatible),
```

and `provider.ts:1831` consults that table before it ever reaches the npm path:

```
const bundledLoader = BUNDLED_PROVIDERS[model.api.npm]
if (bundledLoader) {
  const factory = await bundledLoader()
  ...
}

const installedPath = await (async () => {
  ...
  const item = await Npm.add(model.api.npm)
```

It is also a direct dependency of the `opencode` package at version 2.0.41. So a provider block naming `@ai-sdk/openai-compatible` resolves from the binary, offline, with nothing in `~/.config/opencode/node_modules`.

## Observation 1 - a completion returns with the served model id matching the pin

The federation is real: `/v1/models` on trillian lists 39 ids spanning marvin and eddie. Only one is loaded locally, and the pin names that one. From LM Studio's native endpoint:

```
$ curl -s http://10.0.0.3:1234/api/v0/models | ... filter state != not-loaded
qwen3-coder-next |state: loaded |ctx: 64768 |max: 262144 |type: llm
```

A run through OpenCode, not a hand-written curl:

```
$ opencode run --model trillian/qwen3-coder-next "Reply with exactly: PIN-OK and nothing else."
> build · qwen3-coder-next
PIN-OK
```

The claim that no request reached a federated peer is not made from that line - OpenCode printing a model name only proves what OpenCode intended. It is made from trillian's own server log, which records the body it received:

```
[2026-09-12 00:42:05][DEBUG] Received request: POST to /v1/chat/completions with body {
  "model": "qwen3-coder-next",
  "max_tokens": 32000,
  "messages": [
```

and then serves it under the tag of the locally loaded instance:

```
[2026-09-12 00:42:05][INFO][qwen3-coder-next] Running chat completion on conversation with 3 messages.
[2026-09-12 00:42:05][INFO][qwen3-coder-next] Streaming response...
[2026-09-12 00:42:16][INFO][qwen3-coder-next] Finished streaming response
```

A grep of the whole day's log for federation markers - `lm link`, `lmlink`, `federat`, `remote host`, `forwarding` - returns 0 matches. The request named the loaded local model, trillian answered it, and nothing was forwarded.

One thing in that body is worth carrying forward rather than leaving in a log: OpenCode sent `max_tokens: 32000` despite the config declaring `limit.output: 16384`. On a 64768 window that reserves half the context for output. It did not cause a failure here, but Phase 3 measures the context budget and should establish where that number comes from before treating 64768 as the usable prompt space.

## Observation 2 - the nine memory tool identifiers, from a live session

Predicted from `toolName = sanitize(clientName) + "_" + sanitize(name)` at `packages/opencode/src/mcp/catalog.ts:119`, where `sanitize` replaces everything outside `[a-zA-Z0-9_-]` with an underscore. The hyphen in `rzem-memory` survives, so the prefix is `rzem-memory_` and the server-side `memory_search` becomes `rzem-memory_memory_search`.

This is the check that catches the silent no-op class, so it is not verified against the rule that predicted it. `opencode mcp list` confirms the connection but prints no tool names, and neither `/experimental/tool/ids` nor `/experimental/tool` on a live server returns MCP tools - both list built-ins only, 14 and 12 respectively. The identifiers were therefore read from the tool definitions a session actually put in front of the model, recovered from trillian's log of the request body:

```
$ grep -o "\"name\": \"[a-z_-]*memory[a-zA-Z0-9_-]*\"" $LOG | sort -u
"name": "rzem-memory_memory_capture"
"name": "rzem-memory_memory_forget"
"name": "rzem-memory_memory_kv_delete"
"name": "rzem-memory_memory_kv_get"
"name": "rzem-memory_memory_kv_list"
"name": "rzem-memory_memory_kv_set"
"name": "rzem-memory_memory_read_document"
"name": "rzem-memory_memory_search"
"name": "rzem-memory_memory_tree"
```

Nine identifiers, all matching `rzem-memory_memory_*`, and this is what the model saw rather than what the config intended. Phase 4's corpus write lock can be written against these strings.

## Observation 3 - a session with the token present performs a memory_search

```
$ opencode run --model trillian/qwen3-coder-next 'Search my memory for "opencode" using rzem-memory_memory_search, then say how many results came back.'
> build · qwen3-coder-next
⚙ rzem-memory_memory_search {"query":"opencode"}
5 results returned.
```

The tool was called by its full prefixed identifier and returned content. That is the whole chain working at once: the remote entry in the global config, the `{file:}` substitution, the bearer header, the server's static-token check, and the model selecting the tool by the name Observation 2 enumerated.

This did not work on the first three attempts, and the reason matters more than the eventual success - see "What nearly hid behind a wrong diagnosis" below.

## Observation 4 - a session with the token absent fails loudly

The observation that actually tests `{file:}` over `{env:}`, and the one most likely to be skipped.

```
$ mv ~/.config/claude-agents/memory-token ~/.config/claude-agents/memory-token.away
$ opencode run --model trillian/qwen3-coder-next 'Say OK.'
Error: Configuration is invalid at /Users/alex/.config/opencode/opencode.json: bad file reference: "{file:~/.config/claude-agents/memory-token}" /Users/alex/.config/claude-agents/memory-token does not exist
$ echo $?
1

$ opencode mcp list
Error: Configuration is invalid at /Users/alex/.config/opencode/opencode.json: bad file reference: "{file:~/.config/claude-agents/memory-token}" /Users/alex/.config/claude-agents/memory-token does not exist
```

It fails at config load, exit 1, before any session exists. Nothing starts and then authenticates as nobody. Had the header been `{env:RZEM_MEMORY_TOKEN}`, `packages/opencode/src/config/variable.ts:36-38` would have resolved the unset variable to an empty string, sent `Authorization: Bearer `, and the failure would have surfaced as a 401 from the server - pointing whoever debugged it at the memory server rather than at their own config.

One hazard the loud failure does not cover, which is why the install script guards it separately: a token file that exists and is empty resolves without throwing. `install-home.sh` writes through a temporary file and refuses to install a zero-byte result, so a failed fetch leaves a working token in place rather than truncating it.

## What nearly hid behind a wrong diagnosis

Observations 3 and 4 both failed at first, for a reason that had nothing to do with either.

The token was rendered from `AGENT_MEMORY_TOKEN_CLAUDE_CODE` in `/etc/agent-memory/agent-memory.env` on slarti, which is where the phase brief said it lives. It produced a 401. That variable is stale and the server does not read it. The live source of truth is `/etc/agent-memory/mcp.toml`, which names the secret directly:

```
[[auth.tokens]]
name = "claude-code"
secret = { file = "/etc/agent-memory/auth_token.secret" }
agents = ["alex", "angus"]
scopes = ["memory:read", "memory:write", "memory:admin"]
```

Rendering from `/etc/agent-memory/auth_token.secret` instead returns HTTP 200 on `initialize`. The env variable is still present in the environment file, so anyone reading that file will reach the same wrong conclusion. `install-home.sh` records this in a comment at the point of use.

That token carries `memory:read`, `memory:write` and `memory:admin` over the `alex` and `angus` namespaces. One consequence for Phase 4: OpenCode's `mcp` config has one header block per server entry, so the port cannot express the fleet's ten per-agent credentials. Every ported agent shares this one identity, and the corpus write lock is therefore the only thing separating agents that may write from agents that may not. In the fleet the credential was a second, independent lock; here it is not. That belongs in the divergence register.

## The failure that was not authentication, and changes Phase 3

Once the token was right, `memory_search` still failed - three times, silently, with an empty assistant message and exit 0. The cause:

```
[2026-09-12 00:50:54][ERROR][qwen3-coder-next] Engine protocol predict stream returned an error: {"code":500,"message":"Context size has been exceeded.","type":"server_error"}
[2026-09-12 00:50:54][DEBUG] 58.00.747.400 W srv decode: failed to find free space in the KV cache, retrying with smaller batch size, off = 142, n_batch = 1, ret = 1
[2026-09-12 00:50:54][DEBUG] 58.00.748.020 E srv decode: Context size has been exceeded. off = 142, n_batch = 1, ret = 1
```

Two things caused it together, and both matter to the port.

**The tool payload is large.** This machine's global OpenCode config carries three MCP servers unrelated to the fleet - linear, pencil and openpets - and their tool definitions ship in every request alongside the fleet's own. A session's prompt reached roughly 14k tokens before any work started. Adding `"linear*": "deny"`, `"pencil*": "deny"` and `"openpets*": "deny"` to the project's `permission` block fixed it on the next attempt. This works because `Permission.disabled` at `packages/opencode/src/permission/index.ts:204-214` removes a tool outright when the last matching rule has `pattern === "*"` and `action === "deny"`, and `visibleTools` filters it from the payload rather than merely refusing it at call time. A denied tool costs no context.

**64768 is a pool, not a per-session window.** LM Studio on trillian runs four slots - `id 0` through `id 3` appear in the log - and the concurrent Phase 0 spike was running large prompts on the others. One request reached `n_tokens = 43000` at `progress = 0.99` before the KV cache ran out and every in-flight task on the box got the same 500. So four concurrent agents cannot each have 64768 tokens.

The exact per-slot arithmetic is not established here and should not be guessed at: a 43000-token prompt got most of the way through, which is not what a hard 64768/4 split would predict, so the slots appear to draw on a shared pool rather than a fixed division. What is established is the shape - concurrency and context trade against each other on this box - and that is enough to say Phase 3 must measure the fixed overhead under concurrency rather than against an idle server. A number taken on a quiet box will be wrong on a busy one in the direction that matters.

The failure mode deserves recording on its own account. OpenCode retried six times over roughly five minutes and then exited 0 with an empty assistant message and no text on stdout. Only `--print-logs --log-level DEBUG` showed the 500. An agent that fails this way inside a pipeline looks like an agent that had nothing to say.

## Contention, and the error that lies about its own cause

Three agents built this port concurrently, and two of the three phases verify by running OpenCode against trillian. Four slots, three agents. What that looks like from the client is worth writing down, because it does not look like contention.

**`Context size has been exceeded` is not always about context.** The same 500 was observed on a three-token prompt. A three-token prompt cannot exceed a 64768 window, so the message is describing the state of a shared KV cache rather than the size of the request that happened to arrive while it was full. Anyone who meets this error will start by trimming their prompt, measuring their system prompt, or lowering `limit.context`, and none of those will help. The diagnostic that separates the two cases costs one command:

```
ssh trillian 'tail -1 ~/.lmstudio/server-logs/$(date +%Y-%m)/$(date +%Y-%m-%d).1.log'
```

If other slots are busy, it is contention. If the box is idle and the error persists, it is genuinely the prompt. The tell in the log is the pair of lines that precede the 500 - `failed to find free space in the KV cache` and `failed to find a memory slot for batch of size 1` - describing an allocator with nothing left to give, not a request that was too big.

**Contention presents as silent success.** The dangerous shape is not the error, it is what reaches the caller: exit 0, an empty assistant message, nothing on stdout. A `say OK` probe was also seen timing out at 30 seconds. This is the same failure the spec recorded for `nemotron-3-nano-4b` - HTTP 200 with empty content - arriving from a completely different direction, which suggests it is a property of the stack rather than of any one model. A fleet agent that fails this way has succeeded at nothing and reported success, and the handoff contract cannot help: a handoff that was never emitted is indistinguishable from an agent with nothing to report, exactly as a dropped `Blocker:` line is.

Detection has to be structural rather than behavioural, because the agent is not around to notice. Three checks, cheapest first, and the port should carry all three by Phase 7:

- **Treat empty output as failure, never as success.** An `opencode run` that exits 0 with no assistant text has failed. This is one condition and it catches the whole class.
- **Run with `--print-logs --log-level DEBUG` whenever the result will be consumed by something other than a human.** The 500 is only visible there. Without it the run is silent in both directions.
- **Require the handoff's four headings before accepting a subagent result.** A conforming handoff cannot be produced by a model that was never reached, so the format check doubles as a liveness check - which is an argument for the contract that has nothing to do with formatting.

**The practical consequence for the build, and for Phase 7.** Serialise. One `opencode run` at a time against trillian, waiting for each to return before starting the next. The plan assumed the four-slot limit constrained what the port produces at runtime rather than how many agents build it; that was wrong, because verification is itself a runtime activity. Phase 7's concurrency design should start from the measured fact that four slots do not mean four agents - they mean four slots drawing on one pool, where the fourth agent can break the other three.

Observation 4 is the exception worth knowing about: it tests config loading and never reaches the model, so it can be run while the box is saturated.

## What is configured, and where

`opencode.json` in this repository carries the provider block, both model pins and the deny rules. It carries no credential and no reference to one.

The `rzem-memory` entry lives only in `~/.config/opencode/opencode.json`, at mode 600, merged alongside the user's own servers:

```
"rzem-memory": {
  "type": "remote",
  "url": "https://memory-mcp.rzem.ai/mcp",
  "enabled": true,
  "oauth": false,
  "headers": { "Authorization": "Bearer {file:~/.config/claude-agents/memory-token}" }
}
```

`oauth: false` is load-bearing rather than decorative. `connectRemote` at `packages/opencode/src/mcp/index.ts:250-265` attaches an `McpOAuthProvider` to any remote server unless `oauth === false`, and this server advertises `/.well-known/oauth-protected-resource` naming the Keycloak realm at `https://id.rzem.ai/realms/rzem`. Leaving the default in place means a second authentication path exists next to the static bearer header, and which one authenticates is not something the config states.

`scripts/install-home.sh` renders the token and merges that entry. Verified re-runnable: a dry run reports `unchanged`, two consecutive real runs leave the file byte-identical, and after deleting both the token and the entry a third run rebuilds them with linear, pencil and openpets preserved.
